import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { initializeApp, getApps, getApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import { getAuth, initializeAuth, signOut, GoogleAuthProvider, signInWithCredential, type Auth } from 'firebase/auth';
import { initializeFirestore, getFirestore, type Firestore } from 'firebase/firestore';
import { setRandomSource } from '../domain/sharing';

// Firebase web config is public by design (it identifies the project, it is not a secret).
// Access is protected by firestore.rules; restrict this API key to the app in Google Cloud Console.
export const firebaseConfig = {
  apiKey: 'AIzaSyCGlXGlR7JgDOcCNQQmGbyEhg2mPuIZpbQ',
  authDomain: 'honeypot-834a1.firebaseapp.com',
  projectId: 'honeypot-834a1',
  appId: '1:1093994142262:web:34ae22d54101375ff69697',
};

/** Cryptographically secure random bytes (expo-crypto; chunked because of its per-call limit) */
export function secureRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1024) out.set(Crypto.getRandomBytes(Math.min(1024, n - i)), i);
  return out;
}
setRandomSource(secureRandomBytes);

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: ReturnType<typeof initializeApp> | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    try {
      // Firebase keeps the session (refresh token) in AsyncStorage; we never store Google tokens ourselves.
      const getRNPersistence = (firebaseAuth as unknown as { getReactNativePersistence?: (s: typeof AsyncStorage) => firebaseAuth.Persistence }).getReactNativePersistence;
      auth = getRNPersistence ? initializeAuth(app, { persistence: getRNPersistence(AsyncStorage) }) : getAuth(app);
    } catch {
      auth = getAuth(app);
    }
    try {
      db = initializeFirestore(app, { ignoreUndefinedProperties: true });
    } catch {
      db = getFirestore(app);
    }
  } catch (err) {
    console.warn('Firebase initialization warning:', err);
  }
}

export { app, auth, db };
export const logout = () => (auth ? signOut(auth) : Promise.resolve());

/** Sign in to Firebase with a Google ID token. Throws on failure (no silent "logged in" state). */
export async function signInWithGoogleIdToken(idToken: string) {
  if (!auth) throw new Error('Firebase Auth is not initialized');
  return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

// ---- base64url helpers (no reliance on atob/btoa) ----
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}
export function base64UrlToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9\-_]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    const n = chunk.split('').reduce((acc, ch, idx) => acc | (B64.indexOf(ch) << (18 - idx * 6)), 0);
    out.push((n >> 16) & 255);
    if (chunk.length > 2) out.push((n >> 8) & 255);
    if (chunk.length > 3) out.push(n & 255);
  }
  return Uint8Array.from(out);
}
