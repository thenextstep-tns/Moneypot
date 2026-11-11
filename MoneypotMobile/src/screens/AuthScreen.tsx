import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Linking,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useData } from '../context/DataContext';
import { base64UrlToBytes, bytesToBase64Url, secureRandomBytes, signInWithGoogleIdToken } from '../services/firebase';
import { randomToken } from '../domain/sharing';
import { theme, useStyles, type Theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';

const GOOGLE_AUTH_URL = 'https://thenextstep-tns.github.io/Moneypot/auth-mobile.html';
const PAD_BYTES = 4096; // one-time pad for the Google ID token (JWTs are ~1–2 KB)

/*
 * Google sign-in handoff
 *  1. The app creates a random `state` and a one-time pad `key`, and opens the sign-in page with
 *     ?state=…#k=<key>. The fragment never leaves the browser.
 *  2. The page signs in with Google and returns moneypot://auth?state=…&ct=<idToken XOR key>.
 *  3. The app accepts only its own pending `state`, decrypts the token and signs in to Firebase.
 * Another app that registers the moneypot:// scheme sees only ciphertext, and a crafted link
 * can't sign the user into someone else's account (wrong/missing state).
 */
interface PendingLogin { state: string; key: Uint8Array }

function parseQueryParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return params;
  for (const pair of url.slice(qIdx + 1).split('#')[0].split('&')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    try {
      params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
    } catch {
      // ignore malformed pairs
    }
  }
  return params;
}

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { setDemoMode } = useData();
  const styles = useStyles(getStyles);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const pending = useRef<PendingLogin | null>(null);

  const handleAuthUrl = async (url: string): Promise<boolean> => {
    if (!url || !url.startsWith('moneypot://auth')) return false;
    const params = parseQueryParams(url);
    const login = pending.current;
    if (!login || !params.state || params.state !== login.state || !params.ct) {
      // Not a response to a sign-in this app started: ignore it.
      setErrorMsg('That sign-in link was not started from this app. Please try again.');
      setLoading(false);
      return false;
    }
    pending.current = null;
    try {
      const ct = base64UrlToBytes(params.ct);
      if (ct.length > login.key.length) throw new Error('Sign-in response is too long.');
      let idToken = '';
      for (let i = 0; i < ct.length; i++) idToken += String.fromCharCode(ct[i] ^ login.key[i]);
      await signInWithGoogleIdToken(idToken);
      triggerHaptic('success');
      // The signed-in user arrives through onAuthStateChanged in DataContext.
      return true;
    } catch (e) {
      console.warn('Google sign-in failed:', e);
      setErrorMsg('Google sign-in failed. Please try again.');
      return false;
    } finally {
      setLoading(false);
      try { WebBrowser.dismissAuthSession(); } catch { /* not open */ }
    }
  };

  // Deep-link callbacks (moneypot://auth?...) when the browser hands control back via an intent
  useEffect(() => {
    const sub = Linking.addEventListener('url', e => { void handleAuthUrl(e.url); });
    return () => sub.remove();
  }, []);

  const handleGoogleLogin = async () => {
    triggerHaptic('light');
    setErrorMsg('');
    setLoading(true);
    const state = randomToken(24);
    const key = secureRandomBytes(PAD_BYTES);
    pending.current = { state, key };
    const authUrl = `${GOOGLE_AUTH_URL}?state=${encodeURIComponent(state)}#k=${bytesToBase64Url(key)}`;
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, 'moneypot://auth');
      if (result.type === 'success' && result.url) {
        await handleAuthUrl(result.url);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.warn('Auth session error:', err);
      setErrorMsg('Could not open the sign-in window. Please try again.');
      setLoading(false);
    }
  };

  const handleDemoMode = () => {
    triggerHaptic('light');
    setDemoMode(true);
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
      ]}
    >
      <View style={styles.card}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.brandTitle}>Moneypot</Text>
        <Text style={styles.tagline}>
          Know where your money goes — without spreadsheets or jargon. Just tap “paid” when you pay.
        </Text>

        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.googleBtn, loading && styles.googleBtnDisabled]}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={theme.colors.brandDark} />
                <Text style={styles.loadingText}>Opening Google Sign In...</Text>
              </View>
            ) : (
              <View style={styles.googleContent}>
                <Svg width={20} height={20} viewBox="0 0 24 24">
                  <Path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <Path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <Path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <Path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </Svg>
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.demoBtn}
            onPress={handleDemoMode}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={styles.demoBtnText}>Try it without an account</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNote}>
          Sign in or create an account in one tap with your Google Account.
        </Text>
      </View>
    </View>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 32,
    alignItems: 'center',
    ...theme.shadowCard,
  },
  logo: {
    width: 72,
    height: 72,
    marginBottom: 14,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.ink,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: theme.colors.mute,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 6,
  },
  errorBanner: {
    width: '100%',
    backgroundColor: theme.colors.badLight,
    borderWidth: 1,
    borderColor: theme.colors.badLight,
    borderRadius: 12,
    padding: 10,
    marginBottom: 16,
  },
  errorText: {
    color: theme.colors.bad,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonGroup: {
    width: '100%',
    gap: 12,
  },
  googleBtn: {
    width: '100%',
    backgroundColor: theme.colors.card,
    borderWidth: 1.5,
    borderColor: theme.colors.line,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: theme.isDark ? 0.3 : 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  googleBtnDisabled: {
    opacity: 0.7,
  },
  googleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleBtnText: {
    color: theme.colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: theme.colors.mute,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 6,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.line,
  },
  dividerText: {
    fontSize: 12,
    color: theme.colors.mute,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  demoBtn: {
    width: '100%',
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  demoBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  footerNote: {
    fontSize: 11,
    color: theme.colors.mute,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 16,
  },
});
