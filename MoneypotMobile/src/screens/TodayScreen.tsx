import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useData, uid } from '../context/DataContext';
import { occurrences, today, addDays, money, toPayment } from '../domain/schedule';
import { checkAccountFunds, calcAllAccountBalances } from '../domain/balances';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import { TopHeader } from '../components/TopHeader';
import { PaymentActionModal } from '../components/PaymentActionModal';
import { QuickTransferModal } from '../components/QuickTransferModal';
import type { Occurrence, QuickTemplate } from '../domain/types';

export function TodayScreen() {
  const {
    plans,
    payments,
    accounts,
    categories,
    stashes,
    transfers,
    templates,
    settings,
    save,
  } = useData();

  const [activeOccurrence, setActiveOccurrence] = useState<Occurrence | null>(null);
  const [transferVisible, setTransferVisible] = useState(false);
  const [transferTargetAccId, setTransferTargetAccId] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const t = today();
  // Look at window from 30 days ago up to today for overdue/due items
  const allOccurrences = occurrences(plans, payments, addDays(t, -30), t);
  const pendingOccurrences = allOccurrences.filter(o => o.status === 'pending');

  const overdue = pendingOccurrences.filter(o => o.dueDate < t);
  const dueToday = pendingOccurrences.filter(o => o.dueDate === t);

  const currentBalMap = calcAllAccountBalances(accounts, payments, transfers, plans, stashes);

  const handleRefresh = () => {
    setRefreshing(true);
    triggerHaptic('light');
    setTimeout(() => setRefreshing(false), 300);
  };

  const handleQuickTemplatePress = async (tmpl: QuickTemplate) => {
    triggerHaptic('success');
    const paymentId = `p_${uid()}`;
    const pRecord = {
      id: paymentId,
      planId: paymentId,
      dueDate: t,
      date: t,
      name: tmpl.name,
      amount: tmpl.amount,
      currency: tmpl.currency || settings.currency || 'EUR',
      status: 'confirmed' as const,
      kind: tmpl.kind || 'expense',
      accountId: tmpl.accountId || accounts[0]?.id,
      categoryId: tmpl.categoryId,
      subcategory: tmpl.subcategory,
      note: 'Quick template',
    };
    await save('payments', pRecord);
  };

  const handleDirectPaid = async (o: Occurrence) => {
    triggerHaptic('success');
    const pRecord = toPayment(o, 'confirmed');
    await save('payments', pRecord);
  };

  const renderOccurrenceCard = (o: Occurrence, isOverdue: boolean) => {
    const cat = categories.find(c => c.id === o.categoryId);
    const acc = accounts.find(a => a.id === o.accountId);
    const stash = stashes.find(s => s.id === o.stashId || `stash_${s.id}` === o.accountId);

    const icon = o.kind === 'saving' ? (stash?.emoji || '🌱') : (cat?.emoji || (o.kind === 'income' ? '💰' : '💸'));
    const accName = acc?.name || (stash ? `${stash.emoji} ${stash.name}` : 'Unassigned account');

    const fundCheck = checkAccountFunds(o.accountId, o.amount, o.currency, accounts, currentBalMap, stashes);

    return (
      <View key={o.key} style={[styles.queueCard, isOverdue && styles.queueCardOverdue]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardInfo}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>{icon}</Text>
            </View>
            <View style={styles.titleCol}>
              <Text style={styles.cardTitle}>{o.name}</Text>
              <Text style={styles.cardMeta}>
                {accName} • {isOverdue ? `Due ${o.dueDate}` : 'Due Today'}
              </Text>
            </View>
          </View>

          <View style={styles.cardAmountCol}>
            <Text style={[styles.amountText, o.kind === 'income' ? styles.incomeText : styles.expenseText]}>
              {o.kind === 'income' ? '+' : '−'}{money(o.amount, o.currency)}
            </Text>
          </View>
        </View>

        {/* Low balance warning */}
        {fundCheck.isShort && (
          <View style={styles.shortfallBox}>
            <Text style={styles.shortfallText}>
              ⚠️ Low balance: {fundCheck.accountName} is short by {money(fundCheck.shortBy, fundCheck.accountCurrency)}.
            </Text>
            <TouchableOpacity
              style={styles.moveMoneyPill}
              onPress={() => {
                triggerHaptic('light');
                setTransferTargetAccId(o.accountId);
                setTransferVisible(true);
              }}
            >
              <Text style={styles.moveMoneyPillText}>Move money ›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Action Row */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.paidBtn}
            onPress={() => handleDirectPaid(o)}
          >
            <Text style={styles.paidBtnText}>✓ Paid</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionsBtn}
            onPress={() => {
              triggerHaptic('light');
              setActiveOccurrence(o);
            }}
          >
            <Text style={styles.optionsBtnText}>More Options ›</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopHeader
        title="Today"
        subtitle={`${pendingOccurrences.length} item${pendingOccurrences.length === 1 ? '' : 's'} waiting for action`}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Quick Payment Shortcut Templates */}
        {templates.length > 0 && (
          <View style={styles.quickTemplateSection}>
            <Text style={styles.sectionHeading}>Quick Log</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateScroll}>
              {templates.map(tmpl => (
                <TouchableOpacity
                  key={tmpl.id}
                  style={styles.templatePill}
                  onPress={() => handleQuickTemplatePress(tmpl)}
                >
                  <Text style={styles.templateEmoji}>{tmpl.emoji || '⚡'}</Text>
                  <View>
                    <Text style={styles.templateName}>{tmpl.name}</Text>
                    <Text style={styles.templateAmount}>{money(tmpl.amount, tmpl.currency)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Overdue Queue */}
        {overdue.length > 0 && (
          <View style={styles.queueSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeading, styles.overdueHeading]}>⚠️ Overdue</Text>
              <Text style={styles.sectionCount}>{overdue.length}</Text>
            </View>
            {overdue.map(o => renderOccurrenceCard(o, true))}
          </View>
        )}

        {/* Due Today Queue */}
        <View style={styles.queueSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>Due Today</Text>
            <Text style={styles.sectionCount}>{dueToday.length}</Text>
          </View>

          {dueToday.length === 0 && overdue.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🎉</Text>
              <Text style={styles.emptyTitle}>All Caught Up!</Text>
              <Text style={styles.emptySub}>
                No scheduled bills or incomes due today. Log quick expenses anytime with the templates above.
              </Text>
            </View>
          ) : (
            dueToday.map(o => renderOccurrenceCard(o, false))
          )}
        </View>
      </ScrollView>

      {/* Payment Action Modal */}
      <PaymentActionModal
        visible={!!activeOccurrence}
        onClose={() => setActiveOccurrence(null)}
        occurrence={activeOccurrence}
        onOpenTransfer={(fromId, toId) => {
          setTransferTargetAccId(toId);
          setTransferVisible(true);
        }}
      />

      {/* Quick Transfer Modal */}
      <QuickTransferModal
        visible={transferVisible}
        onClose={() => {
          setTransferVisible(false);
          setTransferTargetAccId(undefined);
        }}
        defaultToAccountId={transferTargetAccId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  quickTemplateSection: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.ink,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  overdueHeading: {
    color: theme.colors.bad,
  },
  templateScroll: {
    gap: 10,
  },
  templatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.lg,
    gap: 10,
    ...theme.shadow,
  },
  templateEmoji: {
    fontSize: 22,
  },
  templateName: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  templateAmount: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.mute,
  },
  queueSection: {
    marginBottom: 22,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.mute,
  },
  queueCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 10,
    ...theme.shadowCard,
  },
  queueCardOverdue: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.bad,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 22,
  },
  titleCol: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  cardMeta: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  cardAmountCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 17,
    fontWeight: '800',
  },
  incomeText: {
    color: theme.colors.brandDark,
  },
  expenseText: {
    color: theme.colors.ink,
  },
  shortfallBox: {
    backgroundColor: theme.colors.warningLight,
    padding: 10,
    borderRadius: theme.radius.sm,
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shortfallText: {
    fontSize: 12,
    color: theme.colors.warningText,
    flex: 1,
    lineHeight: 16,
  },
  moveMoneyPill: {
    backgroundColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.xs,
    marginLeft: 8,
  },
  moveMoneyPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.warningText,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lineLight,
    paddingTop: 12,
  },
  paidBtn: {
    flex: 1,
    backgroundColor: theme.colors.brand,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  paidBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  optionsBtn: {
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  optionsBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  emptyCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 24,
    alignItems: 'center',
    textAlign: 'center',
    ...theme.shadow,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.ink,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: theme.colors.mute,
    textAlign: 'center',
    lineHeight: 18,
  },
});
