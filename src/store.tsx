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

/** User authenticated → Firestore under users/{uid}. Otherwise local demo mode (localStorage). */
export function DataProvider({ user, children }: { user: CurrentUser | null; children: ReactNode }) {
  const userId = user?.uid ?? null;
  const [data, setData] = useState<Data>(empty);

  useEffect(() => {
    if (!userId || !db) {
      const saved = localStorage.getItem(LS);
      const parsed = saved ? JSON.parse(saved) : null;
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
    const unsubs = COLLS.map(c => onSnapshot(collection(base, c), snap =>
      setData(d => ({ ...d, [c]: snap.docs.map(x => x.data()) }))));
    unsubs.push(onSnapshot(base, s => s.exists() && setData(d => ({ ...d, settings: { currency: s.data().currency ?? 'EUR' } }))));

    // Listen to shared activity (contributions from shared stashes and pots)
    unsubs.push(onSnapshot(collection(db, 'shared_payments'), snap => {
      const incoming = snap.docs.map(x => x.data() as Payment);
      if (!incoming.length) return;
      setData(d => {
        const myMap = new Map(d.payments.map(p => [p.id, p]));
        let changed = false;
        for (const sp of incoming) {
          const isRelevant = (sp.stashId && d.stashes.some(s => s.id === sp.stashId))
            || (sp.categoryId && d.categories.some(c => c.id === sp.categoryId));
          if (isRelevant && !myMap.has(sp.id)) {
            myMap.set(sp.id, sp);
            changed = true;
          }
        }
        return changed ? { ...d, payments: Array.from(myMap.values()) } : d;
      });
    }, err => {
      console.warn('shared_payments listener error:', err.message);
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
      if (local) {
        setData(d => ({ ...d, [c]: [...(d[c] as { id: string }[]).filter(x => x.id !== o.id), o] }));
      } else {
        void setDoc(doc(db!, 'users', userId!, c, o.id), o);
        // If it's a payment on a shared stash or category, sync to shared_payments & owner
        if (c === 'payments') {
          const st = data.stashes.find(s => s.id === o.stashId);
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
        // If updating a shared stash or category, also sync to master owner
        if (c === 'stashes' && o.ownerId && o.ownerId !== userId) {
          void setDoc(doc(db!, 'users', o.ownerId, 'stashes', o.id), o, { merge: true });
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
        }
      }
    },
    setSettings: s => local ? setData(d => ({ ...d, settings: s })) : void setDoc(doc(db!, 'users', userId!), s, { merge: true }),
  };
  return <DataCtx.Provider value={ctx}>{children}</DataCtx.Provider>;
}

export const resetDemo = () => { localStorage.removeItem(LS); location.reload(); };
