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
import { convert, getRate } from '../domain/fx';
import { today } from '../domain/schedule';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';

interface OneOffPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  initialType?: 'expense' | 'income' | 'transfer';
  initialFromId?: string;
  initialToId?: string;
}

export function OneOffPaymentModal({
  visible,
  onClose,
  initialType = 'expense',
  initialFromId,
  initialToId,
}: OneOffPaymentModalProps) {
  const { accounts, categories, stashes, settings, save } = useData();

  const [opType, setOpType] = useState<'expense' | 'income' | 'transfer'>(initialType || 'expense');

  const expenseCats = categories.filter(c => c.kind === 'expense');
  const incomeCats = categories.filter(c => c.kind === 'income');

  // Expense & Income state
  const [name, setName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(initialFromId || accounts[0]?.id || '');
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    initialType === 'income' ? (incomeCats[0]?.id || '') : (expenseCats[0]?.id || categories[0]?.id || '')
  );
  const [note, setNote] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  // Transfer state
  const selectableSources = [
    ...accounts.map(a => ({ id: a.id, name: a.name, currency: a.currency, isStash: false })),
    ...stashes.map(s => ({ id: `stash_${s.id}`, name: `${s.emoji} ${s.name}`, currency: s.currency, isStash: true })),
  ];

  const [transferFromId, setTransferFromId] = useState(initialFromId || accounts[0]?.id || '');
  const [transferToId, setTransferToId] = useState(
    initialToId ||
      accounts.find(a => a.id !== (initialFromId || accounts[0]?.id))?.id ||
      (stashes[0] ? `stash_${stashes[0].id}` : accounts[0]?.id) ||
      ''
  );
  const [transferAmountStr, setTransferAmountStr] = useState('');
  const [transferToAmountStr, setTransferToAmountStr] = useState('');
  const [transferNote, setTransferNote] = useState('');

  useEffect(() => {
    if (visible) {
      if (initialType) setOpType(initialType);
      if (initialFromId) {
        setSelectedAccountId(initialFromId);
        setTransferFromId(initialFromId);
      }
      if (initialToId) {
        setTransferToId(initialToId);
      }
    }
  }, [visible, initialType, initialFromId, initialToId]);

  useEffect(() => {
    if (opType === 'income') {
      if (!incomeCats.some(c => c.id === selectedCategoryId)) {
        setSelectedCategoryId(incomeCats[0]?.id || '');
      }
    } else if (opType === 'expense') {
      if (!expenseCats.some(c => c.id === selectedCategoryId)) {
        setSelectedCategoryId(expenseCats[0]?.id || categories[0]?.id || '');
      }
    }
  }, [opType]);

  const accountOptions = [
    ...accounts.map(a => ({ id: a.id, name: a.name, currency: a.currency })),
    ...stashes
      .filter(s => s.isInstantAccess)
      .map(s => ({ id: `stash_${s.id}`, name: `${s.emoji} ${s.name} (Stash)`, currency: s.currency })),
  ];

  const fromSource = selectableSources.find(s => s.id === transferFromId) || selectableSources[0];
  const toSource = selectableSources.find(s => s.id === transferToId) || selectableSources[1] || selectableSources[0];
  const isMultiCur = fromSource && toSource && fromSource.currency !== toSource.currency;

  const handleSaveExpense = async () => {
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

  const handleSaveIncome = async () => {
    const amt = parseFloat(amountStr.replace(',', '.'));
    if (!name.trim()) {
      Alert.alert('Missing Source', 'Please describe where the money came from (e.g. Salary, Client payout).');
      return;
    }
    if (!amt || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    if (!selectedAccountId) {
      Alert.alert('Missing Account', 'Please choose the account receiving the funds.');
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
      kind: 'income',
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
        emoji: cat?.emoji || '💰',
        amount: amt,
        currency: cur,
        accountId: selectedAccountId,
        categoryId: selectedCategoryId || '',
        kind: 'income',
      });
    }

    setName('');
    setAmountStr('');
    setNote('');
    setSaveAsTemplate(false);
    onClose();
  };

  const handleSaveTransfer = async () => {
    const fAmt = parseFloat(transferAmountStr.replace(',', '.'));
    const tAmt = parseFloat(transferToAmountStr.replace(',', '.')) || fAmt;

    if (!fAmt || fAmt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a transfer amount.');
      return;
    }
    if (transferFromId === transferToId) {
      Alert.alert('Invalid Selection', 'Please select different source and destination.');
      return;
    }

    triggerHaptic('success');
    const transferId = `tr_${uid()}`;
    await save('transfers', {
      id: transferId,
      fromAccountId: transferFromId,
      toAccountId: transferToId,
      fromAmount: fAmt,
      fromCurrency: fromSource.currency,
      toAmount: tAmt,
      toCurrency: toSource.currency,
      date: today(),
      note: transferNote.trim() || undefined,
      status: 'confirmed',
      createdAt: Date.now(),
    });

    setTransferAmountStr('');
    setTransferToAmountStr('');
    setTransferNote('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>
                {opType === 'transfer' ? '⇄ Move Money' : opType === 'income' ? '+ Record Income' : '+ Record Expense'}
              </Text>
              <Text style={styles.subtitle}>
                {opType === 'transfer' ? 'Transfer between accounts & stashes' : opType === 'income' ? 'Log incoming funds received today' : 'Log an expense or purchase made today'}
              </Text>
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

          {/* Operation type selector */}
          <View style={styles.segRow}>
            {(['expense', 'income', 'transfer'] as const).map(t => {
              const active = opType === t;
              const label = t === 'expense' ? '💸 Expense' : t === 'income' ? '💰 Income' : '⇄ Transfer';
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.segBtn, active && styles.segBtnActive]}
                  onPress={() => {
                    triggerHaptic('light');
                    setOpType(t);
                  }}
                >
                  <Text style={[styles.segBtnText, active && styles.segBtnTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {opType === 'expense' && (
              <>
                <Text style={styles.fieldLabel}>What was it?</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Groceries, Coffee, Lunch"
                  value={name}
                  onChangeText={setName}
                  autoFocus={true}
                />

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

                <Text style={styles.fieldLabel}>Pot (Category)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {(expenseCats.length > 0 ? expenseCats : categories).map(cat => {
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

                <Text style={styles.fieldLabel}>Note (Optional)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Add payment note..."
                  value={note}
                  onChangeText={setNote}
                />

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

                <TouchableOpacity style={styles.submitBtn} onPress={handleSaveExpense}>
                  <Text style={styles.submitBtnText}>✓ Save Expense</Text>
                </TouchableOpacity>
              </>
            )}

            {opType === 'income' && (
              <>
                <Text style={styles.fieldLabel}>Source / What is it?</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Salary, Client payout, Bonus, Gift"
                  value={name}
                  onChangeText={setName}
                  autoFocus={true}
                />

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

                <Text style={styles.fieldLabel}>Deposit Into Account</Text>
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

                <Text style={styles.fieldLabel}>Income Pot</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {(incomeCats.length > 0 ? incomeCats : categories).map(cat => {
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

                <Text style={styles.fieldLabel}>Note (Optional)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Add income note..."
                  value={note}
                  onChangeText={setNote}
                />

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

                <TouchableOpacity style={styles.submitBtn} onPress={handleSaveIncome}>
                  <Text style={styles.submitBtnText}>✓ Save Income</Text>
                </TouchableOpacity>
              </>
            )}

            {opType === 'transfer' && (
              <>
                <Text style={styles.fieldLabel}>From (Source Account)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {selectableSources.map(s => {
                    const active = s.id === transferFromId;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => {
                          triggerHaptic('light');
                          setTransferFromId(s.id);
                        }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {s.name} ({s.currency})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <Text style={styles.fieldLabel}>To (Destination)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {selectableSources.map(s => {
                    const active = s.id === transferToId;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => {
                          triggerHaptic('light');
                          setTransferToId(s.id);
                        }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {s.name} ({s.currency})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {isMultiCur ? (
                  <View style={styles.transferAmountRow}>
                    <View style={styles.transferAmountCol}>
                      <Text style={styles.subLabel}>Deducted ({fromSource.currency})</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="0.00"
                        value={transferAmountStr}
                        onChangeText={text => {
                          setTransferAmountStr(text);
                          const num = parseFloat(text.replace(',', '.'));
                          if (!isNaN(num)) {
                            const c = convert(num, fromSource.currency, toSource.currency);
                            setTransferToAmountStr(c.toFixed(2));
                          } else {
                            setTransferToAmountStr('');
                          }
                        }}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.transferAmountCol}>
                      <Text style={styles.subLabel}>Received ({toSource.currency})</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="0.00"
                        value={transferToAmountStr}
                        onChangeText={setTransferToAmountStr}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>Amount ({fromSource?.currency || 'EUR'})</Text>
                    <View style={styles.amountRow}>
                      <TextInput
                        style={styles.amountInput}
                        placeholder="0.00"
                        value={transferAmountStr}
                        onChangeText={text => {
                          setTransferAmountStr(text);
                          setTransferToAmountStr(text);
                        }}
                        keyboardType="decimal-pad"
                      />
                      <Text style={styles.currencyBadge}>{fromSource?.currency || 'EUR'}</Text>
                    </View>
                  </>
                )}

                {isMultiCur && (
                  <Text style={styles.fxRateText}>
                    Live FX Rate: 1 {fromSource.currency} ≈ {getRate(fromSource.currency, toSource.currency).toFixed(4)} {toSource.currency}
                  </Text>
                )}

                <Text style={styles.fieldLabel}>Note (Optional)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Card top-up, stash deposit, withdrawal…"
                  value={transferNote}
                  onChangeText={setTransferNote}
                />

                <TouchableOpacity style={styles.submitBtn} onPress={handleSaveTransfer}>
                  <Text style={styles.submitBtnText}>✓ Move Money</Text>
                </TouchableOpacity>
              </>
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
    maxHeight: '90%',
    ...theme.shadowCard,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
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
  segRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bg,
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
    gap: 4,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnActive: {
    backgroundColor: '#FFFFFF',
    ...theme.shadowCard,
  },
  segBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.mute,
  },
  segBtnTextActive: {
    color: theme.colors.ink,
    fontWeight: '700',
  },
  formScroll: {
    maxHeight: 480,
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
  subLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.mute,
    marginBottom: 4,
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
  transferAmountRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  transferAmountCol: {
    flex: 1,
  },
  fxRateText: {
    fontSize: 12,
    color: theme.colors.brand,
    fontWeight: '600',
    marginTop: 6,
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
