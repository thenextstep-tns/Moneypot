import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useData } from '../context/DataContext';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';

interface TopHeaderProps {
  title?: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
}

export function TopHeader({ title = 'Moneypot', subtitle, rightAction }: TopHeaderProps) {
  const { user, isDemoMode, setDemoMode, setUser, settings, setSettings, resetDemoData } = useData();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [mockEmail, setMockEmail] = useState('');

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
            setSettingsVisible(false);
          },
        },
      ]
    );
  };

  const handleSetUser = () => {
    if (!mockEmail.trim()) {
      Alert.alert('Email Required', 'Please enter your email to sign in.');
      return;
    }
    triggerHaptic('success');
    setUser({
      uid: 'user_' + mockEmail.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
      email: mockEmail.trim().toLowerCase(),
      displayName: mockEmail.split('@')[0],
    });
    setSettingsVisible(false);
  };

  const handleSwitchToDemo = () => {
    triggerHaptic('light');
    setDemoMode(true);
    setSettingsVisible(false);
  };

  return (
    <View style={styles.headerContainer}>
      <View style={styles.titleColumn}>
        <View style={styles.titleRow}>
          <Text style={styles.logoEmoji}>🍯</Text>
          <Text style={styles.brandTitle}>{title}</Text>
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      <View style={styles.rightRow}>
        {rightAction}

        <TouchableOpacity
          style={[styles.badge, isDemoMode ? styles.badgeDemo : styles.badgeLive]}
          onPress={() => {
            triggerHaptic('light');
            setSettingsVisible(true);
          }}
        >
          <Text style={[styles.badgeText, isDemoMode ? styles.badgeTextDemo : styles.badgeTextLive]}>
            {isDemoMode ? 'Demo' : (user?.displayName || 'Live')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Account & Settings Modal */}
      <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={() => setSettingsVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Moneypot Settings</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <Text style={styles.closeBtn}>Done</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Active Mode</Text>
              <Text style={styles.sectionDescription}>
                {isDemoMode
                  ? 'Currently running in offline Demo Mode with local sample transactions.'
                  : `Signed in as ${user?.email || user?.displayName} (Firestore synced).`}
              </Text>
            </View>

            {isDemoMode ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Sign In / Sync with Cloud</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your account email..."
                  value={mockEmail}
                  onChangeText={setMockEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.primaryBtn} onPress={handleSetUser}>
                  <Text style={styles.primaryBtnText}>Connect User Account</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.section}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleSwitchToDemo}>
                  <Text style={styles.secondaryBtnText}>Switch to Offline Demo Mode</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Main Currency</Text>
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

            {isDemoMode && (
              <TouchableOpacity style={styles.dangerBtn} onPress={handleResetDemo}>
                <Text style={styles.dangerBtnText}>Reset Sample Demo Data</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: theme.colors.bg,
  },
  titleColumn: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoEmoji: {
    fontSize: 24,
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
    gap: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  badgeDemo: {
    backgroundColor: theme.colors.warningLight,
    borderColor: '#FDE68A',
  },
  badgeLive: {
    backgroundColor: theme.colors.brandLight,
    borderColor: '#A7F3D0',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeTextDemo: {
    color: theme.colors.warningText,
  },
  badgeTextLive: {
    color: theme.colors.brandDark,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    padding: 24,
    ...theme.shadowCard,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  closeBtn: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.brand,
  },
  section: {
    marginVertical: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.inkSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionDescription: {
    fontSize: 13,
    color: theme.colors.mute,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 6,
    marginBottom: 8,
  },
  primaryBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryBtn: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: theme.colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  curChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bg,
  },
  curChipActive: {
    backgroundColor: theme.colors.ink,
  },
  curChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.mute,
  },
  curChipTextActive: {
    color: '#FFF',
  },
  dangerBtn: {
    marginTop: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dangerBtnText: {
    color: theme.colors.bad,
    fontSize: 14,
    fontWeight: '600',
  },
});
