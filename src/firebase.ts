import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCustomToken, signOut } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

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

export const loginGoogle = () => signInWithPopup(auth!, new GoogleAuthProvider());
export const logout = () => auth && signOut(auth);

// Discord: OAuth2 code flow → Cloud Function exchanges code → Firebase custom token
const discordRedirect = () => `${location.origin}/auth/discord`;
export const discordEnabled = isConfigured && !!env.VITE_DISCORD_CLIENT_ID;

export function loginDiscord() {
  const q = new URLSearchParams({ client_id: env.VITE_DISCORD_CLIENT_ID, redirect_uri: discordRedirect(), response_type: 'code', scope: 'identify' });
  location.href = `https://discord.com/oauth2/authorize?${q}`;
}

export async function finishDiscordLogin() {
  const code = new URLSearchParams(location.search).get('code');
  if (location.pathname !== '/auth/discord' || !code || !auth) return;
  history.replaceState(null, '', '/');
  const r = await fetch(`${env.VITE_DISCORD_FN_URL}?${new URLSearchParams({ code, redirect_uri: discordRedirect() })}`);
  const { token } = await r.json();
  await signInWithCustomToken(auth, token);
}
