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
import { OnboardingModal } from './views/OnboardingModal';
import { CurrencySelect } from './ui';
import './styles.css';

const PRIMARY_TABS = [
  ['today', '✅', 'Today', Today],
  ['plan', '🗓️', 'Plan', Plans],
  ['pots', '🫙', 'Pots', Pots],
  ['stashes', '🐷', 'Stashes', Stashes],
  ['accounts', '💳', 'Accounts', Accounts],
] as const;

const REPORT_TABS = [
  ['logbook', '📜', 'Logbook', LogBook],
  ['cashflow', '📈', 'Cashflow', Cashflow],
] as const;

const ALL_TABS = [...PRIMARY_TABS, ...REPORT_TABS] as const;

function Shell({ user, demo, onExit }: { user: User | null; demo: boolean; onExit: () => void }) {
  const [tab, setTab] = useState<string>('today');
  const [showAcceptInvite, setShowAcceptInvite] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  const currentTab = ALL_TABS.find(t => t[0] === tab);
  const View = (currentTab ? currentTab[3] : Today);

  return (
    <div className="shell">
      {/* Mobile Top Header */}
      <header className="mobile-top-bar">
        <div className="mobile-header-brand" onClick={() => setTab('today')}>
          <img src="./logo.png" alt="Moneypot" className="brand-logo" />
          <span className="mobile-brand-title">Moneypot</span>
        </div>
        <button
          type="button"
          className="mobile-hamburger-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span className="hamburger-icon">{mobileMenuOpen ? '✕' : '☰'}</span>
        </button>
      </header>

      {/* Desktop / Laptop Left Navigation Sidebar */}
      <nav className="nav">
        <div className="logo">
          <img src="./logo.png" alt="Moneypot" className="brand-logo" />
          <span>Moneypot</span>
        </div>

        {/* Primary Budgeting Tabs */}
        <div className="nav-group">
          {PRIMARY_TABS.map(([id, icon, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </div>

        {/* Reports Section (Separate element in desktop left tab) */}
        <div className="nav-group nav-group-reports">
          <div className="nav-section-title">Reports</div>
          {REPORT_TABS.map(([id, icon, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </div>

        {/* App & Guide Extras (Separate element) */}
        <div className="nav-group nav-group-extras">
          <div className="nav-section-title">App & Help</div>
          <button
            type="button"
            className="nav-extra-btn"
            onClick={() => setShowHowItWorks(true)}
          >
            <span className="nav-icon">💡</span>
            <span className="nav-label">How it works</span>
          </button>
          <a
            href="./moneypot.apk"
            download="moneypot.apk"
            className="nav-extra-btn nav-download-link"
          >
            <span className="nav-icon">📱</span>
            <span className="nav-label">Download Android App</span>
          </a>
        </div>

        {/* Desktop Footer (Currency & Authentication) */}
        <div className="nav-foot">
          <label className="muted">
            Main currency{' '}
            <CurrencySelect value={settings.currency} onChange={c => setSettings({ currency: c })} />
          </label>
          <div className="muted auth-user-label">{demo ? 'Demo mode' : user?.displayName ?? user?.email}</div>
          {demo && (
            <button type="button" className="btn ghost" onClick={resetDemo}>
              Reset demo
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onExit}>
            {demo ? 'Exit demo' : 'Sign out'}
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main>
        <View />
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav">
        {PRIMARY_TABS.map(([id, icon, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'on' : ''}
            onClick={() => {
              setTab(id);
              setMobileMenuOpen(false);
            }}
          >
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
          </button>
        ))}
        {/* Reports / More button on bottom bar */}
        <button
          type="button"
          className={REPORT_TABS.some(t => t[0] === tab) || mobileMenuOpen ? 'on' : ''}
          onClick={() => setMobileMenuOpen(prev => !prev)}
        >
          <span className="nav-icon">📊</span>
          <span className="nav-label">Reports & More</span>
        </button>
      </nav>

      {/* Mobile Drawer / Slide-over Menu */}
      {mobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-menu-drawer" onClick={e => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <div className="mobile-menu-user-badge">
                <span className="user-badge-icon">{demo ? '🧪' : '👤'}</span>
                <span className="user-badge-text">
                  {demo ? 'Demo mode' : user?.displayName || user?.email}
                </span>
              </div>
              <button
                type="button"
                className="mobile-menu-close"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            <div className="mobile-menu-body">
              {/* Reports Section */}
              <div className="mobile-menu-section">
                <div className="mobile-section-heading">📊 Reports</div>
                {REPORT_TABS.map(([id, icon, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`mobile-menu-item ${tab === id ? 'active' : ''}`}
                    onClick={() => {
                      setTab(id);
                      setMobileMenuOpen(false);
                    }}
                  >
                    <span className="menu-item-icon">{icon}</span>
                    <span className="menu-item-label">{label}</span>
                    {tab === id && <span className="menu-item-check">✓</span>}
                  </button>
                ))}
              </div>

              {/* App & Guide Section */}
              <div className="mobile-menu-section">
                <div className="mobile-section-heading">📱 App & Help</div>
                <button
                  type="button"
                  className="mobile-menu-item"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowHowItWorks(true);
                  }}
                >
                  <span className="menu-item-icon">💡</span>
                  <span className="menu-item-label">How it works</span>
                </button>

                <a
                  href="./moneypot.apk"
                  download="moneypot.apk"
                  className="mobile-menu-item mobile-menu-download"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="menu-item-icon">📥</span>
                  <div className="download-label-group">
                    <span className="menu-item-label">Download Android App</span>
                    <span className="download-subtext">Native .apk package</span>
                  </div>
                </a>
              </div>

              {/* Account, Currency & Log in / Log out Section */}
              <div className="mobile-menu-section mobile-menu-auth-section">
                <div className="mobile-section-heading">⚙️ Account & Settings</div>

                <div className="mobile-currency-row">
                  <span className="muted">Main currency:</span>
                  <CurrencySelect
                    value={settings.currency}
                    onChange={c => setSettings({ currency: c })}
                  />
                </div>

                {demo && (
                  <button
                    type="button"
                    className="btn ghost wide mobile-auth-btn"
                    onClick={() => {
                      resetDemo();
                    }}
                  >
                    🔄 Reset demo data
                  </button>
                )}

                <button
                  type="button"
                  className="btn wide mobile-auth-btn mobile-logout-btn"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onExit();
                  }}
                >
                  {demo ? '🚪 Exit demo mode' : '🚪 Log out'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* "How it works" Onboarding Modal */}
      {showHowItWorks && (
        <OnboardingModal onClose={() => setShowHowItWorks(false)} />
      )}

      {/* Share / Invite Accept Modal */}
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
        {isConfigured && (
          <button className="btn wide google" onClick={() => loginGoogle().catch(e => setErr(e.message))}>
            Continue with Google
          </button>
        )}
        {discordEnabled && (
          <button className="btn wide discord" onClick={loginDiscord}>
            Continue with Discord
          </button>
        )}
        <button className="btn ghost wide" onClick={onDemo}>
          Try it without an account
        </button>
        <div className="login-apk-row" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <a href="./moneypot.apk" download="moneypot.apk" className="btn ghost wide" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span>📱</span> Download Android App (.apk)
          </a>
        </div>
        {!isConfigured && (
          <small className="muted" style={{ display: 'block', marginTop: 12 }}>
            Firebase isn't configured yet — see README. Demo saves to this browser only.
          </small>
        )}
        {err && <small className="bad" style={{ display: 'block', marginTop: 8 }}>{err}</small>}
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
  const setMode = (d: boolean) => {
    d ? localStorage.setItem('pots-mode', 'demo') : localStorage.removeItem('pots-mode');
    setDemo(d);
  };

  if (user === undefined) return <div className="login"><img src="./logo.png" alt="Moneypot" className="login-brand-logo pulse" /></div>;
  if (!user && !demo) return <Login onDemo={() => setMode(true)} />;
  return (
    <DataProvider user={user && !demo ? user : null} key={user?.uid ?? 'demo'}>
      <Shell user={user} demo={!user || demo} onExit={() => (user && !demo ? logout() : setMode(false))} />
    </DataProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
