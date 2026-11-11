import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { db, auth, logout, secureRandomBytes } from '../services/firebase';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_TEMPLATES, DEMO } from '../domain/defaults';
import { normalizeStash, withFrozenRates } from '../domain/balances';
import {
  acceptInvite as acceptInviteRemote,
  backfillRecords,
  createInvite,
  createSharedItem,
  deleteSharedItem,
  leaveSharedItem,
  mergeSharedState,
  subscribeShared,
  syncRecord,
  unsyncRecord,
  updateSharedItemData,
  type Me,
  type RecordColl,
} from '../domain/sharedSync';
import type { Account, Category, Payment, Plan, QuickTemplate, Settings, SharedItem, ShareInvite, Stash, Transfer } from '../domain/types';

export const COLLS = ['accounts', 'categories', 'plans', 'stashes', 'payments', 'transfers', 'templates'] as const;
export type Coll = typeof COLLS[number];

export interface CurrentUser {
  uid: string;
  displayName?: string | null;
  email?: string | null;
}

export interface DataState {
  accounts: Account[];
  categories: Category[];
  plans: Plan[];
  stashes: Stash[];
  payments: Payment[];
  transfers: Transfer[];
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
  pendingInviteCode: string | null;
  setPendingInviteCode: (code: string | null) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  showHowItWorks: boolean;
  setShowHowItWorks: (show: boolean) => void;
  setDemoMode: (demo: boolean) => void;
  logoutUser: () => Promise<void>;
  save: <C extends Coll>(c: C, o: DataState[C][number]) => Promise<void>;
  remove: (c: Coll, id: string) => Promise<void>;
  setSettings: (s: Partial<Settings>) => Promise<void>;
  resetDemoData: () => Promise<void>;
  reorder: <C extends 'accounts' | 'categories' | 'stashes'>(c: C, items: DataState[C]) => Promise<void>;
  isDark: boolean;
  themeMode: 'light' | 'dark' | 'system';
  canShare: boolean;
  sharedItems: SharedItem[];
  inviteToShared: (type: 'pot' | 'stash', item: Category | Stash, inviteeEmail: string) => Promise<{ code: string; invite: ShareInvite }>;
  acceptShareCode: (code: string, accountId?: string) => Promise<SharedItem>;
}

const emptyData: DataState = {
  accounts: [],
  categories: [],
  plans: [],
  stashes: [],
  payments: [],
  transfers: [],
  templates: [],
  settings: { currency: 'EUR', theme: 'system' },
};

const LS_KEY = 'pots-mobile-demo';
const LEGACY_AUTH_KEY = 'pots-mobile-auth'; // used to hold Google tokens; now removed on startup
const THEME_KEY = 'pots-mobile-theme';

export const uid = () => {
  return 'id_' + Array.from(secureRandomBytes(10)).map(b => b.toString(16).padStart(2, '0')).join('');
};

export { normalizeStash };

export function sortByOrder<T extends { id: string; order?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aOrder = typeof a.order === 'number' ? a.order : 999999;
    const bOrder = typeof b.order === 'number' ? b.order : 999999;
    return aOrder - bOrder;
  });
}

const COMPUTED = ['foreign', 'isForeignOwned'];
const SHARED_OVERLAY = ['sharedWith', 'ownerEmail', 'isShared'];
function clean<T extends object>(o: T, isSharedItem: boolean): T {
  const c = { ...o } as Record<string, unknown>;
  for (const k of COMPUTED) delete c[k];
  if (isSharedItem) for (const k of SHARED_OVERLAY) delete c[k];
  for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];
  return c as T;
}

const DataContext = createContext<DataContextValue | null>(null);

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [prefsReady, setPrefsReady] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [activeTab, setActiveTab] = useState('Today');
  const [deepLinkAction, setDeepLinkAction] = useState<string | null>(null);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [raw, setRaw] = useState<DataState>(emptyData);
  const [sharedItems, setSharedItems] = useState<SharedItem[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [sharedRecs, setSharedRecs] = useState<{ payments: Map<string, Payment[]>; transfers: Map<string, Transfer[]> }>({
    payments: new Map(),
    transfers: new Map(),
  });

  const loaded = authReady && prefsReady;
  const userId = user?.uid ?? null;
  const me: Me | null = useMemo(
    () => (userId ? { uid: userId, email: user?.email ?? null, displayName: user?.displayName ?? null } : null),
    [userId, user?.email, user?.displayName]
  );

  const report = useCallback((e: unknown) => {
    console.warn(e);
    Alert.alert("Couldn't sync a change", e instanceof Error ? e.message : String(e));
  }, []);

  const themeMode = raw.settings.theme ?? 'system';
  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemColorScheme === 'dark');

  // Signed-in user comes only from Firebase Auth (persisted securely by the SDK)
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, u => {
      setUser(u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null);
      if (u) setIsDemoMode(false);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.removeItem(LEGACY_AUTH_KEY); // drop tokens stored by older versions
        const storedTheme = await AsyncStorage.getItem(THEME_KEY);
        if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
          setRaw(prev => ({ ...prev, settings: { ...prev.settings, theme: storedTheme } }));
        }
      } catch (err) {
        console.warn('Error reading stored preferences:', err);
      } finally {
        setPrefsReady(true);
      }
    })();
  }, []);

  const setDemoMode = (demo: boolean) => setIsDemoMode(demo);

  const logoutUser = async () => {
    setIsDemoMode(false);
    setDrawerOpen(false);
    try { await logout(); } catch (e) { report(e); }
  };

  // ---- Own data (demo: AsyncStorage, signed in: Firestore users/{uid}) ----
  useEffect(() => {
    if (!loaded) return;
    if (!user && !isDemoMode) {
      setRaw(prev => ({ ...emptyData, settings: { ...emptyData.settings, theme: prev.settings.theme } }));
      return;
    }
    if (isDemoMode || !userId || !db) {
      (async () => {
        let parsed: Partial<DataState> | null = null;
        try { parsed = JSON.parse((await AsyncStorage.getItem(LS_KEY)) || 'null'); } catch { parsed = null; }
        setRaw(prev =>
          parsed
            ? {
                ...emptyData,
                ...parsed,
                settings: { ...emptyData.settings, ...parsed.settings, theme: prev.settings.theme },
                accounts: sortByOrder(parsed.accounts ?? []),
                categories: sortByOrder(parsed.categories ?? []),
                stashes: sortByOrder(parsed.stashes ?? []),
                templates: parsed.templates?.length ? parsed.templates : DEFAULT_TEMPLATES,
              }
            : {
                ...emptyData,
                ...DEMO,
                settings: { ...emptyData.settings, theme: prev.settings.theme },
                categories: sortByOrder(DEFAULT_CATEGORIES),
                accounts: sortByOrder(DEMO.accounts),
                stashes: sortByOrder(DEMO.stashes),
              }
        );
      })();
      return;
    }

    const base = doc(db, 'users', userId);
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
      .catch(err => console.warn('Error initializing new user data:', err));

    const unsubs = COLLS.map(c =>
      onSnapshot(
        collection(base, c),
        snap => {
          let docs = snap.docs.map(x => x.data()) as DataState[typeof c];
          if (c === 'accounts' || c === 'categories' || c === 'stashes') docs = sortByOrder(docs as { id: string; order?: number }[]) as DataState[typeof c];
          setRaw(prev => ({ ...prev, [c]: docs }));
        },
        err => console.warn(`Firestore listener error on ${c}:`, err.message)
      )
    );
    unsubs.push(
      onSnapshot(
        base,
        s => {
          if (!s.exists()) return;
          const d = s.data();
          if (d?.theme) AsyncStorage.setItem(THEME_KEY, d.theme).catch(() => {});
          setRaw(prev => ({ ...prev, settings: { currency: d?.currency ?? 'EUR', theme: d?.theme ?? prev.settings.theme ?? 'system' } }));
        },
        err => console.warn('Settings listener error:', err.message)
      )
    );
    return () => unsubs.forEach(u => u());
  }, [loaded, isDemoMode, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Shared items this user belongs to ----
  useEffect(() => {
    setSharedItems([]);
    setItemsLoaded(false);
    setSharedRecs({ payments: new Map(), transfers: new Map() });
    if (!me || !db || isDemoMode) return;
    return subscribeShared(db, me, {
      onItems: items => { setSharedItems(items); setItemsLoaded(true); },
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
      onError: err => console.warn('Shared listener error:', err.message),
    });
  }, [me, isDemoMode]);

  // Persist demo data (own data only)
  useEffect(() => {
    if (isDemoMode && raw.categories.length > 0) AsyncStorage.setItem(LS_KEY, JSON.stringify(raw)).catch(() => {});
  }, [raw, isDemoMode]);

  const data: DataState = useMemo(() => {
    const merged = mergeSharedState(raw, sharedItems, sharedRecs.payments, sharedRecs.transfers, isDemoMode ? null : me, itemsLoaded);
    return {
      ...raw,
      ...merged,
      stashes: sortByOrder(merged.stashes.map(s => normalizeStash(s, isDemoMode ? 'local' : userId))),
      categories: sortByOrder(merged.categories),
    };
  }, [raw, sharedItems, sharedRecs, me, itemsLoaded, userId, isDemoMode]);

  const dataRef = useRef(data);
  dataRef.current = data;
  const local = isDemoMode || !userId || !db;
  const remote = !local && me && db ? { me, db } : null;

  const writeOwn = async (c: Coll, o: { id: string }) => {
    if (local) {
      setRaw(prev => ({ ...prev, [c]: [...(prev[c] as { id: string }[]).filter(x => x.id !== o.id), o] }));
      return;
    }
    await setDoc(doc(db!, 'users', userId!, c, o.id), o);
  };

  const save = async <C extends Coll>(c: C, rawObj: DataState[C][number]): Promise<void> => {
    const cur = dataRef.current;
    const isSharedItem = (c === 'stashes' || c === 'categories') && Boolean((rawObj as Stash).sharedId);
    const o = clean({ ...rawObj, ownerId: (rawObj as { ownerId?: string }).ownerId ?? userId ?? 'local' } as Record<string, unknown> & { id: string }, isSharedItem);
    try {
      if (c === 'payments' || c === 'transfers') {
        const rec = rawObj as Payment | Transfer;
        if (!o.contributorEmail && user?.email) o.contributorEmail = user.email;
        if (!o.contributorName) o.contributorName = user?.displayName ?? (user?.email ? user.email.split('@')[0] : 'You');
        const prev = (cur[c] as (Payment | Transfer)[]).find(x => x.id === rec.id);
        const ctx = { stashes: cur.stashes, categories: cur.categories };
        if (rec.foreign) {
          if (remote) await syncRecord(remote.db, remote.me, c as RecordColl, rec, prev, ctx);
          return;
        }
        const frozen = withFrozenRates(o as Partial<Payment & Transfer>, cur.accounts, cur.stashes, cur.settings.currency) as typeof o;
        await writeOwn(c, frozen);
        if (remote) await syncRecord(remote.db, remote.me, c as RecordColl, frozen as unknown as Payment | Transfer, prev, ctx);
        return;
      }
      if (c === 'stashes') o.isInstantAccess = normalizeStash(o as unknown as Stash, userId).isInstantAccess;
      await writeOwn(c, o);
      if (isSharedItem && remote) {
        await updateSharedItemData(remote.db, (rawObj as Stash).sharedId!, c === 'stashes' ? 'stash' : 'pot', rawObj as Stash);
      }
    } catch (e) {
      report(e);
    }
  };

  const remove = async (c: Coll, id: string): Promise<void> => {
    const cur = dataRef.current;
    const ctx = { stashes: cur.stashes, categories: cur.categories };
    try {
      if (c === 'payments' || c === 'transfers') {
        const rec = (cur[c] as (Payment | Transfer)[]).find(x => x.id === id);
        if (rec && remote) await unsyncRecord(remote.db, c, rec, ctx);
        // (a legacy partner copy also lives in your own data, so fall through and delete that too)
      }
      if (c === 'stashes' || c === 'categories') {
        const item = (cur[c] as (Stash | Category)[]).find(x => x.id === id);
        if (item?.sharedId && remote) {
          if (item.isForeignOwned) await leaveSharedItem(remote.db, remote.me, item.sharedId);
          else await deleteSharedItem(remote.db, remote.me, item.sharedId);
        }
      }
      if (c === 'accounts') {
        // Detach everything that pointed at the account instead of leaving dangling references
        for (const p of cur.plans) {
          if (p.accountId === id || p.toAccountId === id) {
            await save('plans', { ...p, accountId: p.accountId === id ? undefined : p.accountId, toAccountId: p.toAccountId === id ? undefined : p.toAccountId });
          }
        }
        for (const s of cur.stashes) if (s.accountId === id && !s.isForeignOwned) await save('stashes', { ...s, accountId: undefined });
        for (const t of cur.templates) if (t.accountId === id) await save('templates', { ...t, accountId: undefined });
      }
      if (local) setRaw(prev => ({ ...prev, [c]: (prev[c] as { id: string }[]).filter(x => x.id !== id) }));
      else await deleteDoc(doc(db!, 'users', userId!, c, id));
    } catch (e) {
      report(e);
    }
  };

  const setSettings = async (s: Partial<Settings>): Promise<void> => {
    const nextSettings = { ...raw.settings, ...s };
    setRaw(prev => ({ ...prev, settings: nextSettings }));
    if (s.theme) AsyncStorage.setItem(THEME_KEY, s.theme).catch(() => {});
    if (!local) {
      try { await setDoc(doc(db!, 'users', userId!), s, { merge: true }); } catch (e) { report(e); }
    }
  };

  const resetDemoData = async (): Promise<void> => {
    await AsyncStorage.removeItem(LS_KEY);
    setRaw(prev => ({
      ...emptyData,
      ...DEMO,
      settings: { ...emptyData.settings, theme: prev.settings.theme },
      categories: sortByOrder(DEFAULT_CATEGORIES),
      accounts: sortByOrder(DEMO.accounts),
      stashes: sortByOrder(DEMO.stashes),
    }));
  };

  const reorder = async <C extends 'accounts' | 'categories' | 'stashes'>(c: C, items: DataState[C]): Promise<void> => {
    const ordered = items.map((item, index) => ({ ...item, order: index })) as DataState[C];
    if (local) {
      setRaw(prev => ({ ...prev, [c]: ordered }));
      return;
    }
    try {
      const b = writeBatch(db!);
      for (const item of ordered as (Stash | Category | Account)[]) {
        const patch: Record<string, unknown> = { order: item.order };
        if ('sharedId' in item && item.sharedId) patch.sharedId = item.sharedId;
        b.set(doc(db!, 'users', userId!, c, item.id), patch, { merge: true });
      }
      await b.commit();
    } catch (e) {
      report(e);
    }
  };

  const requireRemote = () => {
    if (!remote) throw new Error('Sign in with Google to share pots and stashes.');
    return remote;
  };

  const shareItem = async (type: 'pot' | 'stash', item: Category | Stash): Promise<string> => {
    const r = requireRemote();
    if (item.sharedId) return item.sharedId;
    const sid = await createSharedItem(r.db, r.me, type, item);
    const updated = { ...item, sharedId: sid } as Stash & Category;
    if (type === 'stash') Object.assign(updated, { isShared: true, isInstantAccess: false });
    await setDoc(doc(r.db, 'users', r.me.uid, type === 'stash' ? 'stashes' : 'categories', item.id), clean(updated, true));
    const cur = dataRef.current;
    const ctx = {
      stashes: type === 'stash' ? cur.stashes.map(s => (s.id === item.id ? (updated as Stash) : s)) : cur.stashes,
      categories: type === 'pot' ? cur.categories.map(x => (x.id === item.id ? (updated as Category) : x)) : cur.categories,
    };
    await backfillRecords(r.db, r.me, sid, cur.payments, cur.transfers, ctx);
    return sid;
  };

  const inviteToShared = async (type: 'pot' | 'stash', item: Category | Stash, email: string) => {
    const r = requireRemote();
    const sid = await shareItem(type, item);
    return createInvite(r.db, r.me, sid, type, item, email);
  };

  const acceptShareCode = async (code: string, accountId?: string): Promise<SharedItem> => {
    const r = requireRemote();
    const item = await acceptInviteRemote(r.db, r.me, code);
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
        categoryId: cur.categories.find(x => x.id === 'savings')?.id ?? cur.categories.find(x => x.kind === 'saving')?.id,
        isInstantAccess: false,
      };
      await setDoc(doc(r.db, 'users', r.me.uid, 'stashes', copy.id), clean(copy, true));
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
      await setDoc(doc(r.db, 'users', r.me.uid, 'categories', copy.id), clean(copy, true));
    }
    return item;
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
    pendingInviteCode,
    setPendingInviteCode,
    drawerOpen,
    setDrawerOpen,
    showHowItWorks,
    setShowHowItWorks,
    setDemoMode,
    logoutUser,
    save,
    remove,
    setSettings,
    resetDemoData,
    reorder,
    isDark,
    themeMode,
    canShare: Boolean(remote),
    sharedItems,
    inviteToShared,
    acceptShareCode,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
