import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_TEMPLATES, DEMO } from './defaults';
import type { Account, Category, Payment, Plan, QuickTemplate, Settings, ShareInvite, Stash, Transfer } from './types';

export const COLLS = ['accounts', 'categories', 'plans', 'stashes', 'payments', 'transfers', 'invites', 'templates'] as const;
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
  invites: ShareInvite[];
  templates: QuickTemplate[];
  settings: Settings;
}

interface Ctx extends Data {
  user: CurrentUser | null;
  save: <C extends Coll>(c: C, o: Data[C][number]) => void;
  remove: (c: Coll, id: string) => void;
  setSettings: (s: Partial<Settings>) => void;
  reorder: <C extends 'accounts' | 'categories' | 'stashes'>(c: C, items: Data[C]) => Promise<void>;
}

export function sortByOrder<T extends { id: string; order?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aOrder = typeof a.order === 'number' ? a.order : 999999;
    const bOrder = typeof b.order === 'number' ? b.order : 999999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return 0;
  });
}

export function applyTheme(theme?: 'light' | 'dark' | 'system') {
  const t = theme || (typeof localStorage !== 'undefined' ? (localStorage.getItem('moneypot-theme') as any) : null) || 'system';
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('moneypot-theme', t);
  }
  let resolved = t;
  if (t === 'system') {
    resolved = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
  }
}

const empty: Data = {
  accounts: [],
  categories: [],
  plans: [],
  stashes: [],
  payments: [],
  transfers: [],
  invites: [],
  templates: [],
  settings: {
    currency: 'EUR',
    theme: (typeof localStorage !== 'undefined' ? (localStorage.getItem('moneypot-theme') as any) : null) || 'system',
  },
};

const DataCtx = createContext<Ctx>(null!);
export const useData = () => useContext(DataCtx);
export const uid = () => crypto.randomUUID().slice(0, 12);

const LS = 'pots-demo';

export function normalizeStash(st: Stash, currentUserId?: string | null): Stash {
  const isKinkyFund = st.name?.toLowerCase().trim() === 'kinky fund';
  const isShared = isKinkyFund || Boolean(
    st.isShared ||
    (st.sharedWith && st.sharedWith.length > 0) ||
    (st.invitedEmails && st.invitedEmails.length > 0) ||
    (st.ownerId && currentUserId && st.ownerId !== currentUserId && currentUserId !== 'local')
  );
  const shouldBeInstant = !isShared;
  return {
    ...st,
    isShared,
    isInstantAccess: shouldBeInstant,
  };
}

/** User authenticated → Firestore under users/{uid}. Otherwise local demo mode (localStorage). */
export function DataProvider({ user, children }: { user: CurrentUser | null; children: ReactNode }) {
  const userId = user?.uid ?? null;
  const [data, setData] = useState<Data>(empty);

  useEffect(() => {
    applyTheme(data.settings.theme);
  }, [data.settings.theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (data.settings.theme === 'system' || !data.settings.theme) {
        applyTheme('system');
      }
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [data.settings.theme]);

  useEffect(() => {
    if (!userId || !db) {
      const saved = localStorage.getItem(LS);
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed) {
        if (parsed.stashes?.length) {
          parsed.stashes = parsed.stashes.map((s: Stash) => normalizeStash(s, 'local'));
        }
        if (parsed.accounts) parsed.accounts = sortByOrder(parsed.accounts);
        if (parsed.categories) parsed.categories = sortByOrder(parsed.categories);
        if (parsed.stashes) parsed.stashes = sortByOrder(parsed.stashes);
      }
      setData(
        parsed
          ? { ...empty, ...parsed, templates: parsed.templates?.length ? parsed.templates : DEFAULT_TEMPLATES }
          : { ...empty, ...DEMO, categories: sortByOrder(DEFAULT_CATEGORIES), accounts: sortByOrder(DEMO.accounts), stashes: sortByOrder(DEMO.stashes) }
      );
      return;
    }
    const base = doc(db, 'users', userId);
    // first login → seed boilerplate categories + cash account + quick templates
    getDoc(base).then(async s => {
      if (s.exists()) return;
      const b = writeBatch(db!);
      b.set(base, { currency: 'EUR', createdAt: Date.now() });
      DEFAULT_CATEGORIES.forEach((c, idx) => b.set(doc(base, 'categories', c.id), { ...c, order: idx, ownerId: userId }));
      DEFAULT_ACCOUNTS.forEach((a, idx) => b.set(doc(base, 'accounts', a.id), { ...a, order: idx, ownerId: userId }));
      DEFAULT_TEMPLATES.forEach(t => b.set(doc(base, 'templates', t.id), { ...t, ownerId: userId }));
      await b.commit();
    });

    let latestSharedPayments: Payment[] = [];
    let latestSharedTransfers: Transfer[] = [];
    let latestSharedStashes: Stash[] = [];

    const unsubs = COLLS.map(c => onSnapshot(collection(base, c), snap => {
      let docs = snap.docs.map(x => x.data());
      if (c === 'stashes') {
        docs = docs.map((x: any) => {
          const norm = normalizeStash(x, userId);
          if (x.isInstantAccess !== norm.isInstantAccess || x.isShared !== norm.isShared) {
            void setDoc(doc(db!, 'users', userId!, 'stashes', norm.id), { isInstantAccess: norm.isInstantAccess, isShared: norm.isShared }, { merge: true });
          }
          return norm;
        });
        if (latestSharedStashes.length) {
          const userEmail = user?.email?.toLowerCase();
          docs = docs.map((s: any) => {
            const remote = latestSharedStashes.find(x => x.id === s.id);
            if (remote) {
              const isParticipant = (remote.sharedWith && remote.sharedWith.map(e => e.toLowerCase()).includes(userEmail || ''))
                || remote.ownerEmail?.toLowerCase() === userEmail
                || remote.ownerId === userId;
              if (isParticipant) {
                const { accountId, ...remoteRest } = remote;
                return { ...s, ...remoteRest, isShared: true, isInstantAccess: false };
              }
            }
            return s;
          });
        }
      }
      if (c === 'accounts' || c === 'categories' || c === 'stashes') {
        docs = sortByOrder(docs as any);
      }
      setData(d => {
        const nextState: any = { ...d, [c]: docs };
        if (c === 'stashes' && latestSharedTransfers.length) {
          const curStashes: Stash[] = docs as any;
          const trMap = new Map((d.transfers || []).map(t => [t.id, t]));
          for (const st of latestSharedTransfers) {
            if (curStashes.some(s => st.fromAccountId === `stash_${s.id}` || st.fromAccountId === s.id || st.toAccountId === `stash_${s.id}` || st.toAccountId === s.id)) {
              trMap.set(st.id, st);
            }
          }
          nextState.transfers = Array.from(trMap.values());
        }
        if (c === 'transfers' && latestSharedTransfers.length) {
          const curTransfers: Transfer[] = docs as any;
          const trMap = new Map(curTransfers.map(t => [t.id, t]));
          for (const st of latestSharedTransfers) {
            if (d.stashes.some(s => st.fromAccountId === `stash_${s.id}` || st.fromAccountId === s.id || st.toAccountId === `stash_${s.id}` || st.toAccountId === s.id)) {
              trMap.set(st.id, st);
            }
          }
          nextState.transfers = Array.from(trMap.values());
        }
        if (c === 'stashes' && latestSharedPayments.length) {
          const curStashes: Stash[] = docs as any;
          const pMap = new Map((d.payments || []).map(p => [p.id, p]));
          for (const sp of latestSharedPayments) {
            if ((sp.stashId && curStashes.some(s => s.id === sp.stashId)) || (sp.accountId && curStashes.some(s => `stash_${s.id}` === sp.accountId))) {
              pMap.set(sp.id, sp);
            }
          }
          nextState.payments = Array.from(pMap.values());
        }
        return nextState;
      });
    }));
    unsubs.push(onSnapshot(base, s => {
      if (!s.exists()) return;
      const dSettings = s.data();
      const theme = dSettings.theme ?? (localStorage.getItem('moneypot-theme') as any) ?? 'system';
      applyTheme(theme);
      setData(d => ({ ...d, settings: { currency: dSettings.currency ?? 'EUR', theme } }));
    }));

    // Listen to shared activity (contributions from shared stashes and pots)
    unsubs.push(onSnapshot(collection(db, 'shared_payments'), snap => {
      const incoming = snap.docs.map(x => x.data() as Payment);
      latestSharedPayments = incoming;
      const incomingMap = new Map(incoming.map(p => [p.id, p]));
      setData(d => {
        // 1. Reconcile existing payments: update matching shared, purge deleted shared, keep personal
        const nextPayments: Payment[] = [];
        for (const p of d.payments) {
          if (incomingMap.has(p.id)) {
            nextPayments.push(incomingMap.get(p.id)!);
            incomingMap.delete(p.id);
          } else if (p.isShared) {
            // Document was previously marked shared, but is now removed from shared_payments -> purge it!
            continue;
          } else {
            nextPayments.push(p);
          }
        }
        // 2. Add remaining relevant incoming shared payments
        for (const sp of incomingMap.values()) {
          const isRelevant = (sp.stashId && d.stashes.some(s => s.id === sp.stashId))
            || (sp.accountId && d.stashes.some(s => `stash_${s.id}` === sp.accountId))
            || (sp.categoryId && d.categories.some(c => c.id === sp.categoryId));
          if (isRelevant) {
            nextPayments.push(sp);
          }
        }
        return { ...d, payments: nextPayments };
      });
    }, err => {
      console.warn('shared_payments listener error:', err.message);
    }));

    // Listen to shared stashes for bidirectional renames, target updates, and members sync
    unsubs.push(onSnapshot(collection(db, 'shared_stashes'), snap => {
      const incomingStashes = snap.docs.map(x => x.data() as Stash);
      latestSharedStashes = incomingStashes;
      if (!incomingStashes.length) return;
      setData(d => {
        const userEmail = user?.email?.toLowerCase();
        let changed = false;
        const nextStashes = d.stashes.map(s => {
          const remote = incomingStashes.find(x => x.id === s.id);
          if (remote) {
            const isParticipant = (remote.sharedWith && remote.sharedWith.map(e => e.toLowerCase()).includes(userEmail || ''))
              || remote.ownerEmail?.toLowerCase() === userEmail
              || remote.ownerId === userId;
            if (isParticipant) {
              changed = true;
              // Never overwrite local user's accountId with remote!
              const { accountId, ...remoteRest } = remote;
              return { ...s, ...remoteRest, isShared: true, isInstantAccess: false };
            }
          }
          return s;
        });

        // Add any shared stashes user participates in that are not yet in local stashes collection
        const existingIds = new Set(d.stashes.map(s => s.id));
        for (const remote of incomingStashes) {
          if (!existingIds.has(remote.id)) {
            const isParticipant = (remote.sharedWith && remote.sharedWith.map(e => e.toLowerCase()).includes(userEmail || ''))
              || remote.ownerEmail?.toLowerCase() === userEmail
              || remote.ownerId === userId;
            if (isParticipant) {
              changed = true;
              const { accountId, ...remoteRest } = remote;
              nextStashes.push({ ...remoteRest, isShared: true, isInstantAccess: false } as Stash);
            }
          }
        }

        return changed ? { ...d, stashes: nextStashes } : d;
      });
    }, err => {
      console.warn('shared_stashes listener error:', err.message);
    }));

    // Listen to shared transfers (contributions and withdrawals from shared stashes)
    unsubs.push(onSnapshot(collection(db, 'shared_transfers'), snap => {
      const incoming = snap.docs.map(x => x.data() as Transfer);
      latestSharedTransfers = incoming;
      const incomingMap = new Map(incoming.map(t => [t.id, t]));
      setData(d => {
        const nextTransfers: Transfer[] = [];
        for (const t of d.transfers) {
          if (incomingMap.has(t.id)) {
            nextTransfers.push(incomingMap.get(t.id)!);
            incomingMap.delete(t.id);
          } else if (t.isShared) {
            continue; // Purged from shared_transfers
          } else {
            nextTransfers.push(t);
          }
        }
        for (const st of incomingMap.values()) {
          nextTransfers.push(st);
        }
        return { ...d, transfers: nextTransfers };
      });
    }, err => {
      console.warn('shared_transfers listener error:', err.message);
    }));

    return () => unsubs.forEach(u => u());
  }, [userId]);

  // Auto-sync existing transfers on shared stashes and auto-heal accountId if clobbered
  useEffect(() => {
    if (!userId || !db || !data.stashes.length) return;

    // 1. Sync transfers for shared stashes
    for (const t of data.transfers) {
      if (!t.isShared) {
        const stashId = t.fromAccountId?.startsWith('stash_') ? t.fromAccountId.replace('stash_', '')
          : t.toAccountId?.startsWith('stash_') ? t.toAccountId.replace('stash_', '')
          : undefined;
        const st = stashId ? data.stashes.find(s => s.id === stashId) : undefined;
        if (st && ((st.sharedWith && st.sharedWith.length > 0) || (st.ownerId && st.ownerId !== userId))) {
          const sharedT = { ...t, isShared: true };
          void setDoc(doc(db, 'shared_transfers', t.id), sharedT);
          if (st.ownerId && st.ownerId !== userId) {
            void setDoc(doc(db, 'users', st.ownerId, 'transfers', t.id), sharedT);
          }
        }
      }
    }

    // 2. Auto-heal owner stash accountId if missing or invalid
    if (data.accounts.length > 0) {
      for (const s of data.stashes) {
        const isOwner = !s.ownerId || s.ownerId === userId;
        if (isOwner) {
          const hasValidAcc = s.accountId && data.accounts.some(a => a.id === s.accountId);
          if (!hasValidAcc) {
            const fundingTransfer = data.transfers.find(t =>
              (t.toAccountId === `stash_${s.id}` || t.toAccountId === s.id) &&
              data.accounts.some(a => a.id === t.fromAccountId)
            );
            const recoveredAccId = fundingTransfer?.fromAccountId || data.accounts[0]?.id;
            if (recoveredAccId) {
              void setDoc(doc(db, 'users', userId, 'stashes', s.id), { accountId: recoveredAccId }, { merge: true });
            }
          }
        }
      }
    }
  }, [userId, data.stashes, data.transfers, data.accounts]);

  // persist demo mode
  useEffect(() => { if (!userId && data.categories.length) localStorage.setItem(LS, JSON.stringify(data)); }, [data, userId]);

  const local = !userId || !db;
  const ctx: Ctx = {
    ...data,
    user,
    save: (c, raw) => {
      const o: any = { ...raw, ownerId: (raw as any).ownerId ?? userId ?? 'local' };
      if (c === 'payments' || c === 'transfers') {
        if (!o.contributorEmail && user?.email) o.contributorEmail = user.email;
        if (!o.contributorName) {
          o.contributorName = user?.displayName ?? (user?.email ? user.email.split('@')[0] : undefined);
        }
      }
      if (c === 'stashes') {
        const norm = normalizeStash(o, userId);
        o.isInstantAccess = norm.isInstantAccess;
      }
      if (local) {
        if (c === 'payments') {
          const stashId = o.stashId || (o.accountId?.startsWith('stash_') ? o.accountId.replace('stash_', '') : undefined);
          const st = data.stashes.find(s => s.id === stashId);
          const cat = data.categories.find(k => k.id === o.categoryId);
          if (st?.sharedWith?.length || cat?.sharedWith?.length) {
            o.isShared = true;
          }
        }
        if (c === 'transfers') {
          const stashId = o.fromAccountId?.startsWith('stash_') ? o.fromAccountId.replace('stash_', '')
            : o.toAccountId?.startsWith('stash_') ? o.toAccountId.replace('stash_', '')
            : undefined;
          const st = stashId ? data.stashes.find(s => s.id === stashId) : undefined;
          if (st?.sharedWith?.length || (st?.ownerId && st.ownerId !== userId)) {
            o.isShared = true;
          }
        }
        setData(d => ({ ...d, [c]: [...(d[c] as { id: string }[]).filter(x => x.id !== o.id), o] }));
      } else {
        void setDoc(doc(db!, 'users', userId!, c, o.id), o);
        // If it's a payment on a shared stash or category, sync to shared_payments & owner
        if (c === 'payments') {
          const stashId = o.stashId || (o.accountId?.startsWith('stash_') ? o.accountId.replace('stash_', '') : undefined);
          const st = data.stashes.find(s => s.id === stashId);
          const cat = data.categories.find(k => k.id === o.categoryId);
          const isSharedStash = st && (st.sharedWith?.length || (st.ownerId && st.ownerId !== userId));
          const isSharedCat = cat && (cat.sharedWith?.length || (cat.ownerId && cat.ownerId !== userId));
          if (isSharedStash || isSharedCat) {
            o.isShared = true;
            void setDoc(doc(db!, 'shared_payments', o.id), o);
            if (st?.ownerId && st.ownerId !== userId) {
              void setDoc(doc(db!, 'users', st.ownerId, 'payments', o.id), o);
            }
            if (cat?.ownerId && cat.ownerId !== userId) {
              void setDoc(doc(db!, 'users', cat.ownerId, 'payments', o.id), o);
            }
          }
        }
        // If it's a transfer involving a shared stash, sync to shared_transfers & owner
        if (c === 'transfers') {
          const stashId = o.fromAccountId?.startsWith('stash_') ? o.fromAccountId.replace('stash_', '')
            : o.toAccountId?.startsWith('stash_') ? o.toAccountId.replace('stash_', '')
            : undefined;
          const st = stashId ? data.stashes.find(s => s.id === stashId) : undefined;
          const isSharedStash = Boolean(st && ((st.sharedWith && st.sharedWith.length > 0) || (st.ownerId && st.ownerId !== userId)));
          if (isSharedStash) {
            o.isShared = true;
            void setDoc(doc(db!, 'shared_transfers', o.id), o);
            if (st?.ownerId && st.ownerId !== userId) {
              void setDoc(doc(db!, 'users', st.ownerId, 'transfers', o.id), o);
            }
          }
        }
        // If updating a shared stash or category, sync to shared collections and master owner
        if (c === 'stashes') {
          const isShared = (o.sharedWith && o.sharedWith.length > 0) || (o.ownerId && o.ownerId !== userId);
          if (isShared) {
            // Strip out accountId from shared_stashes so members never overwrite each other's accounts
            const { accountId, ...sharedStashData } = o;
            void setDoc(doc(db!, 'shared_stashes', o.id), sharedStashData, { merge: true });
          }
          if (o.ownerId && o.ownerId !== userId) {
            // Collaborator updating owner stash: never overwrite master owner's accountId!
            const { accountId, ...safeOwnerStash } = o;
            void setDoc(doc(db!, 'users', o.ownerId, 'stashes', o.id), safeOwnerStash, { merge: true });
          }
        }
        if (c === 'categories' && o.ownerId && o.ownerId !== userId) {
          void setDoc(doc(db!, 'users', o.ownerId, 'categories', o.id), o, { merge: true });
        }
      }
    },
    remove: (c, id) => {
      if (local) {
        setData(d => ({ ...d, [c]: (d[c] as { id: string }[]).filter(x => x.id !== id) }));
      } else {
        void deleteDoc(doc(db!, 'users', userId!, c, id));
        if (c === 'payments') {
          void deleteDoc(doc(db!, 'shared_payments', id));
          const p = data.payments.find(x => x.id === id);
          if (p) {
            const st = data.stashes.find(s => s.id === p.stashId || `stash_${s.id}` === p.accountId);
            if (st?.ownerId && st.ownerId !== userId) {
              void deleteDoc(doc(db!, 'users', st.ownerId, 'payments', id));
            }
          }
        }
        if (c === 'transfers') {
          void deleteDoc(doc(db!, 'shared_transfers', id));
          const t = data.transfers.find(x => x.id === id);
          if (t) {
            const stashId = t.fromAccountId?.startsWith('stash_') ? t.fromAccountId.replace('stash_', '')
              : t.toAccountId?.startsWith('stash_') ? t.toAccountId.replace('stash_', '')
              : undefined;
            const st = stashId ? data.stashes.find(s => s.id === stashId) : undefined;
            if (st?.ownerId && st.ownerId !== userId) {
              void deleteDoc(doc(db!, 'users', st.ownerId, 'transfers', id));
            }
          }
        }
        if (c === 'stashes') {
          void deleteDoc(doc(db!, 'shared_stashes', id));
        }
      }
    },
    setSettings: s => {
      if (s.theme) applyTheme(s.theme);
      setData(d => ({ ...d, settings: { ...d.settings, ...s } }));
      if (local) {
        const saved = localStorage.getItem(LS);
        const parsed = saved ? JSON.parse(saved) : {};
        parsed.settings = { ...(parsed.settings || {}), ...s };
        localStorage.setItem(LS, JSON.stringify(parsed));
      } else if (userId && db) {
        void setDoc(doc(db, 'users', userId), s, { merge: true });
      }
    },
    reorder: async <C extends 'accounts' | 'categories' | 'stashes'>(c: C, items: Data[C]) => {
      const ordered = items.map((item, index) => ({ ...item, order: index })) as Data[C];
      setData(d => ({ ...d, [c]: ordered }));
      if (local) {
        const saved = localStorage.getItem(LS);
        const parsed = saved ? JSON.parse(saved) : {};
        parsed[c] = ordered;
        localStorage.setItem(LS, JSON.stringify(parsed));
      } else if (userId && db) {
        const b = writeBatch(db);
        for (const item of ordered) {
          b.set(doc(db, 'users', userId, c, (item as any).id), { order: (item as any).order }, { merge: true });
        }
        await b.commit();
      }
    },
  };
  return <DataCtx.Provider value={ctx}>{children}</DataCtx.Provider>;
}

export const resetDemo = () => { localStorage.removeItem(LS); location.reload(); };
