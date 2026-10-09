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
import { today, freqLabel } from '../domain/schedule';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import type { Plan, Kind, Freq } from '../domain/types';

interface PlanEditModalProps {
  visible: boolean;
  onClose: () => void;
  planToEdit?: Plan | null;
}

export function PlanEditModal({ visible, onClose, planToEdit }: PlanEditModalProps) {
  const { accounts, categories, stashes, settings, save, remove } = useData();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState(settings.currency || 'EUR');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stashId, setStashId] = useState('');
  const [note, setNote] = useState('');
  const [freq, setFreq] = useState<Freq>('monthly');
  const [every, setEvery] = useState('1');
  const [startDate, setStartDate] = useState(today());

  useEffect(() => {
    if (planToEdit) {
      setName(planToEdit.name);
      setKind(planToEdit.kind);
      setAmountStr(String(planToEdit.amount));
      setCurrency(planToEdit.currency || settings.currency || 'EUR');
      setAccountId(planToEdit.accountId || accounts[0]?.id || '');
      setToAccountId(planToEdit.toAccountId || '');
      setCategoryId(planToEdit.categoryId || categories[0]?.id || '');
      setStashId(planToEdit.stashId || '');
      setNote(planToEdit.note || '');
      setFreq(planToEdit.freq);
      setEvery(String(planToEdit.every || 1));
      setStartDate(planToEdit.startDate);
    } else {
      setName('');
      setKind('expense');
      setAmountStr('');
      setCurrency(settings.currency || 'EUR');
      setAccountId(accounts[0]?.id || '');
      setToAccountId(accounts[1]?.id || '');
      setCategoryId(categories[0]?.id || '');
      setStashId(stashes[0]?.id || '');
      setNote('');
      setFreq('monthly');
      setEvery('1');
      setStartDate(today());
    }
  }, [planToEdit, visible]);

  const handleSave = async () => {
    const amt = parseFloat(amountStr.replace(',', '.'));
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a title for this plan.');
      return;
    }
    if (!amt || amt <= 0) {
      Alert.alert('Amount Required', 'Please enter a valid amount.');
      return;
    }

    triggerHaptic('success');
    const planId = planToEdit ? planToEdit.id : `plan_${uid()}`;
    const newPlan: Plan = {
      id: planId,
      name: name.trim(),
      kind,
      amount: amt,
      currency,
      accountId: accountId || undefined,
      toAccountId: kind === 'transfer' ? toAccountId : undefined,
      categoryId: kind !== 'transfer' ? categoryId : undefined,
      stashId: kind === 'saving' ? stashId : undefined,
      note: note.trim() || undefined,
      freq,
      every: parseInt(every, 10) || 1,
      startDate: startDate || today(),
    };

    await save('plans', newPlan);
    onClose();
  };

  const handleDelete = () => {
    if (!planToEdit) return;
    Alert.alert(
      'Delete Plan',
      `Delete "${planToEdit.name}"? Past confirmed payments will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            triggerHaptic('warning');
            await remove('plans', planToEdit.id);
            onClose();
          },
        },
      ]
    );
  };

  const dummyPlanPreview: Plan = {
    id: 'preview',
    name: name || 'Plan',
    kind,
    amount: parseFloat(amountStr) || 0,
    currency,
    freq,
    every: parseInt(every, 10) || 1,
    startDate: startDate || today(),
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{planToEdit ? 'Edit Plan' : 'New Plan'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* Kind Selector */}
            <View style={styles.kindRow}>
              {(['expense', 'income', 'saving', 'transfer'] as Kind[]).map(k => {
                const active = kind === k;
                const labels: Record<Kind, string> = {
                  expense: '💸 Expense',
                  income: '💰 Income',
                  saving: '🌱 Saving',
                  transfer: '⇄ Transfer',
                };
                return (
                  <TouchableOpacity
                    key={k}
                    style={[styles.kindChip, active && styles.kindChipActive]}
                    onPress={() => {
                      triggerHaptic('light');
                      setKind(k);
                    }}
                  >
                    <Text style={[styles.kindChipText, active && styles.kindChipTextActive]}>
                      {labels[k]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Name */}
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Rent, Salary, Netflix, Stash top-up..."
              value={name}
              onChangeText={setName}
            />

            {/* Amount */}
            <Text style={styles.fieldLabel}>Amount</Text>
            <View style={styles.amountRow}>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                value={amountStr}
                onChangeText={setAmountStr}
                keyboardType="numeric"
              />
              <Text style={styles.currencyBadge}>{currency}</Text>
            </View>

            {/* Account (From) */}
            <Text style={styles.fieldLabel}>{kind === 'transfer' ? 'From Account' : 'Account'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {accounts.map(a => {
                const active = a.id === accountId;
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      triggerHaptic('light');
                      setAccountId(a.id);
                    }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{a.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* If Transfer -> Destination Account */}
            {kind === 'transfer' && (
              <>
                <Text style={styles.fieldLabel}>To Account</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {accounts.map(a => {
                    const active = a.id === toAccountId;
                    return (
                      <TouchableOpacity
                        key={a.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => {
                          triggerHaptic('light');
                          setToAccountId(a.id);
                        }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{a.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* If Expense or Income -> Pot */}
            {kind !== 'transfer' && (
              <>
                <Text style={styles.fieldLabel}>Pot (Category)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {categories.map(c => {
                    const active = c.id === categoryId;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => {
                          triggerHaptic('light');
                          setCategoryId(c.id);
                        }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {c.emoji} {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* If Saving -> Stash */}
            {kind === 'saving' && (
              <>
                <Text style={styles.fieldLabel}>Target Stash</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {stashes.map(s => {
                    const active = s.id === stashId;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => {
                          triggerHaptic('light');
                          setStashId(s.id);
                        }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {s.emoji} {s.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* Recurrence Frequency */}
            <Text style={styles.fieldLabel}>Repeats</Text>
            <View style={styles.freqRow}>
              {(['monthly', 'weekly', 'daily', 'yearly', 'once'] as Freq[]).map(f => {
                const active = freq === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[styles.freqChip, active && styles.freqChipActive]}
                    onPress={() => {
                      triggerHaptic('light');
                      setFreq(f);
                    }}
                  >
                    <Text style={[styles.freqChipText, active && styles.freqChipTextActive]}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Cadence preview banner */}
            <View style={styles.cadencePreview}>
              <Text style={styles.cadenceText}>🗓️ {freqLabel(dummyPlanPreview)}</Text>
            </View>

            {/* Note */}
            <Text style={styles.fieldLabel}>Note (Optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Account number, memo..."
              value={note}
              onChangeText={setNote}
            />

            {/* Save & Delete */}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{planToEdit ? 'Save Changes' : 'Create Plan'}</Text>
            </TouchableOpacity>

            {planToEdit && (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Text style={styles.deleteBtnText}>Delete Plan</Text>
              </TouchableOpacity>
            )}
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
    maxHeight: '88%',
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
  kindRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  kindChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
  },
  kindChipActive: {
    backgroundColor: theme.colors.ink,
  },
  kindChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.mute,
  },
  kindChipTextActive: {
    color: '#FFF',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.inkSecondary,
    marginTop: 10,
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.ink,
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
    fontSize: 20,
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
  freqRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  freqChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
  },
  freqChipActive: {
    backgroundColor: theme.colors.ink,
  },
  freqChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.mute,
  },
  freqChipTextActive: {
    color: '#FFF',
  },
  cadencePreview: {
    backgroundColor: theme.colors.brandLight,
    padding: 10,
    borderRadius: theme.radius.md,
    marginTop: 4,
    marginBottom: 6,
  },
  cadenceText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.brandDark,
  },
  saveBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  deleteBtnText: {
    color: theme.colors.bad,
    fontSize: 14,
    fontWeight: '600',
  },
});
