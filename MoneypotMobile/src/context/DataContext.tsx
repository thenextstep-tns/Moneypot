import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
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
  setSettings: (s: Partial<Settings>) => Promise<void>;
  resetDemoData: () => Promise<void>;
  reorder: <C extends 'accounts' | 'categories' | 'stashes'>(c: C, items: DataState[C]) => Promise<void>;
  isDark: boolean;
  themeMode: 'light' | 'dark' | 'system';
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
  settings: { currency: 'EUR', theme: 'system' },
};

const LS_KEY = 'pots-mobile-demo';
const AUTH_KEY = 'pots-mobile-auth';
const THEME_KEY = 'pots-mobile-theme';

export const uid = () => {
  return 'id_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
};

export { normalizeStash } from '../domain/balances';

export function sortByOrder<T extends { id: string; order?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aOrder = typeof a.order === 'number' ? a.order : 999999;
    const bOrder = typeof b.order === 'number' ? b.order : 999999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return 0;
  });
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
  const systemColorScheme = useColorScheme();
  const [user, setUserState] = useState<CurrentUser | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('Today');
  const [deepLinkAction, setDeepLinkAction] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(false);
  const [data, setData] = useState<DataState>(emptyData);
  const [loaded, setLoaded] = useState<boolean>(false);

  const themeMode = data.settings.theme ?? 'system';
  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemColorScheme === 'dark');

  // Load initial demo/auth/theme state from AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const [storedAuth, storedTheme] = await Promise.all([
          AsyncStorage.getItem(AUTH_KEY),
          AsyncStorage.getItem(THEME_KEY),
        ]);
        if (storedTheme) {
          setData(prev => ({
            ...prev,
            settings: { ...prev.settings, theme: storedTheme as any },
          }));
        }
        if (storedAuth) {
          const parsedUser = JSON.parse(storedAuth);
          setUserState(parsedUser);
          setIsDemoMode(false);
        } else {
          setUserState(null);
          setIsDemoMode(false);
        }
      } catch (err) {
        console.warn('Error reading stored auth or theme:', err);
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
            if (parsed) {
              if (parsed.stashes?.length) {
                parsed.stashes = parsed.stashes.map((s: Stash) => normalizeStash(s, 'local'));
              }
              if (parsed.accounts) parsed.accounts = sortByOrder(parsed.accounts);
              if (parsed.categories) parsed.categories = sortByOrder(parsed.categories);
              if (parsed.stashes) parsed.stashes = sortByOrder(parsed.stashes);
            }
            setData({
              ...emptyData,
              ...parsed,
              templates: parsed.templates?.length ? parsed.templates : DEFAULT_TEMPLATES,
            });
          } else {
            setData({
              ...emptyData,
              ...DEMO,
              categories: sortByOrder(DEFAULT_CATEGORIES),
              accounts: sortByOrder(DEMO.accounts),
              stashes: sortByOrder(DEMO.stashes),
            });
          }
        } catch {
          setData({
            ...emptyData,
            ...DEMO,
            categories: sortByOrder(DEFAULT_CATEGORIES),
            accounts: sortByOrder(DEMO.accounts),
            stashes: sortByOrder(DEMO.stashes),
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
      DEFAULT_CATEGORIES.forEach((c, idx) => b.set(doc(base, 'categories', c.id), { ...c, order: idx, ownerId: userId }));
      DEFAULT_ACCOUNTS.forEach((a, idx) => b.set(doc(base, 'accounts', a.id), { ...a, order: idx, ownerId: userId }));
      DEFAULT_TEMPLATES.forEach(t => b.set(doc(base, 'templates', t.id), { ...t, ownerId: userId }));
      await b.commit();
    }).catch(err => {
      console.warn('Error initializing new user data:', err);
    });

    let latestSharedPayments: Payment[] = [];
    let latestSharedTransfers: Transfer[] = [];
    let latestSharedStashes: Stash[] = [];

    const unsubs = COLLS.map(c => onSnapshot(collection(base, c), snap => {
      let docs = snap.docs.map(x => x.data() as any);
      if (c === 'stashes') {
        docs = docs.map((x: any) => {
          const norm = normalizeStash(x, userId);
          if (x.isInstantAccess !== norm.isInstantAccess || x.isShared !== norm.isShared) {
            void setDoc(doc(db!, 'users', userId, 'stashes', norm.id), { isInstantAccess: norm.isInstantAccess, isShared: norm.isShared }, { merge: true });
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
                || remote.ownerId === user?.uid;
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
      setData(prev => {
        const nextState: any = { ...prev, [c]: docs };
        if (c === 'stashes' && latestSharedTransfers.length) {
          const curStashes: Stash[] = docs as any;
          const trMap = new Map((prev.transfers || []).map(t => [t.id, t]));
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
            if (prev.stashes.some(s => st.fromAccountId === `stash_${s.id}` || st.fromAccountId === s.id || st.toAccountId === `stash_${s.id}` || st.toAccountId === s.id)) {
              trMap.set(st.id, st);
            }
          }
          nextState.transfers = Array.from(trMap.values());
        }
        if (c === 'stashes' && latestSharedPayments.length) {
          const curStashes: Stash[] = docs as any;
          const pMap = new Map((prev.payments || []).map(p => [p.id, p]));
          for (const sp of latestSharedPayments) {
            if ((sp.stashId && curStashes.some(s => s.id === sp.stashId)) || (sp.accountId && curStashes.some(s => `stash_${s.id}` === sp.accountId))) {
              pMap.set(sp.id, sp);
            }
          }
          nextState.payments = Array.from(pMap.values());
        }
        return nextState;
      });
    }, err => {
      console.warn(`Firestore listener error on ${c}:`, err.message);
    }));

    // Listen to user settings document
    unsubs.push(onSnapshot(base, s => {
      if (s.exists()) {
        const d = s.data();
        const serverTheme = d?.theme;
        if (serverTheme) {
          AsyncStorage.setItem(THEME_KEY, serverTheme).catch(() => {});
        }
        setData(prev => ({
          ...prev,
          settings: {
            currency: d?.currency ?? 'EUR',
            theme: serverTheme ?? prev.settings.theme ?? 'system',
          },
        }));
      }
    }, err => {
      console.warn('Settings listener error:', err.message);
    }));

    // Listen to shared activity (contributions from shared stashes and pots)
    unsubs.push(onSnapshot(collection(db, 'shared_payments'), snap => {
      const incoming = snap.docs.map(x => x.data() as Payment);
      latestSharedPayments = incoming;
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
      latestSharedStashes = incomingStashes;
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
        const existingIds = new Set(prev.stashes.map(s => s.id));
        for (const remote of incomingStashes) {
          if (!existingIds.has(remote.id)) {
            const isParticipant = (remote.sharedWith && remote.sharedWith.map(e => e.toLowerCase()).includes(userEmail || ''))
              || remote.ownerEmail?.toLowerCase() === userEmail
              || remote.ownerId === user?.uid;
            if (isParticipant) {
              changed = true;
              const { accountId, ...remoteRest } = remote;
              nextStashes.push({ ...remoteRest, isShared: true, isInstantAccess: false } as Stash);
            }
          }
        }

        return changed ? { ...prev, stashes: nextStashes } : prev;
      });
    }, err => {
      console.warn('shared_stashes listener error:', err.message);
    }));

    // Listen to shared transfers (contributions and withdrawals from shared stashes)
    unsubs.push(onSnapshot(collection(db, 'shared_transfers'), snap => {
      const incoming = snap.docs.map(x => x.data() as Transfer);
      latestSharedTransfers = incoming;
      const incomingMap = new Map(incoming.map(t => [t.id, t]));
      setData(prev => {
        const nextTransfers: Transfer[] = [];
        for (const t of prev.transfers) {
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
        return { ...prev, transfers: nextTransfers };
      });
    }, err => {
      console.warn('shared_transfers listener error:', err.message);
    }));

    return () => {
      unsubs.forEach(u => u());
    };
  }, [loaded, isDemoMode, user?.uid]);

  // Auto-sync existing transfers on shared stashes and auto-heal accountId if clobbered
  useEffect(() => {
    const userId = user?.uid;
    if (!userId || !db || isDemoMode || !data.stashes.length) return;

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
  }, [user?.uid, isDemoMode, data.stashes, data.transfers, data.accounts]);

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

    if (c === 'payments' || c === 'transfers') {
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
      if (c === 'transfers') {
        const stashId = o.fromAccountId?.startsWith('stash_') ? o.fromAccountId.replace('stash_', '')
          : o.toAccountId?.startsWith('stash_') ? o.toAccountId.replace('stash_', '')
          : undefined;
        const st = stashId ? data.stashes.find(s => s.id === stashId) : undefined;
        if (st?.sharedWith?.length || (st?.ownerId && st.ownerId !== userId)) {
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
      // If it's a transfer involving a shared stash, sync to shared_transfers & owner
      if (c === 'transfers') {
        const stashId = o.fromAccountId?.startsWith('stash_') ? o.fromAccountId.replace('stash_', '')
          : o.toAccountId?.startsWith('stash_') ? o.toAccountId.replace('stash_', '')
          : undefined;
        const st = stashId ? data.stashes.find(s => s.id === stashId) : undefined;
        const isSharedStash = Boolean(st && ((st.sharedWith && st.sharedWith.length > 0) || (st.ownerId && st.ownerId !== userId)));
        if (isSharedStash) {
          o.isShared = true;
          await setDoc(doc(db!, 'shared_transfers', o.id), o);
          if (st?.ownerId && st.ownerId !== userId) {
            await setDoc(doc(db!, 'users', st.ownerId, 'transfers', o.id), o);
          }
        }
      }
      // If updating a shared stash or category, sync to shared collections and master owner
      if (c === 'stashes') {
        const isShared = Boolean((o.sharedWith && o.sharedWith.length > 0) || (o.ownerId && o.ownerId !== userId));
        if (isShared) {
          // Strip out accountId from shared_stashes so members never overwrite each other's accounts
          const { accountId, ...sharedStashData } = o;
          await setDoc(doc(db!, 'shared_stashes', o.id), sharedStashData, { merge: true });
        }
        if (o.ownerId && o.ownerId !== userId) {
          // Collaborator updating owner stash: never overwrite master owner's accountId!
          const { accountId, ...safeOwnerStash } = o;
          await setDoc(doc(db!, 'users', o.ownerId, 'stashes', o.id), safeOwnerStash, { merge: true });
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
      if (c === 'transfers') {
        await deleteDoc(doc(db!, 'shared_transfers', id));
        const t = data.transfers.find(x => x.id === id);
        if (t) {
          const stashId = t.fromAccountId?.startsWith('stash_') ? t.fromAccountId.replace('stash_', '')
            : t.toAccountId?.startsWith('stash_') ? t.toAccountId.replace('stash_', '')
            : undefined;
          const st = stashId ? data.stashes.find(s => s.id === stashId) : undefined;
          if (st?.ownerId && st.ownerId !== userId) {
            await deleteDoc(doc(db!, 'users', st.ownerId, 'transfers', id));
          }
        }
      }
      if (c === 'stashes') {
        await deleteDoc(doc(db!, 'shared_stashes', id));
      }
    }
  };

  const setSettings = async (s: Partial<Settings>): Promise<void> => {
    const userId = user?.uid;
    const local = isDemoMode || !userId || !db;
    const nextSettings = { ...data.settings, ...s };
    setData(prev => ({ ...prev, settings: nextSettings }));
    if (s.theme) {
      AsyncStorage.setItem(THEME_KEY, s.theme).catch(() => {});
    }
    if (local) {
      try {
        const stored = await AsyncStorage.getItem(LS_KEY);
        const parsed = stored ? JSON.parse(stored) : {};
        parsed.settings = nextSettings;
        await AsyncStorage.setItem(LS_KEY, JSON.stringify(parsed));
      } catch (e) {
        console.warn('AsyncStorage setSettings error:', e);
      }
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

  const reorder = async <C extends 'accounts' | 'categories' | 'stashes'>(c: C, items: DataState[C]): Promise<void> => {
    const ordered = items.map((item, index) => ({ ...item, order: index })) as DataState[C];
    setData(prev => ({ ...prev, [c]: ordered }));
    const userId = user?.uid;
    const local = isDemoMode || !userId || !db;
    if (local) {
      try {
        const stored = await AsyncStorage.getItem(LS_KEY);
        const parsed = stored ? JSON.parse(stored) : {};
        parsed[c] = ordered;
        await AsyncStorage.setItem(LS_KEY, JSON.stringify(parsed));
      } catch (e) {
        console.warn('AsyncStorage reorder error:', e);
      }
    } else {
      const b = writeBatch(db!);
      for (const item of ordered) {
        b.set(doc(db!, 'users', userId, c, (item as any).id), { order: (item as any).order }, { merge: true });
      }
      await b.commit();
    }
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
    reorder,
    isDark,
    themeMode,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
