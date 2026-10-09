import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  Platform,
  StatusBar,
  ScrollView,
  Share,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '../context/DataContext';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import { OnboardingModal } from './OnboardingModal';

interface TopHeaderProps {
  title?: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
}

const REPORT_TABS = [
  { id: 'Logbook', icon: '📜', label: 'Logbook' },
  { id: 'Cashflow', icon: '📈', label: 'Cashflow' },
] as const;

export function TopHeader({ title = 'Moneypot', subtitle, rightAction }: TopHeaderProps) {
  const insets = useSafeAreaInsets();
  const {
    user,
    isDemoMode,
    settings,
    setSettings,
    resetDemoData,
    logoutUser,
    activeTab,
    setActiveTab,
    drawerOpen,
    setDrawerOpen,
    showHowItWorks,
    setShowHowItWorks,
  } = useData();

  const handleShareApp = async () => {
    triggerHaptic('light');
    try {
      await Share.share({
        message: 'Manage money with Moneypot: https://thenextstep-tns.github.io/Moneypot/',
        url: 'https://thenextstep-tns.github.io/Moneypot/',
        title: 'Moneypot App',
      });
    } catch {}
  };

  const handleResetDemo = () => {
    Alert.alert(
      'Reset Demo Data',
      'This will reset your local data back to the default example figures. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            triggerHaptic('warning');
            await resetDemoData();
            setDrawerOpen(false);
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      isDemoMode ? 'Exit Demo' : 'Sign Out',
      isDemoMode
        ? 'Are you sure you want to exit demo mode?'
        : 'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isDemoMode ? 'Exit' : 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            triggerHaptic('warning');
            await logoutUser();
          },
        },
      ]
    );
  };

  const topPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0
  ) + 8;

  return (
    <View style={[styles.headerContainer, { paddingTop: topPadding }]}>
      <View style={styles.titleColumn}>
        <View style={styles.titleRow}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.brandTitle}>{title}</Text>
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      <View style={styles.rightRow}>
        {rightAction}

        <TouchableOpacity
          style={styles.hamburgerBtn}
          onPress={() => {
            triggerHaptic('light');
            setDrawerOpen(true);
          }}
          activeOpacity={0.7}
          accessibilityLabel="Open menu"
        >
          <Text style={styles.hamburgerIcon}>☰</Text>
        </TouchableOpacity>
      </View>

      {/* Slide-Over Drawer Menu */}
      <Modal
        visible={drawerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <TouchableOpacity
            style={styles.drawerBackdrop}
            activeOpacity={1}
            onPress={() => setDrawerOpen(false)}
          />

          <View
            style={[
              styles.drawerContent,
              {
                paddingTop: Math.max(insets.top, 24) + 12,
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              },
            ]}
          >
            {/* Drawer Header */}
            <View style={styles.drawerHeader}>
              <View style={styles.userBadge}>
                <Text style={styles.userBadgeIcon}>{isDemoMode ? '🧪' : '👤'}</Text>
                <Text style={styles.userBadgeText} numberOfLines={1}>
                  {isDemoMode ? 'Demo mode' : (user?.displayName || user?.email || 'Logged in')}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setDrawerOpen(false)}
                accessibilityLabel="Close menu"
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.drawerScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.drawerBody}
            >
              {/* Reports Section */}
              <View style={styles.section}>
                <Text style={styles.sectionHeading}>📊 REPORTS</Text>
                {REPORT_TABS.map(tab => (
                  <TouchableOpacity
                    key={tab.id}
                    style={[
                      styles.menuItem,
                      activeTab === tab.id && styles.menuItemActive,
                    ]}
                    onPress={() => {
                      triggerHaptic('light');
                      setActiveTab(tab.id);
                      setDrawerOpen(false);
                    }}
                  >
                    <Text style={styles.menuItemIcon}>{tab.icon}</Text>
                    <Text
                      style={[
                        styles.menuItemLabel,
                        activeTab === tab.id && styles.menuItemLabelActive,
                      ]}
                    >
                      {tab.label}
                    </Text>
                    {activeTab === tab.id ? (
                      <Text style={styles.menuItemCheck}>✓</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>

              {/* App & Help Section */}
              <View style={styles.section}>
                <Text style={styles.sectionHeading}>📱 APP & HELP</Text>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    triggerHaptic('light');
                    setDrawerOpen(false);
                    setShowHowItWorks(true);
                  }}
                >
                  <Text style={styles.menuItemIcon}>💡</Text>
                  <Text style={styles.menuItemLabel}>How it works</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuItem, styles.menuItemDownload]}
                  onPress={handleShareApp}
                >
                  <Text style={styles.menuItemIcon}>🌐</Text>
                  <View style={styles.downloadLabelGroup}>
                    <Text style={[styles.menuItemLabel, styles.downloadLabel]}>
                      Web App & Share
                    </Text>
                    <Text style={styles.downloadSubtext}>
                      Open web version or share app
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Account & Settings Section */}
              <View style={styles.section}>
                <Text style={styles.sectionHeading}>⚙️ ACCOUNT & SETTINGS</Text>

                <View style={styles.currencyBlock}>
                  <Text style={styles.currencyLabel}>Main currency:</Text>
                  <View style={styles.currencyRow}>
                    {['EUR', 'USD', 'GBP', 'CHF', 'CNY', 'RUB'].map(cur => (
                      <TouchableOpacity
                        key={cur}
                        style={[
                          styles.curChip,
                          settings.currency === cur && styles.curChipActive,
                        ]}
                        onPress={() => {
                          triggerHaptic('light');
                          setSettings({ currency: cur });
                        }}
                      >
                        <Text
                          style={[
                            styles.curChipText,
                            settings.currency === cur && styles.curChipTextActive,
                          ]}
                        >
                          {cur}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {isDemoMode ? (
                  <TouchableOpacity
                    style={styles.resetDemoBtn}
                    onPress={handleResetDemo}
                  >
                    <Text style={styles.resetDemoText}>🔄 Reset demo data</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={styles.logoutBtn}
                  onPress={handleSignOut}
                >
                  <Text style={styles.logoutBtnText}>
                    {isDemoMode ? '🚪 Exit demo mode' : '🚪 Log out'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Onboarding / "How it works" Modal */}
      <OnboardingModal
        visible={showHowItWorks}
        onClose={() => setShowHowItWorks(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: theme.colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  titleColumn: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoImage: {
    width: 28,
    height: 28,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.ink,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.mute,
    marginTop: 2,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hamburgerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.line,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadowCard,
  },
  hamburgerIcon: {
    fontSize: 20,
    color: theme.colors.ink,
    lineHeight: 22,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  drawerBackdrop: {
    flex: 1,
  },
  drawerContent: {
    width: '82%',
    maxWidth: 320,
    backgroundColor: theme.colors.card,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    maxWidth: '80%',
  },
  userBadgeIcon: {
    fontSize: 14,
  },
  userBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: theme.colors.mute,
    fontWeight: '600',
  },
  drawerScroll: {
    flex: 1,
  },
  drawerBody: {
    padding: 16,
    gap: 20,
  },
  section: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.mute,
    letterSpacing: 0.5,
    paddingLeft: 4,
    marginBottom: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuItemActive: {
    backgroundColor: '#E8F6EE',
  },
  menuItemIcon: {
    fontSize: 18,
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  menuItemLabelActive: {
    color: '#166534',
    fontWeight: '700',
  },
  menuItemCheck: {
    fontSize: 15,
    fontWeight: '800',
    color: '#166534',
  },
  menuItemDownload: {
    backgroundColor: '#EEF6F1',
    borderWidth: 1,
    borderColor: '#C3E6D0',
  },
  downloadLabelGroup: {
    flex: 1,
  },
  downloadLabel: {
    color: '#1B5E3D',
  },
  downloadSubtext: {
    fontSize: 11,
    color: '#2FA36B',
    fontWeight: '500',
  },
  currencyBlock: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 12,
    gap: 8,
  },
  currencyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.inkSecondary,
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  curChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  curChipActive: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
  },
  curChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.mute,
  },
  curChipTextActive: {
    color: '#FFFFFF',
  },
  resetDemoBtn: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  resetDemoText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  logoutBtn: {
    backgroundColor: '#FDF2F2',
    borderWidth: 1,
    borderColor: '#FCD4D4',
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E5484D',
  },
});
