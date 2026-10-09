import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';

interface Step {
  emoji: string;
  badge: string;
  title: string;
  lead: string;
  bullets: string[];
}

const STEPS: Step[] = [
  {
    emoji: '🍯',
    badge: 'Welcome to Moneypot',
    title: 'Peace of mind with your money',
    lead: 'No spreadsheets, complex formulas, or financial jargon. Just clear pots and real accounts.',
    bullets: [
      'Tracks what is really in your bank cards and cash.',
      'Know what you can safely spend without touching bill money.',
      'Simple, calming, and built for humans.',
    ],
  },
  {
    emoji: '✅',
    badge: '1. Today View',
    title: 'Your 10-second daily routine',
    lead: 'Check off regular bills as they happen and log casual spending in seconds.',
    bullets: [
      'Tap “✓ Paid” when a scheduled bill happens.',
      'Tap “⏰ Later” to postpone if an invoice is delayed.',
      'Tap “+ I spent money” to log casual coffee, groceries, or unexpected costs.',
    ],
  },
  {
    emoji: '📈',
    badge: '2. Cashflow & Calendar',
    title: 'Daily trajectory & payment calendar',
    lead: 'See exactly how your total wealth moves day-by-day across all accounts.',
    bullets: [
      'Interactive graph scales automatically and shows total balance.',
      'Tap payments to see instant income & expense callouts.',
      'See all your scheduled payments inside full calendar cells with daily balances.',
    ],
  },
  {
    emoji: '🫙',
    badge: '3. Pots Dashboard',
    title: 'Visual spending envelopes',
    lead: 'Group your spending into clear pots and see your true month-end cashflow.',
    bullets: [
      'Pots show how much is planned, what’s already paid, and what’s still needed.',
      'Organize spending inside pots using flexible subcategories.',
      'Calculates your real month-end balance factoring in your current bank accounts.',
    ],
  },
  {
    emoji: '🗓️',
    badge: '4. Plan',
    title: 'Set it once, stay ahead',
    lead: 'Tell Moneypot about your recurring income and bills so you never miss a due date.',
    bullets: [
      'Supports daily, weekly, monthly, and yearly recurring rhythms.',
      'Assign bills directly to your cards or banks to watch for low balances.',
      'Future occurrences appear automatically on your timeline.',
    ],
  },
  {
    emoji: '💳',
    badge: '5. Money & Stashes',
    title: 'Where money lives & grows',
    lead: 'Track accounts in multiple currencies and save toward your goals.',
    bullets: [
      'Add cards, banks, cash, and wallets in EUR, USD, GBP, CHF, etc.',
      'Move money between accounts with live or custom exchange rates.',
      'Create 🐷 Stashes for rainy-day cushions or dream vacation goals.',
    ],
  },
  {
    emoji: '📜',
    badge: '6. Log Book',
    title: 'Complete peace of mind',
    lead: 'Every transaction is recorded here with instant one-tap revert.',
    bullets: [
      'Search and filter past expenses, incomes, savings, and transfers.',
      'Made a mistake or returned an item? Tap “Cancel & revert money”.',
      'Funds are automatically restored back to the source account.',
    ],
  },
];

export function OnboardingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  const handleNext = () => {
    triggerHaptic('light');
    if (isLast) {
      setIndex(0);
      onClose();
    } else {
      setIndex(index + 1);
    }
  };

  const handleBack = () => {
    triggerHaptic('light');
    if (index > 0) {
      setIndex(index - 1);
    } else {
      setIndex(0);
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>How Moneypot Works</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.emoji}>{step.emoji}</Text>
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>{step.badge}</Text>
            </View>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepLead}>{step.lead}</Text>

            <View style={styles.bulletsCard}>
              {step.bullets.map((b, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>

            <View style={styles.dotsRow}>
              {STEPS.map((_, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.dot, i === index && styles.dotActive]}
                  onPress={() => {
                    triggerHaptic('light');
                    setIndex(i);
                  }}
                />
              ))}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
              <Text style={styles.backBtnText}>{index > 0 ? '‹ Back' : 'Skip'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextBtnText}>
                {isLast ? 'Get Started 🚀' : 'Next ›'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    padding: 20,
    ...theme.shadowCard,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  closeBtn: {
    fontSize: 18,
    color: theme.colors.mute,
    fontWeight: '600',
    padding: 4,
  },
  body: {
    flexGrow: 0,
    marginVertical: 12,
  },
  bodyContent: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  badgeContainer: {
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.brandDark,
  },
  stepTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: theme.colors.ink,
    textAlign: 'center',
    marginBottom: 6,
  },
  stepLead: {
    fontSize: 13,
    color: theme.colors.mute,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  bulletsCard: {
    width: '100%',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 14,
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletDot: {
    fontSize: 16,
    color: theme.colors.brand,
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.ink,
    lineHeight: 18,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 18,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.line,
  },
  dotActive: {
    width: 20,
    backgroundColor: theme.colors.brand,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bg,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brand,
    alignItems: 'center',
  },
  nextBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
});
