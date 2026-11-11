import {
  FieldPath,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { Account, Category, Payment, SharedItem, ShareInvite, Stash, Transfer } from './types';
import { findStashByRef } from './balances';
import { INVITE_TTL_MS, generateInviteCode, inviteIdForCode, randomId } from './sharing';

/*
 * Secure sharing of pots and stashes.
 *
 *   shared_items/{sid}                       metadata + memberIds (readable by members only)
 *   shared_items/{sid}/payments/{id}         records touching the item, one per contributor record
 *   shared_items/{sid}/transfers/{id}
 *   invites/{sha256(code)}                   one-time, expiring invite (no plaintext code stored)
 *
 * Personal data stays in users/{uid} and is never written by anyone else. References to shared
 * items inside mirrored records are stored as tokens (`@sh:<sid>`), so each member maps them to
 * their own local copy. Everything else a contributor references (their accounts, private pots)
 * is replaced by `ext:` placeholders and never touches another member's balances.
 */

export const SHARED_ITEMS = 'shared_items';
export const INVITES = 'invites';
const TOKEN = '@sh:';
const tok = (sid: string) => `${TOKEN}${sid}`;
const isTok = (v?: string) => Boolean(v && v.startsWith(TOKEN));
const untok = (v: string) => v.slice(TOKEN.length);

export interface Me { uid: string; email?: string | null; displayName?: string | null }
export type RecordColl = 'payments' | 'transfers';

const STASH_FIELDS = ['name', 'emoji', 'target', 'currency', 'startAmount', 'deadline', 'subcategory'] as const;
const POT_FIELDS = ['name', 'emoji', 'color', 'kind', 'hints', 'subcategories'] as const;

/** Fields of a local pot/stash that are shared with the other members */
export function sharedDataOf(type: 'pot' | 'stash', item: Stash | Category): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of type === 'stash' ? STASH_FIELDS : POT_FIELDS) {
    const v = (item as unknown as Record<string, unknown>)[f];
    if (v !== undefined) out[f] = v;
  }
  return out;
}

const memberEmails = (it: SharedItem) =>
  it.memberIds.map(id => it.members?.[id]?.email).filter((e): e is string => Boolean(e));

// ---------------------------------------------------------------------------------------------
// Merge (pure)
// ---------------------------------------------------------------------------------------------

export interface SyncState { stashes: Stash[]; categories: Category[]; payments: Payment[]; transfers: Transfer[] }

/**
 * Overlay shared items onto the user's local copies and add other members' records.
 * `itemsLoaded` = false while the first shared_items snapshot is still pending.
 */
export function mergeSharedState(
  raw: SyncState,
  items: SharedItem[],
  sharedPayments: Map<string, Payment[]>,
  sharedTransfers: Map<string, Transfer[]>,
  me: Me | null,
  itemsLoaded: boolean
): SyncState {
  if (!me) return raw;
  const itemById = new Map(items.map(i => [i.id, i]));
  const localIdBySid = new Map<string, string>();
  const overlay = <T extends Stash | Category>(x: T, type: 'pot' | 'stash'): T | null => {
    if (!x.sharedId) return x;
    const it = itemById.get(x.sharedId);
    if (!it) {
      if (!itemsLoaded) return x;
      // The share was deleted or this user was removed: keep the local copy as a personal item.
      return { ...x, isShared: false, sharedWith: [], isForeignOwned: undefined, ...(type === 'stash' ? { isInstantAccess: (x as Stash).isInstantAccess } : {}) };
    }
    localIdBySid.set(it.id, x.id);
    const merged: Record<string, unknown> = {
      ...x,
      ...it.data,
      sharedId: it.id,
      sharedWith: memberEmails(it),
      ownerEmail: it.ownerEmail,
      ownerId: it.ownerId,
      isShared: true,
      isForeignOwned: it.ownerId !== me.uid || undefined,
    };
    if (type === 'stash') merged.isInstantAccess = false;
    return merged as unknown as T;
  };

  const stashes = raw.stashes.map(s => overlay(s, 'stash')!).filter(Boolean);
  const categories = raw.categories.map(c => overlay(c, 'pot')!).filter(Boolean);

  // Shared items without a local copy (e.g. joined on another device) appear as virtual items
  for (const it of items) {
    if (localIdBySid.has(it.id)) continue;
    localIdBySid.set(it.id, it.id);
    const base = {
      id: it.id,
      sharedId: it.id,
      ownerId: it.ownerId,
      ownerEmail: it.ownerEmail,
      sharedWith: memberEmails(it),
      isShared: true,
      isForeignOwned: it.ownerId !== me.uid || undefined,
    };
    if (it.type === 'stash') {
      stashes.push({ name: 'Shared stash', emoji: '🐷', target: 0, currency: 'EUR', startAmount: 0, ...it.data, ...base, isInstantAccess: false } as Stash);
    } else {
      categories.push({ name: 'Shared pot', emoji: '👥', color: '#2FA36B', kind: 'expense', ...it.data, ...base } as Category);
    }
  }

  const mapRef = (v: string | undefined, contributor: string): string | undefined => {
    if (!v) return v;
    if (v.startsWith(`stash_${TOKEN}`)) {
      const local = localIdBySid.get(untok(v.slice(6)));
      return local ? `stash_${local}` : `ext:${contributor}`;
    }
    if (isTok(v)) return localIdBySid.get(untok(v)) ?? `ext:${contributor}`;
    return `ext:${contributor}`;
  };
  const sharedStashCategory = (ref?: string) => {
    const s = ref ? findStashByRef(ref, stashes) : undefined;
    return s?.categoryId;
  };

  const foreignPayments = new Map<string, Payment>();
  for (const list of sharedPayments.values()) {
    for (const p of list) {
      if (!p.contributorUid || p.contributorUid === me.uid || foreignPayments.has(p.id)) continue;
      const c = p.contributorUid;
      const stashId = p.stashId && isTok(p.stashId) ? mapRef(p.stashId, c) : undefined;
      const accountId = mapRef(p.accountId, c);
      let categoryId = p.categoryId && isTok(p.categoryId) ? mapRef(p.categoryId, c) : undefined;
      if (!categoryId || categoryId.startsWith('ext:')) {
        // e.g. a member's expense paid from a shared stash: use this user's pot for that stash
        categoryId = sharedStashCategory(accountId) ?? sharedStashCategory(stashId) ?? '';
      }
      foreignPayments.set(p.id, { ...p, stashId, accountId, categoryId, toAccountId: mapRef(p.toAccountId, c), foreign: true, isShared: true });
    }
  }
  const foreignTransfers = new Map<string, Transfer>();
  for (const list of sharedTransfers.values()) {
    for (const t of list) {
      if (!t.contributorUid || t.contributorUid === me.uid || foreignTransfers.has(t.id)) continue;
      const c = t.contributorUid;
      foreignTransfers.set(t.id, {
        ...t,
        fromAccountId: mapRef(t.fromAccountId, c) ?? `ext:${c}`,
        toAccountId: mapRef(t.toAccountId, c) ?? `ext:${c}`,
        foreign: true,
        isShared: true,
      });
    }
  }

  const ownPaymentIds = new Set(raw.payments.map(p => p.id));
  const ownTransferIds = new Set(raw.transfers.map(t => t.id));
  return {
    stashes,
    categories,
    payments: [...raw.payments.map(r => markLegacyForeign(r, me)), ...[...foreignPayments.values()].filter(p => !ownPaymentIds.has(p.id))],
    transfers: [...raw.transfers.map(r => markLegacyForeign(r, me)), ...[...foreignTransfers.values()].filter(t => !ownTransferIds.has(t.id))],
  };
}

/**
 * Versions ≤ 0.9.6 copied a partner's contributions straight into the owner's own data, keeping the
 * partner's account ids. Those records belong to someone else: treat them like other members' records
 * (they change the shared stash, never this user's accounts).
 */
export function isLegacyForeignRecord(r: Payment | Transfer, me: Me): boolean {
  if (r.foreign) return true;
  if (r.contributorUid) return r.contributorUid !== me.uid;
  return Boolean(r.contributorEmail && me.email && r.contributorEmail.trim().toLowerCase() !== me.email.trim().toLowerCase());
}

function markLegacyForeign<T extends Payment | Transfer>(r: T, me: Me): T {
  return !r.foreign && isLegacyForeignRecord(r, me) ? { ...r, foreign: true, isShared: true } : r;
}

/** Name of whoever recorded a record that isn't this user's */
export const contributorLabel = (r: Pick<Payment, 'contributorName' | 'contributorEmail'>) =>
  r.contributorName || (r.contributorEmail ? r.contributorEmail.split('@')[0] : 'Another member');

/**
 * Human label for an account / stash reference on a record. Used by the log screens so a
 * partner's account never shows up as "No account".
 */
export function partyLabel(
  id: string | undefined,
  accounts: Account[],
  stashes: Stash[],
  record?: Pick<Payment, 'foreign' | 'contributorName' | 'contributorEmail'>
): string {
  if (id) {
    const acc = accounts.find(a => a.id === id);
    if (acc) return acc.name;
    const st = findStashByRef(id, stashes);
    if (st) return `${st.emoji} ${st.name} (Stash)`;
  }
  if (record?.foreign) return `${contributorLabel(record)}'s money`;
  if (!id) return 'No account';
  return id.startsWith('stash_') ? 'Deleted stash' : 'Deleted account';
}

// ---------------------------------------------------------------------------------------------
// Mirroring records
// ---------------------------------------------------------------------------------------------

interface Ctx { stashes: Stash[]; categories: Category[] }

const stashSid = (ref: string | undefined, ctx: Ctx) => findStashByRef(ref, ctx.stashes)?.sharedId;

/** Shared items a record touches */
export function sharedTargets(coll: RecordColl, r: Payment | Transfer, ctx: Ctx): string[] {
  const out = new Set<string>();
  if (coll === 'payments') {
    const p = r as Payment;
    const cat = p.categoryId ? ctx.categories.find(c => c.id === p.categoryId) : undefined;
    if (cat?.sharedId) out.add(cat.sharedId);
    const st = p.stashId ? ctx.stashes.find(s => s.id === p.stashId) : undefined;
    if (st?.sharedId) out.add(st.sharedId);
    const acc = stashSid(p.accountId, ctx);
    if (acc) out.add(acc);
  } else {
    const t = r as Transfer;
    const a = stashSid(t.fromAccountId, ctx);
    const b = stashSid(t.toAccountId, ctx);
    if (a) out.add(a);
    if (b) out.add(b);
  }
  return [...out];
}

const stripComputed = <T extends object>(o: T): T => {
  const c = { ...o } as Record<string, unknown>;
  delete c.foreign;
  for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];
  return c as T;
};

/** Canonical (member-neutral) form of a record for shared_items/{sid}/{coll} */
export function toCanonical(coll: RecordColl, r: Payment | Transfer, ctx: Ctx, me: Me): Record<string, unknown> {
  const accRef = (ref?: string) => {
    if (!ref) return ref;
    const st = findStashByRef(ref, ctx.stashes);
    if (st) return st.sharedId ? `stash_${tok(st.sharedId)}` : 'ext:stash';
    return 'ext:account';
  };
  const base = stripComputed(r) as unknown as Record<string, unknown>;
  const contributor = (r as Payment).foreign
    ? { contributorUid: r.contributorUid, contributorEmail: r.contributorEmail ?? null, contributorName: r.contributorName ?? null }
    : { contributorUid: me.uid, contributorEmail: me.email ?? null, contributorName: me.displayName ?? me.email?.split('@')[0] ?? null };
  if (coll === 'payments') {
    const p = r as Payment;
    const cat = p.categoryId ? ctx.categories.find(c => c.id === p.categoryId) : undefined;
    const st = p.stashId ? ctx.stashes.find(s => s.id === p.stashId) : undefined;
    return stripComputed({
      ...base,
      ownerId: null,
      planId: `ext:${p.planId}`,
      categoryId: cat?.sharedId ? tok(cat.sharedId) : p.categoryId ? 'ext:pot' : null,
      stashId: st?.sharedId ? tok(st.sharedId) : p.stashId ? 'ext:stash' : null,
      accountId: accRef(p.accountId) ?? null,
      toAccountId: accRef(p.toAccountId) ?? null,
      isShared: true,
      ...contributor,
    });
  }
  const t = r as Transfer;
  return stripComputed({
    ...base,
    ownerId: null,
    planId: t.planId ? `ext:${t.planId}` : null,
    fromAccountId: accRef(t.fromAccountId),
    toAccountId: accRef(t.toAccountId),
    isShared: true,
    ...contributor,
  });
}

/** Write/refresh the shared mirrors of a record and drop mirrors it no longer belongs to */
export async function syncRecord(db: Firestore, me: Me, coll: RecordColl, r: Payment | Transfer, prev: Payment | Transfer | undefined, ctx: Ctx) {
  const now = sharedTargets(coll, r, ctx);
  const before = prev ? sharedTargets(coll, prev, ctx) : [];
  const canonical = toCanonical(coll, r, ctx, me);
  await Promise.all([
    ...now.map(sid => setDoc(doc(db, SHARED_ITEMS, sid, coll, r.id), canonical)),
    ...before.filter(sid => !now.includes(sid)).map(sid => deleteDoc(doc(db, SHARED_ITEMS, sid, coll, r.id))),
  ]);
}

/** Remove the shared mirrors of a record */
export async function unsyncRecord(db: Firestore, coll: RecordColl, r: Payment | Transfer, ctx: Ctx) {
  await Promise.all(sharedTargets(coll, r, ctx).map(sid => deleteDoc(doc(db, SHARED_ITEMS, sid, coll, r.id))));
}

// ---------------------------------------------------------------------------------------------
// Items, invites, membership
// ---------------------------------------------------------------------------------------------

/** Create the shared item for a local pot/stash (owner = me). Returns its id. */
export async function createSharedItem(db: Firestore, me: Me, type: 'pot' | 'stash', item: Stash | Category): Promise<string> {
  const sid = `sh_${randomId(20)}`;
  const shared: SharedItem = {
    id: sid,
    type,
    ownerId: me.uid,
    ownerEmail: me.email ?? undefined,
    memberIds: [me.uid],
    members: { [me.uid]: { email: me.email ?? null, name: me.displayName ?? null } },
    data: sharedDataOf(type, item),
    updatedAt: Date.now(),
  };
  await setDoc(doc(db, SHARED_ITEMS, sid), stripComputed(shared));
  return sid;
}

/** Push edits of shared fields (name, target, …) to the other members */
export async function updateSharedItemData(db: Firestore, sid: string, type: 'pot' | 'stash', item: Stash | Category) {
  await updateDoc(doc(db, SHARED_ITEMS, sid), { data: sharedDataOf(type, item), updatedAt: Date.now() });
}

/** Mirror all existing records of an item when it becomes shared, so members see its history */
export async function backfillRecords(db: Firestore, me: Me, sid: string, payments: Payment[], transfers: Transfer[], ctx: Ctx) {
  const writes: [RecordColl, Payment | Transfer][] = [
    ...payments.filter(p => !p.foreign && sharedTargets('payments', p, ctx).includes(sid)).map(p => ['payments', p] as [RecordColl, Payment]),
    ...transfers.filter(t => !t.foreign && sharedTargets('transfers', t, ctx).includes(sid)).map(t => ['transfers', t] as [RecordColl, Transfer]),
  ];
  for (let i = 0; i < writes.length; i += 400) {
    const b = writeBatch(db);
    for (const [coll, r] of writes.slice(i, i + 400)) b.set(doc(db, SHARED_ITEMS, sid, coll, r.id), toCanonical(coll, r, ctx, me));
    await b.commit();
  }
}

export async function createInvite(
  db: Firestore,
  me: Me,
  sid: string,
  type: 'pot' | 'stash',
  item: Stash | Category,
  inviteeEmail: string
): Promise<{ code: string; invite: ShareInvite }> {
  const code = generateInviteCode();
  const id = await inviteIdForCode(code);
  const now = Date.now();
  const invite: ShareInvite = {
    id,
    ownerId: me.uid,
    sharedId: sid,
    targetType: type,
    targetName: item.name,
    targetEmoji: item.emoji,
    inviterEmail: me.email ?? '',
    inviterName: me.displayName ?? undefined,
    inviteeEmail: inviteeEmail.trim().toLowerCase(),
    status: 'pending',
    createdAt: now,
    expiresAt: now + INVITE_TTL_MS,
  };
  await setDoc(doc(db, INVITES, id), stripComputed(invite));
  return { code, invite };
}

export async function listPendingInvites(db: Firestore, me: Me, sid: string): Promise<ShareInvite[]> {
  const snap = await getDocs(query(collection(db, INVITES), where('ownerId', '==', me.uid), where('sharedId', '==', sid)));
  return snap.docs.map(d => d.data() as ShareInvite).filter(i => i.status === 'pending' && i.expiresAt > Date.now());
}

export async function revokeInvite(db: Firestore, inviteId: string) {
  await deleteDoc(doc(db, INVITES, inviteId));
}

export class InviteError extends Error {}
const GENERIC = 'This invite code is invalid, expired, already used, or meant for a different email address.';

/** Accept an invite code and join the shared item. Returns the joined item. */
export async function acceptInvite(db: Firestore, me: Me, code: string): Promise<SharedItem> {
  const id = await inviteIdForCode(code);
  const ref = doc(db, INVITES, id);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch {
    throw new InviteError(GENERIC);
  }
  if (!snap.exists()) throw new InviteError(GENERIC);
  const inv = snap.data() as ShareInvite;
  const myEmail = (me.email ?? '').toLowerCase();
  if (inv.status !== 'pending' || inv.expiresAt < Date.now() || (inv.inviteeEmail && inv.inviteeEmail !== myEmail)) {
    throw new InviteError(GENERIC);
  }
  if (inv.ownerId === me.uid) throw new InviteError('You created this invite — send the code to the person you want to share with.');
  try {
    await updateDoc(ref, { status: 'accepted', acceptedByUid: me.uid, acceptedByEmail: me.email ?? null, acceptedAt: Date.now() });
    await updateDoc(
      doc(db, SHARED_ITEMS, inv.sharedId),
      'memberIds', arrayUnion(me.uid),
      new FieldPath('members', me.uid), { email: me.email ?? null, name: me.displayName ?? null },
      'joinInviteId', id,
      'updatedAt', Date.now()
    );
  } catch {
    throw new InviteError(GENERIC);
  }
  const item = await getDoc(doc(db, SHARED_ITEMS, inv.sharedId));
  if (!item.exists()) throw new InviteError('The shared item no longer exists.');
  return item.data() as SharedItem;
}

/** Leave a shared item (members) */
export async function leaveSharedItem(db: Firestore, me: Me, sid: string) {
  await updateDoc(
    doc(db, SHARED_ITEMS, sid),
    'memberIds', arrayRemove(me.uid),
    new FieldPath('members', me.uid), deleteField(),
    'updatedAt', Date.now()
  );
}

/** Remove another member (owner only) */
export async function removeMember(db: Firestore, sid: string, uid: string) {
  await updateDoc(
    doc(db, SHARED_ITEMS, sid),
    'memberIds', arrayRemove(uid),
    new FieldPath('members', uid), deleteField(),
    'updatedAt', Date.now()
  );
}

/** Delete a shared item with its mirrored records and pending invites (owner only) */
export async function deleteSharedItem(db: Firestore, me: Me, sid: string) {
  for (const coll of ['payments', 'transfers'] as const) {
    const snap = await getDocs(collection(db, SHARED_ITEMS, sid, coll));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
      await b.commit();
    }
  }
  const invites = await getDocs(query(collection(db, INVITES), where('ownerId', '==', me.uid), where('sharedId', '==', sid)));
  await Promise.all(invites.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, SHARED_ITEMS, sid));
}

// ---------------------------------------------------------------------------------------------
// Listeners
// ---------------------------------------------------------------------------------------------

export interface SharedListeners {
  onItems: (items: SharedItem[]) => void;
  onRecords: (sid: string, coll: RecordColl, records: (Payment | Transfer)[]) => void;
  onRemoved: (sid: string) => void;
  onError?: (err: Error) => void;
}

/** Subscribe to the shared items this user belongs to and to their mirrored records */
export function subscribeShared(db: Firestore, me: Me, l: SharedListeners): () => void {
  const perItem = new Map<string, (() => void)[]>();
  const unsubItems = onSnapshot(
    query(collection(db, SHARED_ITEMS), where('memberIds', 'array-contains', me.uid)),
    snap => {
      const items = snap.docs.map(d => d.data() as SharedItem);
      l.onItems(items);
      const ids = new Set(items.map(i => i.id));
      for (const [sid, unsubs] of perItem) {
        if (!ids.has(sid)) {
          unsubs.forEach(u => u());
          perItem.delete(sid);
          l.onRemoved(sid);
        }
      }
      for (const sid of ids) {
        if (perItem.has(sid)) continue;
        perItem.set(
          sid,
          (['payments', 'transfers'] as const).map(coll =>
            onSnapshot(
              collection(db, SHARED_ITEMS, sid, coll),
              s => l.onRecords(sid, coll, s.docs.map(d => d.data() as Payment | Transfer)),
              err => l.onError?.(err)
            )
          )
        );
      }
    },
    err => l.onError?.(err)
  );
  return () => {
    unsubItems();
    for (const unsubs of perItem.values()) unsubs.forEach(u => u());
    perItem.clear();
  };
}
