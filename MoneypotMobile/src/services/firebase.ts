import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signOut } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyCGlXGlR7JgDOcCNQQmGbyEhg2mPuIZpbQ',
  authDomain: 'honeypot-834a1.firebaseapp.com',
  projectId: 'honeypot-834a1',
  appId: '1:1093994142262:web:34ae22d54101375ff69697',
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: any = null;
let auth: any = null;
let db: any = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
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
export const logout = () => auth && signOut(auth);
