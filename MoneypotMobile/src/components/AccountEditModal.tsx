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
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import type { Account } from '../domain/types';

interface AccountEditModalProps {
  visible: boolean;
  onClose: () => void;
  accountToEdit?: Account | null;
  onOpenCorrection?: (account: Account) => void;
}

export function AccountEditModal({
  visible,
  onClose,
  accountToEdit,
  onOpenCorrection,
}: AccountEditModalProps) {
  const { settings, save, remove } = useData();

  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('card');
  const [institution, setInstitution] = useState('');
  const [currency, setCurrency] = useState(settings.currency || 'EUR');
  const [startBalanceStr, setStartBalanceStr] = useState('');
  const [color, setColor] = useState('#6C8EF5');

  const ACCOUNT_COLORS = [
    '#6C8EF5', '#F2885B', '#3FB5A6', '#E5739A', '#9B7BEA',
    '#EDB536', '#4FA3E0', '#2FA36B', '#78B159', '#3B82F6',
  ];

  useEffect(() => {
    if (accountToEdit) {
      setName(accountToEdit.name);
      setType(accountToEdit.type);
      setInstitution(accountToEdit.institution || '');
      setCurrency(accountToEdit.currency || settings.currency || 'EUR');
      setStartBalanceStr(String(accountToEdit.startBalance));
      setColor(accountToEdit.color || '#6C8EF5');
    } else {
      setName('');
      setType('card');
      setInstitution('');
      setCurrency(settings.currency || 'EUR');
      setStartBalanceStr('0');
      setColor('#6C8EF5');
    }
  }, [accountToEdit, visible]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter an account name.');
      return;
    }

    triggerHaptic('success');
    const startBal = parseFloat(startBalanceStr.replace(',', '.')) || 0;
    const accId = accountToEdit ? accountToEdit.id : `acc_${uid()}`;

    const acc: Account = {
      id: accId,
      name: name.trim(),
      type,
      institution: institution.trim() || undefined,
      currency,
      startBalance: startBal,
      color,
    };

    await save('accounts', acc);
    onClose();
  };

  const handleDelete = () => {
    if (!accountToEdit) return;
    Alert.alert(
      'Delete Account',
      `Delete "${accountToEdit.name}"? Transactions assigned to this account will remain in logbook.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            triggerHaptic('warning');
            await remove('accounts', accountToEdit.id);
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{accountToEdit ? 'Edit Account' : 'New Account'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* Account Type */}
            <View style={styles.typeRow}>
              {(['card', 'bank', 'cash', 'wallet', 'savings'] as Account['type'][]).map(t => {
                const active = type === t;
                const labels: Record<Account['type'], string> = {
                  card: '💳 Card',
                  bank: '🏦 Bank',
                  cash: '💵 Cash',
                  wallet: '👛 Wallet',
                  savings: '🐷 Savings',
                };
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    onPress={() => {
                      triggerHaptic('light');
                      setType(t);
                    }}
                  >
                    <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                      {labels[t]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Name */}
            <Text style={styles.fieldLabel}>Account Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Revolut Card, Main Checking, Cash..."
              value={name}
              onChangeText={setName}
            />

            {/* Institution */}
            <Text style={styles.fieldLabel}>Institution / Bank (Optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Revolut, Barclays, Wise..."
              value={institution}
              onChangeText={setInstitution}
            />

            {/* Currency */}
            <Text style={styles.fieldLabel}>Currency</Text>
            <View style={styles.curRow}>
              {['EUR', 'USD', 'GBP', 'CHF', 'CNY', 'RUB', 'CAD', 'AUD'].map(c => {
                const active = currency === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.curChip, active && styles.curChipActive]}
                    onPress={() => {
                      triggerHaptic('light');
                      setCurrency(c);
                    }}
                  >
                    <Text style={[styles.curChipText, active && styles.curChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Start Balance (or Balance Correction for existing) */}
            {!accountToEdit ? (
              <>
                <Text style={styles.fieldLabel}>Starting Balance</Text>
                <View style={styles.amountRow}>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0.00"
                    value={startBalanceStr}
                    onChangeText={setStartBalanceStr}
                    keyboardType="numeric"
                  />
                  <Text style={styles.currencyBadge}>{currency}</Text>
                </View>
              </>
            ) : (
              <TouchableOpacity
                style={styles.balanceCorrCard}
                onPress={() => {
                  onClose();
                  onOpenCorrection?.(accountToEdit);
                }}
              >
                <View>
                  <Text style={styles.balanceCorrTitle}>⚖️ Balance Correction</Text>
                  <Text style={styles.balanceCorrSub}>Adjust balance to match real bank amount</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            )}

            {/* Color Accent */}
            <Text style={styles.fieldLabel}>Color Tag</Text>
            <View style={styles.colorRow}>
              {ACCOUNT_COLORS.map(col => {
                const active = color === col;
                return (
                  <TouchableOpacity
                    key={col}
                    style={[
                      styles.colorDot,
                      { backgroundColor: col },
                      active && styles.colorDotActive,
                    ]}
                    onPress={() => {
                      triggerHaptic('light');
                      setColor(col);
                    }}
                  />
                );
              })}
            </View>

            {/* Save & Delete */}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{accountToEdit ? 'Save Account' : 'Create Account'}</Text>
            </TouchableOpacity>

            {accountToEdit && (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Text style={styles.deleteBtnText}>Delete Account</Text>
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
  typeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bg,
  },
  typeChipActive: {
    backgroundColor: theme.colors.ink,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.mute,
  },
  typeChipTextActive: {
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
  curRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  curChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bg,
  },
  curChipActive: {
    backgroundColor: theme.colors.ink,
  },
  curChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.mute,
  },
  curChipTextActive: {
    color: '#FFF',
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
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  currencyBadge: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.mute,
  },
  balanceCorrCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 14,
    marginTop: 10,
  },
  balanceCorrTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  balanceCorrSub: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: theme.colors.mute,
    fontWeight: '300',
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: theme.colors.ink,
  },
  saveBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
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
