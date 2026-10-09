import React, { useState } from 'react';
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
import { today } from '../domain/schedule';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';

interface OneOffPaymentModalProps {
  visible: boolean;
  onClose: () => void;
}

export function OneOffPaymentModal({ visible, onClose }: OneOffPaymentModalProps) {
  const { accounts, categories, stashes, settings, save } = useData();

  const [name, setName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id || '');
  const [note, setNote] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  const accountOptions = [
    ...accounts.map(a => ({ id: a.id, name: a.name, currency: a.currency })),
    ...stashes
      .filter(s => s.isInstantAccess)
      .map(s => ({ id: `stash_${s.id}`, name: `${s.emoji} ${s.name} (Stash)`, currency: s.currency })),
  ];

  const handleSave = async () => {
    const amt = parseFloat(amountStr.replace(',', '.'));
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please describe what you spent money on.');
      return;
    }
    if (!amt || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    if (!selectedAccountId) {
      Alert.alert('Missing Account', 'Please choose an account.');
      return;
    }

    triggerHaptic('success');
    const paymentId = `p_${uid()}`;
    const t = today();
    const cur = settings.currency || 'EUR';

    await save('payments', {
      id: paymentId,
      planId: paymentId,
      dueDate: t,
      date: t,
      name: name.trim(),
      amount: amt,
      currency: cur,
      status: 'confirmed',
      kind: 'expense',
      accountId: selectedAccountId,
      categoryId: selectedCategoryId || undefined,
      note: note.trim() || undefined,
    });

    if (saveAsTemplate) {
      const tmplId = `tmpl_${uid()}`;
      const cat = categories.find(c => c.id === selectedCategoryId);
      await save('templates', {
        id: tmplId,
        name: name.trim(),
        emoji: cat?.emoji || '⚡',
        amount: amt,
        currency: cur,
        accountId: selectedAccountId,
        categoryId: selectedCategoryId || '',
        kind: 'expense',
      });
    }

    setName('');
    setAmountStr('');
    setNote('');
    setSaveAsTemplate(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>+ Add Payment</Text>
              <Text style={styles.subtitle}>Log an expense or purchase made today</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                triggerHaptic('light');
                onClose();
              }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* Payment Name */}
            <Text style={styles.fieldLabel}>What was it?</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Groceries, Coffee, Lunch"
              value={name}
              onChangeText={setName}
              autoFocus={true}
            />

            {/* Amount */}
            <Text style={styles.fieldLabel}>Amount</Text>
            <View style={styles.amountRow}>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                value={amountStr}
                onChangeText={setAmountStr}
                keyboardType="decimal-pad"
              />
              <Text style={styles.currencyBadge}>{settings.currency || 'EUR'}</Text>
            </View>

            {/* Paying Account */}
            <Text style={styles.fieldLabel}>Paid From Account</Text>
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
            <Text style={styles.fieldLabel}>Note (Optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Add payment note..."
              value={note}
              onChangeText={setNote}
            />

            {/* Template toggle */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => {
                triggerHaptic('light');
                setSaveAsTemplate(!saveAsTemplate);
              }}
            >
              <Text style={styles.toggleCheckbox}>{saveAsTemplate ? '☑' : '☐'}</Text>
              <Text style={styles.toggleLabel}>Save as 1-tap quick template</Text>
            </TouchableOpacity>

            {/* Submit Button */}
            <TouchableOpacity style={styles.submitBtn} onPress={handleSave}>
              <Text style={styles.submitBtnText}>✓ Record Payment</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 34,
    maxHeight: '85%',
    ...theme.shadowCard,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.ink,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: theme.colors.mute,
    fontWeight: '700',
  },
  formScroll: {
    maxHeight: 460,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.inkSecondary,
    marginBottom: 6,
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.ink,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.ink,
    paddingVertical: 10,
  },
  currencyBadge: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.mute,
    marginLeft: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  chipActive: {
    backgroundColor: theme.colors.brand,
    borderColor: theme.colors.brand,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 8,
  },
  toggleCheckbox: {
    fontSize: 18,
    color: theme.colors.brand,
  },
  toggleLabel: {
    fontSize: 13,
    color: theme.colors.inkSecondary,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
    ...theme.shadowCard,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
