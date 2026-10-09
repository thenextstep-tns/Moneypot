import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useData } from '../context/DataContext';
import { today, money } from '../domain/schedule';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import type { Account, Stash } from '../domain/types';

interface BalanceCorrectionModalProps {
  visible: boolean;
  onClose: () => void;
  target: { type: 'account'; item: Account; currentBalance: number } | { type: 'stash'; item: Stash; currentBalance: number } | null;
}

export function BalanceCorrectionModal({
  visible,
  onClose,
  target,
}: BalanceCorrectionModalProps) {
  const { save } = useData();
  const [actualBalanceInput, setActualBalanceInput] = useState('');

  useEffect(() => {
    if (target) {
      setActualBalanceInput(String(target.currentBalance.toFixed(2)));
    }
  }, [target]);

  if (!target) return null;

  const currentBal = target.currentBalance;
  const targetCur = target.item.currency || 'EUR';
  const newBal = parseFloat(actualBalanceInput.replace(',', '.')) || 0;
  const delta = newBal - currentBal;

  const handleApply = async () => {
    if (Math.abs(delta) < 0.001) {
      Alert.alert('No Change', 'The entered balance is identical to the current recorded balance.');
      return;
    }

    triggerHaptic('success');
    const now = Date.now();
    const isStash = target.type === 'stash';
    const paymentId = isStash
      ? `adj_stash_${target.item.id}_${now}`
      : `adj_acc_${target.item.id}_${now}`;

    const isPositive = delta > 0;
    const kind = isStash ? 'saving' : (isPositive ? 'income' : 'expense');
    const amount = Math.abs(delta);

    await save('payments', {
      id: paymentId,
      planId: paymentId,
      dueDate: today(),
      date: today(),
      name: `⚖️ Balance correction (${target.item.name})`,
      amount,
      currency: targetCur,
      status: 'confirmed',
      kind,
      accountId: isStash ? `stash_${target.item.id}` : target.item.id,
      stashId: isStash ? target.item.id : undefined,
      note: `Adjusted balance from ${money(currentBal, targetCur)} to ${money(newBal, targetCur)}`,
    });

    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>⚖️ Balance Correction</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Adjust recorded balance for{' '}
            <Text style={{ fontWeight: '700', color: theme.colors.ink }}>{target.item.name}</Text>
          </Text>

          <View style={styles.balanceComparison}>
            <View style={styles.compCard}>
              <Text style={styles.compLabel}>Current App Balance</Text>
              <Text style={styles.compVal}>{money(currentBal, targetCur)}</Text>
            </View>
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Enter Actual Real Balance</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={actualBalanceInput}
                onChangeText={setActualBalanceInput}
                keyboardType="numeric"
                selectTextOnFocus
              />
              <Text style={styles.currencyBadge}>{targetCur}</Text>
            </View>
          </View>

          {Math.abs(delta) >= 0.01 && (
            <View style={[styles.deltaCard, delta > 0 ? styles.deltaPositive : styles.deltaNegative]}>
              <Text style={styles.deltaLabel}>
                {delta > 0 ? 'Surplus Adjustment (+)' : 'Shortfall Adjustment (−)'}:
              </Text>
              <Text style={[styles.deltaVal, delta > 0 ? styles.textPositive : styles.textNegative]}>
                {delta > 0 ? '+' : ''}{money(delta, targetCur)}
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.saveBtn} onPress={handleApply}>
            <Text style={styles.saveBtnText}>Save Correction</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
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
    padding: 22,
    ...theme.shadowCard,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  closeBtn: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.mute,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.mute,
    marginBottom: 16,
  },
  balanceComparison: {
    marginBottom: 16,
  },
  compCard: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 12,
    alignItems: 'center',
  },
  compLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.mute,
    textTransform: 'uppercase',
  },
  compVal: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.ink,
    marginTop: 4,
  },
  inputSection: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.inkSecondary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  currencyBadge: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.mute,
  },
  deltaCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: theme.radius.md,
    marginBottom: 16,
  },
  deltaPositive: {
    backgroundColor: theme.colors.brandLight,
  },
  deltaNegative: {
    backgroundColor: theme.colors.badLight,
  },
  deltaLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  deltaVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  textPositive: {
    color: theme.colors.brandDark,
  },
  textNegative: {
    color: theme.colors.bad,
  },
  saveBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
