import React, { useState, useEffect } from 'react';
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
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';

const GOOGLE_AUTH_URL = 'https://thenextstep-tns.github.io/Moneypot/auth-mobile.html';

function parseQueryParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  try {
    const qIdx = url.indexOf('?');
    if (qIdx === -1) return params;
    const queryString = url.slice(qIdx + 1);
    const pairs = queryString.split('&');
    for (const pair of pairs) {
      const [key, val] = pair.split('=');
      if (key) {
        params[decodeURIComponent(key)] = decodeURIComponent(val || '');
      }
    }
  } catch (e) {
    console.warn('Error parsing params:', e);
  }
  return params;
}

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { setUser, setDemoMode } = useData();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAuthUrl = (url: string) => {
    try {
      if (!url || !url.startsWith('moneypot://')) return false;
      const params = parseQueryParams(url);
      const uid = params.uid;
      const email = params.email;
      const displayName = params.displayName;

      if (uid) {
        triggerHaptic('success');
        setLoading(false);
        setUser({
          uid,
          email: email || `${displayName || 'user'}@gmail.com`,
          displayName: displayName || email?.split('@')[0] || 'Google User',
        });
        return true;
      }
    } catch (e) {
      console.warn('Auth URL handling error:', e);
    }
    return false;
  };

  // Listen for incoming deep link callbacks (moneypot://auth?...)
  useEffect(() => {
    const handleUrlEvent = (event: { url: string }) => {
      if (handleAuthUrl(event.url)) {
        setLoading(false);
      }
    };

    const sub = Linking.addEventListener('url', handleUrlEvent);

    Linking.getInitialURL().then(initialUrl => {
      if (initialUrl) {
        handleAuthUrl(initialUrl);
      }
    }).catch(() => {});

    return () => {
      sub.remove();
    };
  }, []);

  const handleGoogleLogin = async () => {
    triggerHaptic('light');
    setErrorMsg('');
    setLoading(true);

    try {
      const authUrl = `${GOOGLE_AUTH_URL}?prompt=select_account`;
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        'moneypot://auth'
      );

      if (result.type === 'success' && result.url) {
        handleAuthUrl(result.url);
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      console.warn('WebBrowser auth session error, falling back to Linking:', err);
      try {
        const supported = await Linking.canOpenURL(GOOGLE_AUTH_URL);
        if (supported) {
          await Linking.openURL(`${GOOGLE_AUTH_URL}?prompt=select_account`);
        } else {
          setErrorMsg('Unable to open web browser for Google sign in.');
          setLoading(false);
        }
      } catch (fallbackErr: any) {
        setErrorMsg('Could not open sign in window. Please try again.');
        setLoading(false);
      }
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3EFE6',
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
    backgroundColor: '#FDF2F2',
    borderWidth: 1,
    borderColor: '#FCD4D4',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D8D4CC',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
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
    color: '#2D2A26',
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
