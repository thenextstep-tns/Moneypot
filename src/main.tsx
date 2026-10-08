import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, discordEnabled, finishDiscordLogin, isConfigured, loginDiscord, loginGoogle, logout } from './firebase';
import { DataProvider, resetDemo, useData } from './store';
import { Today } from './views/Today';
import { Pots } from './views/Pots';
import { Plans } from './views/Plans';
import { Accounts, Stashes } from './views/Money';
import { CurrencySelect } from './ui';
import './styles.css';

const TABS = [
  ['today', '✅', 'Today', Today],
  ['pots', '🫙', 'Pots', Pots],
  ['plan', '🗓️', 'Plan', Plans],
  ['stashes', '🐷', 'Stashes', Stashes],
  ['accounts', '💳', 'Accounts', Accounts],
] as const;

function Shell({ user, demo, onExit }: { user: User | null; demo: boolean; onExit: () => void }) {
  const [tab, setTab] = useState<string>('today');
  const { settings, setSettings } = useData();
  const View = TABS.find(t => t[0] === tab)![3];
  return (
    <div className="shell">
      <nav className="nav">
        <div className="logo">🫙 Pots</div>
        {TABS.map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><span>{icon}</span>{label}</button>
        ))}
        <div className="nav-foot">
          <label className="muted">Main currency <CurrencySelect value={settings.currency} onChange={c => setSettings({ currency: c })} /></label>
          <div className="muted">{demo ? 'Demo mode' : user?.displayName ?? user?.email}</div>
          {demo && <button className="btn ghost" onClick={resetDemo}>Reset demo</button>}
          <button className="btn ghost" onClick={onExit}>{demo ? 'Exit demo' : 'Sign out'}</button>
        </div>
      </nav>
      <main><View /></main>
    </div>
  );
}

function Login({ onDemo }: { onDemo: () => void }) {
  const [err, setErr] = useState('');
  return (
    <div className="login">
      <div className="login-card">
        <div className="big">🫙</div>
        <h1>Pots</h1>
        <p>Know where your money goes — without spreadsheets or jargon. Just tap “paid” when you pay.</p>
        {isConfigured && <button className="btn wide google" onClick={() => loginGoogle().catch(e => setErr(e.message))}>Continue with Google</button>}
        {discordEnabled && <button className="btn wide discord" onClick={loginDiscord}>Continue with Discord</button>}
        <button className="btn ghost wide" onClick={onDemo}>Try it without an account</button>
        {!isConfigured && <small className="muted">Firebase isn't configured yet — see README. Demo saves to this browser only.</small>}
        {err && <small className="bad">{err}</small>}
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null | undefined>(isConfigured ? undefined : null);
  const [demo, setDemo] = useState(localStorage.getItem('pots-mode') === 'demo');
  useEffect(() => {
    if (!auth) return;
    finishDiscordLogin().catch(console.error);
    return onAuthStateChanged(auth, setUser);
  }, []);
  const setMode = (d: boolean) => { d ? localStorage.setItem('pots-mode', 'demo') : localStorage.removeItem('pots-mode'); setDemo(d); };

  if (user === undefined) return <div className="login"><div className="big">🫙</div></div>;
  if (!user && !demo) return <Login onDemo={() => setMode(true)} />;
  return (
    <DataProvider uid={user && !demo ? user.uid : null} key={user?.uid ?? 'demo'}>
      <Shell user={user} demo={!user || demo} onExit={() => (user && !demo ? logout() : setMode(false))} />
    </DataProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
