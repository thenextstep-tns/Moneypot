import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useData } from '../context/DataContext';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';

// Ensure any in-flight auth browser sessions complete cleanly
WebBrowser.maybeCompleteAuthSession();

const GOOGLE_AUTH_URL = 'https://thenextstep-tns.github.io/Moneypot/auth-mobile.html';

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { setUser, setDemoMode } = useData();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const parseAuthUrl = (url: string) => {
    try {
      if (!url.startsWith('moneypot://')) return false;
      const queryString = url.includes('?') ? url.split('?')[1] : '';
      const params = new URLSearchParams(queryString);
      const uid = params.get('uid');
      const email = params.get('email');
      const displayName = params.get('displayName');

      if (uid) {
        triggerHaptic('success');
        setUser({
          uid,
          email: email || `${displayName || 'user'}@gmail.com`,
          displayName: displayName || email?.split('@')[0] || 'Google User',
        });
        return true;
      }
    } catch (e) {
      console.warn('Error parsing auth URL:', e);
    }
    return false;
  };

  // Listen for incoming deep links
  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      if (parseAuthUrl(event.url)) {
        setLoading(false);
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then(initialUrl => {
      if (initialUrl) {
        parseAuthUrl(initialUrl);
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  const handleGoogleLogin = async () => {
    triggerHaptic('light');
    setErrorMsg('');
    setLoading(true);

    try {
      // Open in-app browser for Google OAuth
      const result = await WebBrowser.openAuthSessionAsync(
        GOOGLE_AUTH_URL,
        'moneypot://'
      );

      if (result.type === 'success' && result.url) {
        const handled = parseAuthUrl(result.url);
        if (!handled) {
          setErrorMsg('Authentication did not return valid account credentials.');
        }
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // User closed the browser
        setLoading(false);
      }
    } catch (err: any) {
      console.warn('Google sign in error:', err);
      // Fallback: try standard device browser if in-app tab fails
      try {
        await Linking.openURL(GOOGLE_AUTH_URL);
      } catch {
        setErrorMsg('Could not open Google sign in. Please try again.');
      }
    } finally {
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
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.ink} />
            ) : (
              <View style={styles.googleContent}>
                <Image
                  source={{
                    uri: 'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg',
                  }}
                  style={styles.googleLogoFallback}
                  defaultSource={require('../../assets/favicon.png')}
                />
                <Text style={styles.googleG}>G</Text>
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
    gap: 10,
  },
  googleLogoFallback: {
    width: 0,
    height: 0,
    display: 'none',
  },
  googleG: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4285F4',
    lineHeight: 22,
  },
  googleBtnText: {
    color: '#2D2A26',
    fontSize: 15,
    fontWeight: '700',
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
