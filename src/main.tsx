import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, discordEnabled, finishDiscordLogin, isConfigured, loginDiscord, loginGoogle, logout } from './firebase';
import { DataProvider, resetDemo, useData } from './store';
import { Today } from './views/Today';
import { Cashflow } from './views/Cashflow';
import { Pots } from './views/Pots';
import { Plans } from './views/Plans';
import { Accounts, Stashes } from './views/Money';
import { LogBook } from './views/LogBook';
import { AcceptInviteModal } from './views/SharingModal';
import { CurrencySelect } from './ui';
import './styles.css';

const TABS = [
  ['today', '✅', 'Today', Today],
  ['cashflow', '📈', 'Cashflow', Cashflow],
  ['pots', '🫙', 'Pots', Pots],
  ['plan', '🗓️', 'Plan', Plans],
  ['logbook', '📜', 'Logbook', LogBook],
  ['stashes', '🐷', 'Stashes', Stashes],
  ['accounts', '💳', 'Accounts', Accounts],
] as const;

function Shell({ user, demo, onExit }: { user: User | null; demo: boolean; onExit: () => void }) {
  const [tab, setTab] = useState<string>('today');
  const [showAcceptInvite, setShowAcceptInvite] = useState(false);
  const [inviteCodeParam, setInviteCodeParam] = useState('');
  const [inviteIdParam, setInviteIdParam] = useState('');
  const { settings, setSettings } = useData();

  useEffect(() => {
    // Check query params for invite link (?accept=ID&code=MP-XXXX-XX)
    const params = new URLSearchParams(window.location.search);
    const acceptId = params.get('accept');
    const code = params.get('code');
    if (acceptId || code) {
      setInviteIdParam(acceptId ?? '');
      setInviteCodeParam(code ?? '');
      setShowAcceptInvite(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const View = TABS.find(t => t[0] === tab)![3];

  return (
    <div className="shell">
      <nav className="nav">
        <div className="logo">
          <img src="./logo.png" alt="Moneypot" className="brand-logo" />
          <span>Moneypot</span>
        </div>
        {TABS.map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
          </button>
        ))}

        <div className="nav-foot">
          <label className="muted">Main currency <CurrencySelect value={settings.currency} onChange={c => setSettings({ currency: c })} /></label>
          <div className="muted">{demo ? 'Demo mode' : user?.displayName ?? user?.email}</div>
          {demo && <button className="btn ghost" onClick={resetDemo}>Reset demo</button>}
          <button className="btn ghost" onClick={onExit}>{demo ? 'Exit demo' : 'Sign out'}</button>
        </div>
      </nav>

      <main><View /></main>

      {showAcceptInvite && (
        <AcceptInviteModal
          initialInviteId={inviteIdParam}
          initialCode={inviteCodeParam}
          onClose={() => {
            setShowAcceptInvite(false);
            setInviteIdParam('');
            setInviteCodeParam('');
          }}
        />
      )}
    </div>
  );
}

function Login({ onDemo }: { onDemo: () => void }) {
  const [err, setErr] = useState('');
  return (
    <div className="login">
      <div className="login-card">
        <img src="./logo.png" alt="Moneypot" className="login-brand-logo" />
        <h1>Moneypot</h1>
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

  if (user === undefined) return <div className="login"><img src="./logo.png" alt="Moneypot" className="login-brand-logo pulse" /></div>;
  if (!user && !demo) return <Login onDemo={() => setMode(true)} />;
  return (
    <DataProvider user={user && !demo ? user : null} key={user?.uid ?? 'demo'}>
      <Shell user={user} demo={!user || demo} onExit={() => (user && !demo ? logout() : setMode(false))} />
    </DataProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
