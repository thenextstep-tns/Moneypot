import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  Platform,
  NativeModules,
  Animated,
} from 'react-native';
import { useData, uid } from '../context/DataContext';
import { occurrences, today, addDays, money, toPayment } from '../domain/schedule';
import { checkAccountFunds, calcAllAccountBalances } from '../domain/balances';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import { TopHeader } from '../components/TopHeader';
import { PaymentActionModal } from '../components/PaymentActionModal';
import { QuickTransferModal } from '../components/QuickTransferModal';
import { PayEarlyModal } from '../components/PayEarlyModal';
import { OneOffPaymentModal } from '../components/OneOffPaymentModal';
import { QuickLogButton } from '../components/QuickLogButton';
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
    deepLinkAction,
    setDeepLinkAction,
  } = useData();

  const [activeOccurrence, setActiveOccurrence] = useState<Occurrence | null>(null);
  const [transferVisible, setTransferVisible] = useState(false);
  const [transferTargetAccId, setTransferTargetAccId] = useState<string | undefined>(undefined);
  const [payEarlyVisible, setPayEarlyVisible] = useState(false);
  const [oneOffVisible, setOneOffVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const t = today();
  // Look at window from 30 days ago up to 7 days ahead
  const allOccurrences = occurrences(plans, payments, addDays(t, -30), addDays(t, 7));
  const pendingOccurrences = allOccurrences.filter(o => o.status === 'pending');

  const overdue = pendingOccurrences.filter(o => o.dueDate < t);
  const dueToday = pendingOccurrences.filter(o => o.dueDate === t);
  const upcomingThisWeek = pendingOccurrences.filter(o => o.dueDate > t);

  const currentBalMap = calcAllAccountBalances(accounts, payments, transfers, plans, stashes);

  // Sync state with Android Home Screen AppWidget
  useEffect(() => {
    const dueCount = overdue.length + dueToday.length;
    const dueSum = [...overdue, ...dueToday].reduce((acc, o) => acc + o.amount, 0);
    const dueSumText = dueSum > 0 ? money(dueSum, settings.currency || 'EUR') : '';

    if (Platform.OS === 'android' && NativeModules.MoneypotWidget) {
      try {
        NativeModules.MoneypotWidget.updateWidgetData(dueCount, dueSumText);
      } catch (err) {
        console.warn('Failed to update widget data', err);
      }
    }
  }, [overdue.length, dueToday.length, settings.currency]);

  // Handle incoming deep links (from Android Widget or URL scheme)
  useEffect(() => {
    if (!deepLinkAction) return;

    if (deepLinkAction === 'confirm-today') {
      const firstDue = dueToday[0] || overdue[0];
      if (firstDue) {
        setActiveOccurrence(firstDue);
      }
      setDeepLinkAction(null);
    } else if (deepLinkAction === 'add-payment') {
      setOneOffVisible(true);
      setDeepLinkAction(null);
    } else if (deepLinkAction === 'pay-early') {
      setPayEarlyVisible(true);
      setDeepLinkAction(null);
    }
  }, [deepLinkAction, dueToday, overdue, setDeepLinkAction]);

  const handleRefresh = () => {
    setRefreshing(true);
    triggerHaptic('light');
    setTimeout(() => setRefreshing(false), 300);
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastAnim.setValue(0);
    Animated.spring(toastAnim, {
      toValue: 1,
      tension: 65,
      friction: 8,
      useNativeDriver: true,
    }).start();

    toastTimerRef.current = setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => setToastMessage(null));
    }, 2500);
  };

  const handleQuickTemplatePress = async (tmpl: QuickTemplate) => {
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
    showToast(`✓ Logged ${tmpl.name} (${money(tmpl.amount, tmpl.currency || settings.currency)})`);
  };

  const handleDirectPaid = async (o: Occurrence) => {
    triggerHaptic('success');
    const isPayEarly = o.dueDate > t || o.date > t;
    const pRecord = toPayment(o, 'confirmed', isPayEarly ? { date: t } : {});
    await save('payments', pRecord);
  };

  const renderOccurrenceCard = (o: Occurrence, isOverdue: boolean, isUpcoming: boolean = false) => {
    const cat = categories.find(c => c.id === o.categoryId);
    const acc = accounts.find(a => a.id === o.accountId);
    const stash = stashes.find(s => s.id === o.stashId || `stash_${s.id}` === o.accountId);

    const icon = o.kind === 'saving' ? (stash?.emoji || '🌱') : (cat?.emoji || (o.kind === 'income' ? '💰' : '💸'));
    const accName = acc?.name || (stash ? `${stash.emoji} ${stash.name}` : 'Unassigned account');

    const fundCheck = checkAccountFunds(o.accountId, o.amount, o.currency, accounts, currentBalMap, stashes);

    const isInc = o.kind === 'income';
    const isTr = o.kind === 'transfer';
    const isSav = o.kind === 'saving';

    const actionText = isUpcoming
      ? (isInc ? '⚡ Got early' : isTr ? '⚡ Move early' : isSav ? '⚡ Save early' : '⚡ Pay early')
      : (isInc ? '✓ Got it' : isTr ? '✓ Moved' : isSav ? '✓ Put aside' : '✓ Paid');

    const actionBtnBg = isUpcoming
      ? (isInc ? '#166534' : isTr ? '#4338CA' : isSav ? '#0D9488' : '#D97706')
      : theme.colors.brand;

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
                {accName} • {isOverdue ? `Due ${o.dueDate}` : isUpcoming ? `Due ${o.dueDate}` : 'Due Today'}
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
            style={[styles.paidBtn, { backgroundColor: actionBtnBg }]}
            onPress={() => (isUpcoming ? setActiveOccurrence(o) : handleDirectPaid(o))}
          >
            <Text style={styles.paidBtnText}>
              {actionText}
            </Text>
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

  const totalDueCount = overdue.length + dueToday.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopHeader
        title="Today"
        subtitle={`${totalDueCount} item${totalDueCount === 1 ? '' : 's'} waiting today`}
        rightAction={
          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.headerActionBtnEarly}
              onPress={() => {
                triggerHaptic('light');
                setPayEarlyVisible(true);
              }}
            >
              <Text style={styles.headerActionBtnEarlyText}>⚡ Early action</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionBtnAdd}
              onPress={() => {
                triggerHaptic('light');
                setOneOffVisible(true);
              }}
            >
              <Text style={styles.headerActionBtnAddText}>+ Add</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Quick Payment Shortcut Templates */}
        {templates.length > 0 && (
          <View style={styles.quickTemplateSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>Quick Log</Text>
              <Text style={styles.holdHint}>Hold 1s to log</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateScroll}>
              {templates.map(tmpl => (
                <QuickLogButton
                  key={tmpl.id}
                  template={tmpl}
                  onSuccess={handleQuickTemplatePress}
                  currencyDefault={settings.currency}
                />
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
                No scheduled bills or incomes due today. Log quick expenses or pay upcoming bills early.
              </Text>
            </View>
          ) : (
            dueToday.map(o => renderOccurrenceCard(o, false))
          )}
        </View>

        {/* Coming Up This Week */}
        {upcomingThisWeek.length > 0 && (
          <View style={styles.queueSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>Coming Up This Week</Text>
              <Text style={styles.sectionCount}>{upcomingThisWeek.length}</Text>
            </View>
            {upcomingThisWeek.map(o => renderOccurrenceCard(o, false, true))}
          </View>
        )}
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

      {/* Pay Early Modal */}
      <PayEarlyModal
        visible={payEarlyVisible}
        onClose={() => setPayEarlyVisible(false)}
        onSelect={o => setActiveOccurrence(o)}
      />

      {/* One-Off Payment Modal */}
      <OneOffPaymentModal
        visible={oneOffVisible}
        onClose={() => setOneOffVisible(false)}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toastContainer,
            {
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.toastEmoji}>⚡</Text>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtnEarly: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerActionBtnEarlyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  headerActionBtnAdd: {
    backgroundColor: theme.colors.brand,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerActionBtnAddText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 20,
  },
  quickTemplateSection: {
    marginBottom: 4,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.mute,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  overdueHeading: {
    color: theme.colors.bad,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.mute,
    backgroundColor: theme.colors.lineLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
  },
  templateScroll: {
    gap: 10,
    paddingRight: 16,
  },
  templatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.line,
    gap: 8,
    ...theme.shadowCard,
  },
  templateEmoji: {
    fontSize: 16,
  },
  templateName: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  templateAmount: {
    fontSize: 11,
    color: theme.colors.mute,
    fontWeight: '500',
  },
  queueSection: {
    gap: 12,
  },
  queueCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadowCard,
  },
  queueCardOverdue: {
    borderColor: theme.colors.badLight,
    backgroundColor: '#FFFBFB',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 18,
  },
  titleCol: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  cardMeta: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  cardAmountCol: {
    marginLeft: 12,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
  },
  expenseText: {
    color: theme.colors.ink,
  },
  incomeText: {
    color: theme.colors.brand,
  },
  shortfallBox: {
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.radius.sm,
    padding: 8,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  payEarlyBtn: {
    backgroundColor: '#D97706',
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
    ...theme.shadowCard,
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
  holdHint: {
    fontSize: 11,
    color: theme.colors.mute,
    fontWeight: '600',
    backgroundColor: theme.colors.lineLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
  },
  toastContainer: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 9999,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  toastEmoji: {
    fontSize: 15,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
