import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

import { DataProvider, useData } from './src/context/DataContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { PlansScreen } from './src/screens/PlansScreen';
import { PotsScreen } from './src/screens/PotsScreen';
import { StashesScreen } from './src/screens/StashesScreen';
import { AccountsScreen } from './src/screens/AccountsScreen';
import { LogbookScreen } from './src/screens/LogbookScreen';
import { CashflowScreen } from './src/screens/CashflowScreen';
import { SpendingScreen } from './src/screens/SpendingScreen';
import { JoinSharedModal } from './src/components/SharingModals';
import { theme, useStyles, type Theme } from './src/theme';
import { triggerHaptic } from './src/utils/haptics';

const PRIMARY_TABS = [
  { id: 'Today', label: 'Today', icon: '✅' },
  { id: 'Plans', label: 'Plan', icon: '🗓️' },
  { id: 'Pots', label: 'Pots', icon: '🫙' },
  { id: 'Stashes', label: 'Stashes', icon: '🐷' },
  { id: 'Accounts', label: 'Accounts', icon: '💳' },
] as const;

function MainApp() {
  const insets = useSafeAreaInsets();
  const { user, isDemoMode, loaded, activeTab, setActiveTab, setDrawerOpen, setDeepLinkAction, isDark, pendingInviteCode, setPendingInviteCode } = useData();
  const styles = useStyles(getStyles);

  React.useEffect(() => {
    // moneypot://<action>?… — match the action exactly (not substrings of other parameters)
    const handleUrl = (url: string | null) => {
      if (!url || !url.startsWith('moneypot://')) return;
      const rest = url.slice('moneypot://'.length);
      const action = rest.split(/[?#/]/)[0].toLowerCase();
      const query = rest.includes('?') ? rest.slice(rest.indexOf('?') + 1).split('#')[0] : '';
      const param = (k: string) => {
        for (const pair of query.split('&')) {
          const [key, val = ''] = pair.split('=');
          if (key === k) {
            try { return decodeURIComponent(val); } catch { return null; }
          }
        }
        return null;
      };
      switch (action) {
        case 'confirm-today':
        case 'add-payment':
        case 'pay-early':
          setActiveTab('Today');
          setDeepLinkAction(action);
          break;
        case 'today':
          setActiveTab('Today');
          break;
        case 'invite': {
          const code = param('code');
          if (code && /^[A-Za-z0-9-]{4,20}$/.test(code)) setPendingInviteCode(code);
          break;
        }
        default:
          break; // 'auth' callbacks are handled by the sign-in screen
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener('url', event => handleUrl(event.url));
    return () => subscription.remove();
  }, [setActiveTab, setDeepLinkAction, setPendingInviteCode]);

  if (!loaded) {
    return (
      <View style={styles.loadingContainer}>
        <Image
          source={require('./assets/logo.png')}
          style={styles.loadingLogo}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color={theme.colors.brand} style={{ marginTop: 20 }} />
      </View>
    );
  }

  // Requirement 3: If not authenticated and not demo, show Auth Screen first
  if (!user && !isDemoMode) {
    return <AuthScreen />;
  }

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'Plans':
        return <PlansScreen />;
      case 'Pots':
        return <PotsScreen />;
      case 'Stashes':
        return <StashesScreen />;
      case 'Accounts':
        return <AccountsScreen />;
      case 'Logbook':
        return <LogbookScreen />;
      case 'Cashflow':
        return <CashflowScreen />;
      case 'Spending':
        return <SpendingScreen />;
      case 'Today':
      default:
        return <TodayScreen />;
    }
  };

  const isReportsActive = activeTab === 'Logbook' || activeTab === 'Cashflow' || activeTab === 'Spending';

  return (
    <View style={styles.mainContainer}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.screenContainer}>
        {renderActiveScreen()}
      </View>

      <JoinSharedModal visible={!!pendingInviteCode} initialCode={pendingInviteCode} onClose={() => setPendingInviteCode(null)} />

      {/* Bottom Navigation Bar */}
      <View
        style={[
          styles.bottomNav,
          {
            paddingBottom: Math.max(insets.bottom, 10),
            height: 56 + Math.max(insets.bottom, 10),
          },
        ]}
      >
        {PRIMARY_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => {
                triggerHaptic('light');
                setActiveTab(tab.id);
              }}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabIcon, isActive && styles.tabIconActive]} importantForAccessibility="no">
                {tab.icon}
              </Text>
              <Text
                style={[styles.tabLabel, isActive && styles.tabLabelActive]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* 6th Tab: Reports & More button that opens the hamburger drawer */}
        <TouchableOpacity
          style={[styles.tabButton, isReportsActive && styles.tabButtonActive]}
          onPress={() => {
            triggerHaptic('light');
            setDrawerOpen(true);
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Reports and more"
        >
          <Text style={[styles.tabIcon, isReportsActive && styles.tabIconActive]}>
            📊
          </Text>
          <Text
            style={[styles.tabLabel, isReportsActive && styles.tabLabelActive]}
            numberOfLines={1}
          >
            Reports
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DataProvider>
          <MainApp />
        </DataProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLogo: {
    width: 80,
    height: 80,
  },
  mainContainer: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  screenContainer: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    paddingTop: 6,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: theme.isDark ? 0.35 : 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    borderRadius: 10,
    marginHorizontal: 2,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.brandLight,
  },
  tabIcon: {
    fontSize: 18,
    lineHeight: 22,
    opacity: 0.65,
  },
  tabIconActive: {
    opacity: 1,
    transform: [{ scale: 1.1 }],
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.mute,
    marginTop: 2,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: theme.colors.brandDark,
    fontWeight: '700',
  },
});
