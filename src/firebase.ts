import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCustomToken, signOut } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { randomId } from './sharing';

const env = import.meta.env;
const cfg = {
  apiKey: env.VITE_FB_API_KEY,
  authDomain: env.VITE_FB_AUTH_DOMAIN,
  projectId: env.VITE_FB_PROJECT_ID,
  appId: env.VITE_FB_APP_ID,
};

export const isConfigured = !!cfg.apiKey;
const app = isConfigured ? initializeApp(cfg) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? initializeFirestore(app, { ignoreUndefinedProperties: true }) : null;

export const loginGoogle = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth!, provider);
};
export const logout = () => auth && signOut(auth);

// ---- Discord: OAuth2 code flow with a CSRF `state` → Cloud Function exchanges the code → Firebase custom token ----
// The redirect URI is the app's own folder (works on GitHub Pages sub-paths, no SPA rewrite needed).
// Register exactly this URL as a redirect in the Discord developer portal.
const appBaseUrl = () => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;
const DISCORD_STATE_KEY = 'moneypot-discord-state';
export const discordEnabled = isConfigured && !!env.VITE_DISCORD_CLIENT_ID && !!env.VITE_DISCORD_FN_URL;

export async function loginDiscord() {
  const state = randomId(32);
  sessionStorage.setItem(DISCORD_STATE_KEY, state);
  const q = new URLSearchParams({
    client_id: env.VITE_DISCORD_CLIENT_ID,
    redirect_uri: appBaseUrl(),
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'consent',
  });
  location.href = `https://discord.com/oauth2/authorize?${q}`;
}

/** True when the current URL is a Discord OAuth callback (so `?code=` is not an invite code) */
export const isDiscordCallback = () => new URLSearchParams(location.search).has('state');

export async function finishDiscordLogin() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state || !auth) return;
  const expected = sessionStorage.getItem(DISCORD_STATE_KEY);
  sessionStorage.removeItem(DISCORD_STATE_KEY);
  history.replaceState(null, '', location.pathname);
  if (!expected || expected !== state) throw new Error('Discord sign-in was not started from this browser. Please try again.');
  const r = await fetch(env.VITE_DISCORD_FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: appBaseUrl() }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.token) throw new Error(body.error || 'Discord sign-in failed. Please try again.');
  await signInWithCustomToken(auth, body.token);
}
