import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_TEMPLATES, DEMO } from './defaults';
import { normalizeStash, withFrozenRates } from './balances';
import {
  acceptInvite as acceptInviteRemote,
  createInvite,
  migrateLegacyShares,
  shareLocalItem,
  deleteSharedItem,
  leaveSharedItem,
  listPendingInvites,
  mergeSharedState,
  removeMember,
  revokeInvite as revokeInviteRemote,
  subscribeShared,
  syncRecord,
  unsyncRecord,
  updateSharedItemData,
  type Me,
  type RecordColl,
} from './sharedSync';
import type { Account, Category, Payment, Plan, QuickTemplate, Settings, SharedItem, ShareInvite, Stash, Transfer } from './types';

export { normalizeStash };

export const COLLS = ['accounts', 'categories', 'plans', 'stashes', 'payments', 'transfers', 'templates'] as const;
export type Coll = typeof COLLS[number];

export interface CurrentUser {
  uid?: string;
  displayName?: string | null;
  email?: string | null;
}

interface Data {
  accounts: Account[];
  categories: Category[];
  plans: Plan[];
  stashes: Stash[];
  payments: Payment[];
  transfers: Transfer[];
  templates: QuickTemplate[];
  settings: Settings;
}

interface Ctx extends Data {
  user: CurrentUser | null;
  /** Sharing needs a signed-in account (not available in demo mode) */
  canShare: boolean;
  sharedItems: SharedItem[];
  save: <C extends Coll>(c: C, o: Data[C][number]) => void;
  remove: (c: Coll, id: string) => void;
  setSettings: (s: Partial<Settings>) => void;
  reorder: <C extends 'accounts' | 'categories' | 'stashes'>(c: C, items: Data[C]) => Promise<void>;
  /** Make a pot/stash shared (idempotent) and return its shared id */
  shareItem: (type: 'pot' | 'stash', item: Category | Stash) => Promise<string>;
  inviteToShared: (type: 'pot' | 'stash', item: Category | Stash, inviteeEmail: string) => Promise<{ code: string; invite: ShareInvite }>;
  listInvites: (sharedId: string) => Promise<ShareInvite[]>;
  revokeInvite: (inviteId: string) => Promise<void>;
  removeSharedMember: (sharedId: string, memberUid: string) => Promise<void>;
  acceptShareCode: (code: string, accountId?: string) => Promise<SharedItem>;
  error: string | null;
  clearError: () => void;
}

export function sortByOrder<T extends { id: string; order?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aOrder = typeof a.order === 'number' ? a.order : 999999;
    const bOrder = typeof b.order === 'number' ? b.order : 999999;
    return aOrder - bOrder;
  });
}

const readLS = (k: string) => {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null; } catch { return null; }
};
const writeLS = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* storage full or blocked */ }
};

export function applyTheme(theme?: 'light' | 'dark' | 'system') {
  const t = theme || (readLS('moneypot-theme') as Settings['theme']) || 'system';
  writeLS('moneypot-theme', t);
  let resolved = t;
  if (t === 'system') {
    resolved = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', resolved);
}

const empty: Data = {
  accounts: [],
  categories: [],
  plans: [],
  stashes: [],
  payments: [],
  transfers: [],
  templates: [],
  settings: { currency: 'EUR', theme: (readLS('moneypot-theme') as Settings['theme']) || 'system' },
};

const DataCtx = createContext<Ctx>(null!);
export const useData = () => useContext(DataCtx);
export const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);

const LS = 'pots-demo';

/** Computed fields that must never be written back to Firestore */
const COMPUTED = ['foreign', 'isForeignOwned'];
/** Fields of shared pots/stashes that come from the shared item (not stored on the local copy) */
const SHARED_OVERLAY = ['sharedWith', 'ownerEmail', 'isShared'];

function clean<T extends object>(o: T, isSharedItem: boolean): T {
  const c = { ...o } as Record<string, unknown>;
  for (const k of COMPUTED) delete c[k];
  if (isSharedItem) for (const k of SHARED_OVERLAY) delete c[k];
  for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];
  return c as T;
}

/** User authenticated → Firestore under users/{uid}. Otherwise local demo mode (localStorage). */
export function DataProvider({ user, children }: { user: CurrentUser | null; children: ReactNode }) {
  const userId = user?.uid ?? null;
  const me: Me | null = useMemo(
    () => (userId ? { uid: userId, email: user?.email ?? null, displayName: user?.displayName ?? null } : null),
    [userId, user?.email, user?.displayName]
  );
  const [raw, setRaw] = useState<Data>(empty);
  const [sharedItems, setSharedItems] = useState<SharedItem[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [invited, setInvited] = useState<SharedItem[]>([]);
  const [ownLoaded, setOwnLoaded] = useState<Set<string>>(new Set());
  const migrationAttempts = useRef(new Set<string>());
  const [sharedRecs, setSharedRecs] = useState<{ payments: Map<string, Payment[]>; transfers: Map<string, Transfer[]> }>({
    payments: new Map(),
    transfers: new Map(),
  });
  const [error, setError] = useState<string | null>(null);
  const report = useCallback((e: unknown) => {
    console.error(e);
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  useEffect(() => { applyTheme(raw.settings.theme); }, [raw.settings.theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (raw.settings.theme === 'system' || !raw.settings.theme) applyTheme('system'); };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [raw.settings.theme]);

  // ---- Own data ----
  useEffect(() => {
    if (!userId || !db) {
      let parsed: Partial<Data> | null = null;
      try { parsed = JSON.parse(readLS(LS) || 'null'); } catch { parsed = null; }
      setRaw(
        parsed
          ? {
              ...empty,
              ...parsed,
              accounts: sortByOrder(parsed.accounts ?? []),
              categories: sortByOrder(parsed.categories ?? []),
              stashes: sortByOrder(parsed.stashes ?? []),
              templates: parsed.templates?.length ? parsed.templates : DEFAULT_TEMPLATES,
            }
          : { ...empty, ...DEMO, categories: sortByOrder(DEFAULT_CATEGORIES), accounts: sortByOrder(DEMO.accounts), stashes: sortByOrder(DEMO.stashes) }
      );
      return;
    }
    const base = doc(db, 'users', userId);
    // first login → seed boilerplate categories + cash account + quick templates
    getDoc(base)
      .then(async s => {
        if (s.exists()) return;
        const b = writeBatch(db!);
        b.set(base, { currency: 'EUR', createdAt: Date.now() });
        DEFAULT_CATEGORIES.forEach((c, idx) => b.set(doc(base, 'categories', c.id), { ...c, order: idx, ownerId: userId }));
        DEFAULT_ACCOUNTS.forEach((a, idx) => b.set(doc(base, 'accounts', a.id), { ...a, order: idx, ownerId: userId }));
        DEFAULT_TEMPLATES.forEach(t => b.set(doc(base, 'templates', t.id), { ...t, ownerId: userId }));
        await b.commit();
      })
      .catch(report);

    const unsubs = COLLS.map(c =>
      onSnapshot(
        collection(base, c),
        snap => {
          let docs = snap.docs.map(x => x.data()) as Data[typeof c];
          if (c === 'accounts' || c === 'categories' || c === 'stashes') docs = sortByOrder(docs as { id: string; order?: number }[]) as Data[typeof c];
          setRaw(d => ({ ...d, [c]: docs }));
          setOwnLoaded(prev => (prev.has(c) ? prev : new Set(prev).add(c)));
        },
        report
      )
    );
    unsubs.push(
      onSnapshot(
        base,
        s => {
          if (!s.exists()) return;
          const d = s.data();
          const theme = d.theme ?? (readLS('moneypot-theme') as Settings['theme']) ?? 'system';
          setRaw(prev => ({ ...prev, settings: { currency: d.currency ?? 'EUR', theme } }));
        },
        report
      )
    );
    return () => unsubs.forEach(u => u());
  }, [userId, report]);

  // ---- Shared items this user belongs to ----
  useEffect(() => {
    setSharedItems([]);
    setInvited([]);
    setItemsLoaded(false);
    setOwnLoaded(new Set());
    migrationAttempts.current = new Set();
    setSharedRecs({ payments: new Map(), transfers: new Map() });
    if (!me || !db) return;
    return subscribeShared(db, me, {
      onItems: items => { setSharedItems(items); setItemsLoaded(true); },
      onInvited: setInvited,
      onRecords: (sid, coll, records) =>
        setSharedRecs(prev => {
          const next = { payments: new Map(prev.payments), transfers: new Map(prev.transfers) };
          (next[coll] as Map<string, (Payment | Transfer)[]>).set(sid, records);
          return next;
        }),
      onRemoved: sid =>
        setSharedRecs(prev => {
          const next = { payments: new Map(prev.payments), transfers: new Map(prev.transfers) };
          next.payments.delete(sid);
          next.transfers.delete(sid);
          return next;
        }),
      onError: report,
    });
  }, [me, report]);

  // Shares made with ≤ v0.9.6 move to the secure model by themselves (no re-inviting needed)
  const ownReady = ['stashes', 'categories', 'payments', 'transfers'].every(c => ownLoaded.has(c));
  useEffect(() => {
    if (!me || !db || !itemsLoaded || !ownReady) return;
    migrateLegacyShares(db, me, { stashes: raw.stashes, categories: raw.categories, payments: raw.payments, transfers: raw.transfers }, invited, migrationAttempts.current).catch(report);
  }, [me, itemsLoaded, ownReady, raw.stashes, raw.categories, raw.payments, raw.transfers, invited, report]);

  // persist demo mode (own data only)
  useEffect(() => {
    if (!userId && raw.categories.length) writeLS(LS, JSON.stringify(raw));
  }, [raw, userId]);

  // ---- Merged view ----
  const data: Data = useMemo(() => {
    const merged = mergeSharedState(raw, sharedItems, sharedRecs.payments, sharedRecs.transfers, me, itemsLoaded);
    return {
      ...raw,
      ...merged,
      stashes: sortByOrder(merged.stashes.map(s => normalizeStash(s, userId))),
      categories: sortByOrder(merged.categories),
    };
  }, [raw, sharedItems, sharedRecs, me, itemsLoaded, userId]);

  const dataRef = useRef(data);
  dataRef.current = data;

  const local = !userId || !db;

  const writeOwn = useCallback(
    (c: Coll, o: { id: string }) => {
      if (local) {
        setRaw(d => ({ ...d, [c]: [...(d[c] as { id: string }[]).filter(x => x.id !== o.id), o] }));
        return Promise.resolve();
      }
      return setDoc(doc(db!, 'users', userId!, c, o.id), o);
    },
    [local, userId]
  );

  const save: Ctx['save'] = (c, rawObj) => {
    const cur = dataRef.current;
    const isSharedItem = (c === 'stashes' || c === 'categories') && Boolean((rawObj as Stash).sharedId);
    const o = clean({ ...rawObj, ownerId: (rawObj as { ownerId?: string }).ownerId ?? userId ?? 'local' } as Record<string, unknown> & { id: string }, isSharedItem);

    if (c === 'payments' || c === 'transfers') {
      const rec = rawObj as Payment | Transfer;
      if (!o.contributorEmail && user?.email) o.contributorEmail = user.email;
      if (!o.contributorName && (user?.displayName || user?.email)) o.contributorName = user?.displayName ?? user?.email?.split('@')[0];
      const prev = (cur[c] as (Payment | Transfer)[]).find(x => x.id === rec.id);
      const ctx = { stashes: cur.stashes, categories: cur.categories };
      if (rec.foreign) {
        // Another member's record: only its shared mirror can be edited (owner of the item or its author)
        if (me && db) syncRecord(db, me, c as RecordColl, rec, prev, ctx).catch(report);
        return;
      }
      const frozen = withFrozenRates(o as Partial<Payment & Transfer>, cur.accounts, cur.stashes, cur.settings.currency) as typeof o;
      writeOwn(c, frozen).catch(report);
      if (me && db) syncRecord(db, me, c as RecordColl, frozen as unknown as Payment | Transfer, prev, ctx).catch(report);
      return;
    }

    if (c === 'stashes') {
      const norm = normalizeStash(o as unknown as Stash, userId);
      o.isInstantAccess = norm.isInstantAccess;
    }
    writeOwn(c, o).catch(report);
    if (isSharedItem && me && db) {
      updateSharedItemData(db, (rawObj as Stash).sharedId!, c === 'stashes' ? 'stash' : 'pot', rawObj as Stash).catch(report);
    }
  };

  const remove: Ctx['remove'] = (c, id) => {
    const cur = dataRef.current;
    const ctx = { stashes: cur.stashes, categories: cur.categories };
    if (c === 'payments' || c === 'transfers') {
      const rec = (cur[c] as (Payment | Transfer)[]).find(x => x.id === id);
      if (rec && me && db) unsyncRecord(db, c, rec, ctx).catch(report);
      // (a legacy partner copy also lives in your own data, so fall through and delete that too)
    }
    if (c === 'stashes' || c === 'categories') {
      const item = (cur[c] as (Stash | Category)[]).find(x => x.id === id);
      if (item?.sharedId && me && db) {
        const op = item.isForeignOwned ? leaveSharedItem(db, me, item.sharedId) : deleteSharedItem(db, me, item.sharedId);
        op.catch(report);
      }
    }
    if (c === 'accounts') {
      // Detach everything that pointed at the account instead of leaving dangling references.
      for (const p of cur.plans) {
        if (p.accountId === id || p.toAccountId === id) {
          save('plans', { ...p, accountId: p.accountId === id ? undefined : p.accountId, toAccountId: p.toAccountId === id ? undefined : p.toAccountId });
        }
      }
      for (const s of cur.stashes) if (s.accountId === id && !s.isForeignOwned) save('stashes', { ...s, accountId: undefined });
      for (const t of cur.templates) if (t.accountId === id) save('templates', { ...t, accountId: undefined });
    }
    if (local) {
      setRaw(d => ({ ...d, [c]: (d[c] as { id: string }[]).filter(x => x.id !== id) }));
    } else {
      deleteDoc(doc(db!, 'users', userId!, c, id)).catch(report);
    }
  };

  const setSettings: Ctx['setSettings'] = s => {
    if (s.theme) applyTheme(s.theme);
    setRaw(d => ({ ...d, settings: { ...d.settings, ...s } }));
    if (!local) setDoc(doc(db!, 'users', userId!), s, { merge: true }).catch(report);
  };

  const reorder: Ctx['reorder'] = async (c, items) => {
    const ordered = items.map((item, index) => ({ ...item, order: index })) as typeof items;
    if (local) {
      setRaw(d => ({ ...d, [c]: ordered }));
      return;
    }
    const b = writeBatch(db!);
    for (const item of ordered as (Stash | Category | Account)[]) {
      const patch: Record<string, unknown> = { order: item.order };
      // A shared item without a local copy yet must keep its link to the shared item
      if ('sharedId' in item && item.sharedId) patch.sharedId = item.sharedId;
      b.set(doc(db!, 'users', userId!, c, item.id), patch, { merge: true });
    }
    await b.commit().catch(report);
  };

  const requireRemote = () => {
    if (!me || !db) throw new Error('Sign in to share pots and stashes.');
    return { me, db };
  };

  const shareItem: Ctx['shareItem'] = async (type, item) => {
    const { me: m, db: d } = requireRemote();
    return shareLocalItem(d, m, type, item, dataRef.current);
  };

  const inviteToShared: Ctx['inviteToShared'] = async (type, item, email) => {
    const { me: m, db: d } = requireRemote();
    const sid = await shareItem(type, item);
    return createInvite(d, m, sid, type, item, email);
  };

  const acceptShareCode: Ctx['acceptShareCode'] = async (code, accountId) => {
    const { me: m, db: d } = requireRemote();
    const item = await acceptInviteRemote(d, m, code);
    const cur = dataRef.current;
    if (item.type === 'stash') {
      const copy: Stash = {
        id: item.id,
        sharedId: item.id,
        ownerId: item.ownerId,
        name: String(item.data.name ?? 'Shared stash'),
        emoji: String(item.data.emoji ?? '🐷'),
        target: Number(item.data.target ?? 0),
        currency: String(item.data.currency ?? cur.settings.currency),
        startAmount: Number(item.data.startAmount ?? 0),
        accountId: accountId ?? cur.accounts[0]?.id,
        categoryId: cur.categories.find(c => c.id === 'savings')?.id ?? cur.categories.find(c => c.kind === 'saving')?.id,
        isInstantAccess: false,
      };
      await setDoc(doc(d, 'users', m.uid, 'stashes', copy.id), clean(copy, true));
    } else {
      const copy: Category = {
        id: item.id,
        sharedId: item.id,
        ownerId: item.ownerId,
        name: String(item.data.name ?? 'Shared pot'),
        emoji: String(item.data.emoji ?? '👥'),
        color: String(item.data.color ?? '#2FA36B'),
        kind: (item.data.kind as Category['kind']) ?? 'expense',
      };
      await setDoc(doc(d, 'users', m.uid, 'categories', copy.id), clean(copy, true));
    }
    return item;
  };

  const ctx: Ctx = {
    ...data,
    user,
    canShare: Boolean(me && db),
    sharedItems,
    save,
    remove,
    setSettings,
    reorder,
    shareItem,
    inviteToShared,
    listInvites: async sid => { const r = requireRemote(); return listPendingInvites(r.db, r.me, sid); },
    revokeInvite: async id => { const r = requireRemote(); await revokeInviteRemote(r.db, id); },
    removeSharedMember: async (sid, memberUid) => { const r = requireRemote(); await removeMember(r.db, sid, memberUid); },
    acceptShareCode,
    error,
    clearError: () => setError(null),
  };
  return <DataCtx.Provider value={ctx}>{children}</DataCtx.Provider>;
}

export const resetDemo = () => {
  try { localStorage.removeItem(LS); } catch { /* ignore */ }
  location.reload();
};
