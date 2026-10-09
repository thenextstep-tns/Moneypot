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
  setSettings: (s: Settings) => void;
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
  settings: { currency: 'EUR' },
};

const DataCtx = createContext<Ctx>(null!);
export const useData = () => useContext(DataCtx);
export const uid = () => crypto.randomUUID().slice(0, 12);

const LS = 'pots-demo';

export function normalizeStash(st: Stash, currentUserId?: string | null): Stash {
  const isKinkyFund = st.name?.toLowerCase().trim() === 'kinky fund';
  const isShared = isKinkyFund || Boolean(
    (st.sharedWith && st.sharedWith.length > 0) ||
    (st.invitedEmails && st.invitedEmails.length > 0) ||
    (st.ownerId && currentUserId && st.ownerId !== currentUserId && currentUserId !== 'local')
  );
  const shouldBeInstant = !isShared;
  return {
    ...st,
    isInstantAccess: shouldBeInstant,
  };
}

/** User authenticated → Firestore under users/{uid}. Otherwise local demo mode (localStorage). */
export function DataProvider({ user, children }: { user: CurrentUser | null; children: ReactNode }) {
  const userId = user?.uid ?? null;
  const [data, setData] = useState<Data>(empty);

  useEffect(() => {
    if (!userId || !db) {
      const saved = localStorage.getItem(LS);
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed?.stashes?.length) {
        parsed.stashes = parsed.stashes.map((s: Stash) => normalizeStash(s, 'local'));
      }
      setData(parsed ? { ...empty, ...parsed, templates: parsed.templates?.length ? parsed.templates : DEFAULT_TEMPLATES } : { ...empty, categories: DEFAULT_CATEGORIES, ...DEMO });
      return;
    }
    const base = doc(db, 'users', userId);
    // first login → seed boilerplate categories + cash account + quick templates
    getDoc(base).then(async s => {
      if (s.exists()) return;
      const b = writeBatch(db!);
      b.set(base, { currency: 'EUR', createdAt: Date.now() });
      DEFAULT_CATEGORIES.forEach(c => b.set(doc(base, 'categories', c.id), { ...c, ownerId: userId }));
      DEFAULT_ACCOUNTS.forEach(a => b.set(doc(base, 'accounts', a.id), { ...a, ownerId: userId }));
      DEFAULT_TEMPLATES.forEach(t => b.set(doc(base, 'templates', t.id), { ...t, ownerId: userId }));
      await b.commit();
    });
    const unsubs = COLLS.map(c => onSnapshot(collection(base, c), snap => {
      let docs = snap.docs.map(x => x.data());
      if (c === 'stashes') {
        docs = docs.map((x: any) => {
          const norm = normalizeStash(x, userId);
          if (x.isInstantAccess !== norm.isInstantAccess) {
            void setDoc(doc(db!, 'users', userId!, 'stashes', norm.id), { isInstantAccess: norm.isInstantAccess }, { merge: true });
          }
          return norm;
        });
      }
      setData(d => ({ ...d, [c]: docs }));
    }));
    unsubs.push(onSnapshot(base, s => s.exists() && setData(d => ({ ...d, settings: { currency: s.data().currency ?? 'EUR' } }))));

    // Listen to shared activity (contributions from shared stashes and pots)
    unsubs.push(onSnapshot(collection(db, 'shared_payments'), snap => {
      const incoming = snap.docs.map(x => x.data() as Payment);
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
            if (isParticipant && (remote.name !== s.name || remote.target !== s.target || remote.emoji !== s.emoji)) {
              changed = true;
              return { ...s, ...remote };
            }
          }
          return s;
        });
        return changed ? { ...d, stashes: nextStashes } : d;
      });
    }, err => {
      console.warn('shared_stashes listener error:', err.message);
    }));

    return () => unsubs.forEach(u => u());
  }, [userId]);

  // persist demo mode
  useEffect(() => { if (!userId && data.categories.length) localStorage.setItem(LS, JSON.stringify(data)); }, [data, userId]);

  const local = !userId || !db;
  const ctx: Ctx = {
    ...data,
    user,
    save: (c, raw) => {
      const o: any = { ...raw, ownerId: (raw as any).ownerId ?? userId ?? 'local' };
      if (c === 'payments') {
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
        // If updating a shared stash or category, sync to shared collections and master owner
        if (c === 'stashes') {
          const isShared = (o.sharedWith && o.sharedWith.length > 0) || (o.ownerId && o.ownerId !== userId);
          if (isShared) {
            void setDoc(doc(db!, 'shared_stashes', o.id), o, { merge: true });
          }
          if (o.ownerId && o.ownerId !== userId) {
            void setDoc(doc(db!, 'users', o.ownerId, 'stashes', o.id), o, { merge: true });
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
        if (c === 'stashes') {
          void deleteDoc(doc(db!, 'shared_stashes', id));
        }
      }
    },
    setSettings: s => local ? setData(d => ({ ...d, settings: s })) : void setDoc(doc(db!, 'users', userId!), s, { merge: true }),
  };
  return <DataCtx.Provider value={ctx}>{children}</DataCtx.Provider>;
}

export const resetDemo = () => { localStorage.removeItem(LS); location.reload(); };
