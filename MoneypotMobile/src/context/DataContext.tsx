import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { db, auth, logout } from '../services/firebase';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_TEMPLATES, DEMO } from '../domain/defaults';
import type { Account, Category, Payment, Plan, QuickTemplate, Settings, ShareInvite, Stash, Transfer } from '../domain/types';

export const COLLS = ['accounts', 'categories', 'plans', 'stashes', 'payments', 'transfers', 'invites', 'templates'] as const;
export type Coll = typeof COLLS[number];

export interface CurrentUser {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  isAnonymous?: boolean;
}

export interface DataState {
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

export interface DataContextValue extends DataState {
  user: CurrentUser | null;
  isDemoMode: boolean;
  loaded: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  deepLinkAction: string | null;
  setDeepLinkAction: (action: string | null) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  showHowItWorks: boolean;
  setShowHowItWorks: (show: boolean) => void;
  setDemoMode: (demo: boolean) => void;
  setUser: (user: CurrentUser | null) => void;
  logoutUser: () => Promise<void>;
  save: <C extends Coll>(c: C, o: DataState[C][number]) => Promise<void>;
  remove: (c: Coll, id: string) => Promise<void>;
  setSettings: (s: Settings) => Promise<void>;
  resetDemoData: () => Promise<void>;
}

const emptyData: DataState = {
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

const LS_KEY = 'pots-mobile-demo';
const AUTH_KEY = 'pots-mobile-auth';

export const uid = () => {
  return 'id_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
};

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

const DataContext = createContext<DataContextValue | null>(null);

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error('useData must be used within a DataProvider');
  }
  return ctx;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('Today');
  const [deepLinkAction, setDeepLinkAction] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(false);
  const [data, setData] = useState<DataState>(emptyData);
  const [loaded, setLoaded] = useState<boolean>(false);

  // Load initial demo/auth state from AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const storedAuth = await AsyncStorage.getItem(AUTH_KEY);
        if (storedAuth) {
          const parsedUser = JSON.parse(storedAuth);
          setUserState(parsedUser);
          setIsDemoMode(false);
        } else {
          setUserState(null);
          setIsDemoMode(false);
        }
      } catch (err) {
        console.warn('Error reading stored auth:', err);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const setUser = (newUser: CurrentUser | null) => {
    setUserState(newUser);
    if (newUser) {
      setIsDemoMode(false);
      AsyncStorage.setItem(AUTH_KEY, JSON.stringify(newUser)).catch(() => {});
    } else {
      setIsDemoMode(false);
      AsyncStorage.removeItem(AUTH_KEY).catch(() => {});
    }
  };

  const setDemoMode = (demo: boolean) => {
    setIsDemoMode(demo);
    if (demo) {
      setUserState(null);
      AsyncStorage.removeItem(AUTH_KEY).catch(() => {});
    }
  };

  const logoutUser = async () => {
    setUserState(null);
    setIsDemoMode(false);
    setDrawerOpen(false);
    await AsyncStorage.removeItem(AUTH_KEY).catch(() => {});
    try {
      await logout();
    } catch {}
  };

  // Sync Data according to mode (Demo vs Firebase Firestore)
  useEffect(() => {
    if (!loaded) return;

    if (!user && !isDemoMode) {
      setData(emptyData);
      return;
    }

    if (isDemoMode || !user || !db) {
      // Local Demo Mode via AsyncStorage
      (async () => {
        try {
          const saved = await AsyncStorage.getItem(LS_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed?.stashes?.length) {
              parsed.stashes = parsed.stashes.map((s: Stash) => normalizeStash(s, 'local'));
            }
            setData({
              ...emptyData,
              ...parsed,
              templates: parsed.templates?.length ? parsed.templates : DEFAULT_TEMPLATES,
            });
          } else {
            setData({
              ...emptyData,
              categories: DEFAULT_CATEGORIES,
              ...DEMO,
            });
          }
        } catch {
          setData({
            ...emptyData,
            categories: DEFAULT_CATEGORIES,
            ...DEMO,
          });
        }
      })();
      return;
    }

    // Authenticated Firestore Mode
    const userId = user.uid;
    const base = doc(db, 'users', userId);

    // Initial check: first login -> seed boilerplate categories + cash account + templates
    getDoc(base).then(async s => {
      if (s.exists()) return;
      const b = writeBatch(db!);
      b.set(base, { currency: 'EUR', createdAt: Date.now() });
      DEFAULT_CATEGORIES.forEach(c => b.set(doc(base, 'categories', c.id), { ...c, ownerId: userId }));
      DEFAULT_ACCOUNTS.forEach(a => b.set(doc(base, 'accounts', a.id), { ...a, ownerId: userId }));
      DEFAULT_TEMPLATES.forEach(t => b.set(doc(base, 'templates', t.id), { ...t, ownerId: userId }));
      await b.commit();
    }).catch(err => {
      console.warn('Error initializing new user data:', err);
    });

    const unsubs = COLLS.map(c => onSnapshot(collection(base, c), snap => {
      let docs = snap.docs.map(x => x.data() as any);
      if (c === 'stashes') {
        docs = docs.map((x: any) => {
          const norm = normalizeStash(x, userId);
          if (x.isInstantAccess !== norm.isInstantAccess) {
            void setDoc(doc(db!, 'users', userId, 'stashes', norm.id), { isInstantAccess: norm.isInstantAccess }, { merge: true });
          }
          return norm;
        });
      }
      setData(prev => ({ ...prev, [c]: docs }));
    }, err => {
      console.warn(`Firestore listener error on ${c}:`, err.message);
    }));

    // Listen to user settings document
    unsubs.push(onSnapshot(base, s => {
      if (s.exists()) {
        const d = s.data();
        setData(prev => ({ ...prev, settings: { currency: d?.currency ?? 'EUR' } }));
      }
    }, err => {
      console.warn('Settings listener error:', err.message);
    }));

    // Listen to shared activity (contributions from shared stashes and pots)
    unsubs.push(onSnapshot(collection(db, 'shared_payments'), snap => {
      const incoming = snap.docs.map(x => x.data() as Payment);
      const incomingMap = new Map(incoming.map(p => [p.id, p]));
      setData(prev => {
        // 1. Reconcile existing payments: update matching shared, purge deleted shared, keep personal
        const nextPayments: Payment[] = [];
        for (const p of prev.payments) {
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
          const isRelevant = (sp.stashId && prev.stashes.some(s => s.id === sp.stashId))
            || (sp.accountId && prev.stashes.some(s => `stash_${s.id}` === sp.accountId))
            || (sp.categoryId && prev.categories.some(c => c.id === sp.categoryId));
          if (isRelevant) {
            nextPayments.push(sp);
          }
        }
        return { ...prev, payments: nextPayments };
      });
    }, err => {
      console.warn('shared_payments listener error:', err.message);
    }));

    // Listen to shared stashes for bidirectional renames, target updates, and members sync
    unsubs.push(onSnapshot(collection(db, 'shared_stashes'), snap => {
      const incomingStashes = snap.docs.map(x => x.data() as Stash);
      if (!incomingStashes.length) return;
      setData(prev => {
        const userEmail = user?.email?.toLowerCase();
        let changed = false;
        const nextStashes = prev.stashes.map(s => {
          const remote = incomingStashes.find(x => x.id === s.id);
          if (remote) {
            const isParticipant = (remote.sharedWith && remote.sharedWith.map(e => e.toLowerCase()).includes(userEmail || ''))
              || remote.ownerEmail?.toLowerCase() === userEmail
              || remote.ownerId === user?.uid;
            if (isParticipant && (remote.name !== s.name || remote.target !== s.target || remote.emoji !== s.emoji)) {
              changed = true;
              return { ...s, ...remote };
            }
          }
          return s;
        });
        return changed ? { ...prev, stashes: nextStashes } : prev;
      });
    }, err => {
      console.warn('shared_stashes listener error:', err.message);
    }));

    return () => {
      unsubs.forEach(u => u());
    };
  }, [loaded, isDemoMode, user?.uid]);

  // Persist demo mode updates to AsyncStorage
  useEffect(() => {
    if (isDemoMode && data.categories.length > 0) {
      AsyncStorage.setItem(LS_KEY, JSON.stringify(data)).catch(() => {});
    }
  }, [data, isDemoMode]);

  const save = async <C extends Coll>(c: C, raw: DataState[C][number]): Promise<void> => {
    const userId = user?.uid;
    const local = isDemoMode || !userId || !db;
    const o: any = { ...raw, ownerId: (raw as any).ownerId ?? userId ?? 'local' };

    if (c === 'payments') {
      if (!o.contributorEmail && user?.email) o.contributorEmail = user.email;
      if (!o.contributorName) {
        o.contributorName = user?.displayName ?? (user?.email ? user.email.split('@')[0] : 'You');
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
      setData(prev => ({
        ...prev,
        [c]: [...(prev[c] as { id: string }[]).filter(x => x.id !== o.id), o],
      }));
    } else {
      await setDoc(doc(db!, 'users', userId!, c, o.id), o);
      // If it's a payment on a shared stash or category, sync to shared_payments & owner
      if (c === 'payments') {
        const stashId = o.stashId || (o.accountId?.startsWith('stash_') ? o.accountId.replace('stash_', '') : undefined);
        const st = data.stashes.find(s => s.id === stashId);
        const cat = data.categories.find(k => k.id === o.categoryId);
        const isSharedStash = Boolean(st && (st.sharedWith?.length || (st.ownerId && st.ownerId !== userId)));
        const isSharedCat = Boolean(cat && (cat.sharedWith?.length || (cat.ownerId && cat.ownerId !== userId)));
        if (isSharedStash || isSharedCat) {
          o.isShared = true;
          await setDoc(doc(db!, 'shared_payments', o.id), o);
          if (st?.ownerId && st.ownerId !== userId) {
            await setDoc(doc(db!, 'users', st.ownerId, 'payments', o.id), o);
          }
          if (cat?.ownerId && cat.ownerId !== userId) {
            await setDoc(doc(db!, 'users', cat.ownerId, 'payments', o.id), o);
          }
        }
      }
      // If updating a shared stash or category, sync to shared collections and master owner
      if (c === 'stashes') {
        const isShared = Boolean((o.sharedWith && o.sharedWith.length > 0) || (o.ownerId && o.ownerId !== userId));
        if (isShared) {
          await setDoc(doc(db!, 'shared_stashes', o.id), o, { merge: true });
        }
        if (o.ownerId && o.ownerId !== userId) {
          await setDoc(doc(db!, 'users', o.ownerId, 'stashes', o.id), o, { merge: true });
        }
      }
      if (c === 'categories' && o.ownerId && o.ownerId !== userId) {
        await setDoc(doc(db!, 'users', o.ownerId, 'categories', o.id), o, { merge: true });
      }
    }
  };

  const remove = async (c: Coll, id: string): Promise<void> => {
    const userId = user?.uid;
    const local = isDemoMode || !userId || !db;
    if (local) {
      setData(prev => ({
        ...prev,
        [c]: (prev[c] as { id: string }[]).filter(x => x.id !== id),
      }));
    } else {
      await deleteDoc(doc(db!, 'users', userId!, c, id));
      if (c === 'payments') {
        await deleteDoc(doc(db!, 'shared_payments', id));
        const p = data.payments.find(x => x.id === id);
        if (p) {
          const st = data.stashes.find(s => s.id === p.stashId || `stash_${s.id}` === p.accountId);
          if (st?.ownerId && st.ownerId !== userId) {
            await deleteDoc(doc(db!, 'users', st.ownerId, 'payments', id));
          }
        }
      }
      if (c === 'stashes') {
        await deleteDoc(doc(db!, 'shared_stashes', id));
      }
    }
  };

  const setSettings = async (s: Settings): Promise<void> => {
    const userId = user?.uid;
    const local = isDemoMode || !userId || !db;
    if (local) {
      setData(prev => ({ ...prev, settings: s }));
    } else {
      await setDoc(doc(db!, 'users', userId!), s, { merge: true });
    }
  };

  const resetDemoData = async (): Promise<void> => {
    await AsyncStorage.removeItem(LS_KEY);
    setData({
      ...emptyData,
      categories: DEFAULT_CATEGORIES,
      ...DEMO,
    });
  };

  const value: DataContextValue = {
    ...data,
    user,
    isDemoMode,
    loaded,
    activeTab,
    setActiveTab,
    deepLinkAction,
    setDeepLinkAction,
    drawerOpen,
    setDrawerOpen,
    showHowItWorks,
    setShowHowItWorks,
    setDemoMode,
    setUser,
    logoutUser,
    save,
    remove,
    setSettings,
    resetDemoData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
