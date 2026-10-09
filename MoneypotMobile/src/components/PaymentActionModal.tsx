import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useData, uid } from '../context/DataContext';
import { today, addDays, money, toPayment } from '../domain/schedule';
import { checkAccountFunds, calcAllAccountBalances } from '../domain/balances';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import type { Occurrence, Payment } from '../domain/types';

interface PaymentActionModalProps {
  visible: boolean;
  onClose: () => void;
  occurrence: Occurrence | null;
  onOpenTransfer?: (fromAccId?: string, toAccId?: string) => void;
}

export function PaymentActionModal({
  visible,
  onClose,
  occurrence,
  onOpenTransfer,
}: PaymentActionModalProps) {
  const { accounts, categories, stashes, payments, transfers, plans, save } = useData();

  const [amountStr, setAmountStr] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [dateStr, setDateStr] = useState(today());
  const [postponeMode, setPostponeMode] = useState(false);

  useEffect(() => {
    if (occurrence) {
      setAmountStr(String(occurrence.amount));
      setSelectedAccountId(occurrence.accountId || accounts[0]?.id || '');
      setSelectedCategoryId(occurrence.categoryId || categories[0]?.id || '');
      setNote(occurrence.note || occurrence.planNote || '');
      setDateStr(today());
      setPostponeMode(false);
    }
  }, [occurrence, visible]);

  if (!occurrence) return null;

  // Account options include regular accounts + instant access stashes (for personal expenses)
  const accountOptions = [
    ...accounts.map(a => ({ id: a.id, name: a.name, currency: a.currency, color: a.color })),
    ...stashes
      .filter(s => s.isInstantAccess)
      .map(s => ({ id: `stash_${s.id}`, name: `${s.emoji} ${s.name} (Stash)`, currency: s.currency, color: '#2FA36B' })),
  ];

  const currentBalMap = calcAllAccountBalances(accounts, payments, transfers, plans, stashes);
  const fundCheck = checkAccountFunds(
    selectedAccountId,
    parseFloat(amountStr.replace(',', '.')) || occurrence.amount,
    occurrence.currency,
    accounts,
    currentBalMap,
    stashes
  );

  const handleConfirm = async () => {
    const amt = parseFloat(amountStr.replace(',', '.'));
    if (!amt || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    triggerHaptic('success');
    const paymentRecord = toPayment(occurrence, 'confirmed', {
      amount: amt,
      accountId: selectedAccountId || undefined,
      categoryId: selectedCategoryId || undefined,
      date: dateStr,
      note: note.trim() || undefined,
    });

    await save('payments', paymentRecord);
    onClose();
  };

  const handlePostpone = async (daysToAdd: number) => {
    triggerHaptic('light');
    const newDate = addDays(occurrence.date, daysToAdd);
    const paymentRecord = toPayment(occurrence, 'postponed', {
      date: newDate,
      note: note ? `${note} (Postponed to ${newDate})` : `Postponed to ${newDate}`,
    });

    await save('payments', paymentRecord);
    onClose();
  };

  const handleSkip = async () => {
    Alert.alert(
      'Skip Occurrence',
      `Cancel the scheduled occurrence of "${occurrence.name}" for ${occurrence.dueDate}?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: async () => {
            triggerHaptic('warning');
            const paymentRecord = toPayment(occurrence, 'cancelled', {
              note: 'Skipped occurrence',
            });
            await save('payments', paymentRecord);
            onClose();
          },
        },
      ]
    );
  };

  const isPayEarly = (occurrence.dueDate > today() || occurrence.date > today()) && dateStr <= today();
  const isInc = occurrence.kind === 'income';
  const isTr = occurrence.kind === 'transfer';
  const isSav = occurrence.kind === 'saving';

  const earlyTitleVerb = isInc ? 'Receive Early' : isTr ? 'Transfer Early' : isSav ? 'Save Early' : 'Pay Early';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{isPayEarly ? `⚡ ${earlyTitleVerb}: ${occurrence.name}` : occurrence.name}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* Low balance shortfall warning */}
            {fundCheck.isShort && (
              <View style={styles.warningCard}>
                <View style={styles.warningHeader}>
                  <Text style={styles.warningTitle}>⚠️ Low Balance Warning</Text>
                </View>
                <Text style={styles.warningText}>
                  {fundCheck.accountName} only has {money(fundCheck.balance ?? 0, fundCheck.accountCurrency)}. Short by {money(fundCheck.shortBy, fundCheck.accountCurrency)}.
                </Text>
                {onOpenTransfer && (
                  <TouchableOpacity
                    style={styles.moveMoneyBtn}
                    onPress={() => {
                      onClose();
                      onOpenTransfer(undefined, selectedAccountId);
                    }}
                  >
                    <Text style={styles.moveMoneyText}>⇄ Move Money into this Account</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Amount */}
            <Text style={styles.fieldLabel}>Amount</Text>
            <View style={styles.amountRow}>
              <TextInput
                style={styles.amountInput}
                value={amountStr}
                onChangeText={setAmountStr}
                keyboardType="numeric"
                selectTextOnFocus
              />
              <Text style={styles.currencyBadge}>{occurrence.currency}</Text>
            </View>

            {/* Paying Account */}
            <Text style={styles.fieldLabel}>Paying From Account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {accountOptions.map(acc => {
                const active = acc.id === selectedAccountId;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      triggerHaptic('light');
                      setSelectedAccountId(acc.id);
                    }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Category / Pot */}
            <Text style={styles.fieldLabel}>Pot (Category)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {categories.map(cat => {
                const active = cat.id === selectedCategoryId;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      triggerHaptic('light');
                      setSelectedCategoryId(cat.id);
                    }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {cat.emoji} {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Note */}
            <Text style={styles.fieldLabel}>Note</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Add payment comment..."
              value={note}
              onChangeText={setNote}
            />

            {/* Actions */}
            <View style={styles.actionSection}>
              {!postponeMode ? (
                <>
                  <TouchableOpacity
                    style={[
                      styles.confirmBtn,
                      isPayEarly && {
                        backgroundColor: isInc
                          ? '#166534'
                          : isTr
                          ? '#4338CA'
                          : isSav
                          ? '#0D9488'
                          : '#D97706',
                      },
                    ]}
                    onPress={handleConfirm}
                  >
                    <Text style={styles.confirmBtnText}>
                      {isPayEarly
                        ? isInc
                          ? '⚡ Receive Early Today'
                          : isTr
                          ? '⚡ Transfer Early Today'
                          : isSav
                          ? '⚡ Save Early Today'
                          : '⚡ Pay Early Today'
                        : isInc
                        ? '✓ Record Income'
                        : isTr
                        ? '✓ Record Transfer'
                        : isSav
                        ? '✓ Put Aside'
                        : '✓ Mark as Paid'}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.subActionRow}>
                    <TouchableOpacity
                      style={styles.laterBtn}
                      onPress={() => {
                        triggerHaptic('light');
                        setPostponeMode(true);
                      }}
                    >
                      <Text style={styles.laterBtnText}>⏳ Postpone</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                      <Text style={styles.skipBtnText}>✕ Skip</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.postponeOptions}>
                  <Text style={styles.postponeTitle}>Postpone to:</Text>
                  <View style={styles.postponeBtnRow}>
                    <TouchableOpacity style={styles.postponeChip} onPress={() => handlePostpone(1)}>
                      <Text style={styles.postponeChipText}>Tomorrow</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.postponeChip} onPress={() => handlePostpone(3)}>
                      <Text style={styles.postponeChipText}>In 3 Days</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.postponeChip} onPress={() => handlePostpone(7)}>
                      <Text style={styles.postponeChipText}>Next Week</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.cancelPostponeBtn}
                    onPress={() => setPostponeMode(false)}
                  >
                    <Text style={styles.cancelPostponeText}>Back</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: 22,
    maxHeight: '85%',
    ...theme.shadowCard,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  closeBtn: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.mute,
  },
  formScroll: {
    marginBottom: 16,
  },
  warningCard: {
    backgroundColor: theme.colors.warningLight,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: 14,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.warningText,
  },
  warningText: {
    fontSize: 12,
    color: theme.colors.warningText,
    marginTop: 4,
    lineHeight: 16,
  },
  moveMoneyBtn: {
    marginTop: 8,
    backgroundColor: '#FDE68A',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    alignSelf: 'flex-start',
  },
  moveMoneyText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.warningText,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.inkSecondary,
    marginTop: 10,
    marginBottom: 6,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  currencyBadge: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.mute,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.bg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: theme.colors.brandLight,
    borderColor: theme.colors.brand,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.mute,
  },
  chipTextActive: {
    color: theme.colors.brandDark,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.ink,
  },
  actionSection: {
    marginTop: 20,
    gap: 10,
  },
  confirmBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  subActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  laterBtn: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  laterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  skipBtn: {
    flex: 1,
    backgroundColor: theme.colors.badLight,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.bad,
  },
  postponeOptions: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 14,
    gap: 10,
  },
  postponeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.mute,
  },
  postponeBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  postponeChip: {
    flex: 1,
    backgroundColor: '#FFF',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  postponeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  cancelPostponeBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  cancelPostponeText: {
    fontSize: 13,
    color: theme.colors.mute,
    fontWeight: '600',
  },
});
