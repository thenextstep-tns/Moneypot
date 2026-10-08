import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEMO } from './defaults';
import type { Account, Category, Payment, Plan, Settings, ShareInvite, Stash, Transfer } from './types';

export const COLLS = ['accounts', 'categories', 'plans', 'stashes', 'payments', 'transfers', 'invites'] as const;
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
      setData(saved ? JSON.parse(saved) : { ...empty, categories: DEFAULT_CATEGORIES, ...DEMO });
      return;
    }
    const base = doc(db, 'users', userId);
    // first login → seed boilerplate categories + cash account
    getDoc(base).then(async s => {
      if (s.exists()) return;
      const b = writeBatch(db!);
      b.set(base, { currency: 'EUR', createdAt: Date.now() });
      DEFAULT_CATEGORIES.forEach(c => b.set(doc(base, 'categories', c.id), { ...c, ownerId: userId }));
      DEFAULT_ACCOUNTS.forEach(a => b.set(doc(base, 'accounts', a.id), { ...a, ownerId: userId }));
      await b.commit();
    });
    const unsubs = COLLS.map(c => onSnapshot(collection(base, c), snap =>
      setData(d => ({ ...d, [c]: snap.docs.map(x => x.data()) }))));
    unsubs.push(onSnapshot(base, s => s.exists() && setData(d => ({ ...d, settings: { currency: s.data().currency ?? 'EUR' } }))));
    return () => unsubs.forEach(u => u());
  }, [userId]);

  // persist demo mode
  useEffect(() => { if (!userId && data.categories.length) localStorage.setItem(LS, JSON.stringify(data)); }, [data, userId]);

  const local = !userId || !db;
  const ctx: Ctx = {
    ...data,
    user,
    save: (c, raw) => {
      const o = { ...raw, ownerId: userId ?? 'local' };
      if (local) setData(d => ({ ...d, [c]: [...(d[c] as { id: string }[]).filter(x => x.id !== o.id), o] }));
      else void setDoc(doc(db!, 'users', userId!, c, o.id), o);
    },
    remove: (c, id) => local
      ? setData(d => ({ ...d, [c]: (d[c] as { id: string }[]).filter(x => x.id !== id) }))
      : void deleteDoc(doc(db!, 'users', userId!, c, id)),
    setSettings: s => local ? setData(d => ({ ...d, settings: s })) : void setDoc(doc(db!, 'users', userId!), s, { merge: true }),
  };
  return <DataCtx.Provider value={ctx}>{children}</DataCtx.Provider>;
}

export const resetDemo = () => { localStorage.removeItem(LS); location.reload(); };
