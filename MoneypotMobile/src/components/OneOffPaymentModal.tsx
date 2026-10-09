import React, { useState, useEffect, useMemo } from 'react';
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
import { today, money } from '../domain/schedule';
import { calcAllAccountBalances, checkAccountFunds } from '../domain/balances';
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
  const { accounts, categories, stashes, settings, payments, transfers, plans, save } = useData();

  const [opType, setOpType] = useState<'expense' | 'income' | 'transfer'>(initialType || 'expense');

  const expenseCats = categories.filter(c => c.kind === 'expense');
  const incomeCats = categories.filter(c => c.kind === 'income');

  // Balances
  const currentBalMap = useMemo(
    () => calcAllAccountBalances(accounts, payments, transfers, plans, stashes),
    [accounts, payments, transfers, plans, stashes]
  );

  const accountOptions = useMemo(() => [
    ...accounts.map(a => {
      const bal = currentBalMap.get(a.id) ?? 0;
      const isFallbackPrimary = accounts.length > 0 && accounts[0].id === a.id;
      const stashedAmt = (stashes || []).reduce((sum, s) => {
        const parentAccId = s.accountId || (isFallbackPrimary ? a.id : undefined);
        if (parentAccId === a.id) {
          const sBal = Math.max(0, currentBalMap.get(`stash_${s.id}`) ?? currentBalMap.get(s.id) ?? 0);
          const converted = s.currency && s.currency !== a.currency ? convert(sBal, s.currency, a.currency) : sBal;
          return sum + converted;
        }
        return sum;
      }, 0);
      const freeBal = Math.max(0, bal - stashedAmt);
      return {
        id: a.id,
        name: a.name,
        currency: a.currency,
        bal,
        stashedAmt,
        freeBal,
        isStash: false,
      };
    }),
    ...stashes
      .filter(s => s.isInstantAccess)
      .map(s => {
        const bal = currentBalMap.get(`stash_${s.id}`) ?? currentBalMap.get(s.id) ?? 0;
        return {
          id: `stash_${s.id}`,
          name: `${s.emoji} ${s.name} (Stash)`,
          currency: s.currency,
          bal,
          stashedAmt: 0,
          freeBal: bal,
          isStash: true,
        };
      }),
  ], [accounts, stashes, currentBalMap]);

  // Transfer state
  const selectableSources = accountOptions;

  const [name, setName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(initialFromId || accounts[0]?.id || '');
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    initialType === 'income' ? (incomeCats[0]?.id || '') : (expenseCats[0]?.id || categories[0]?.id || '')
  );
  const [note, setNote] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

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

  const fundCheck = useMemo(() => {
    const amt = parseFloat(amountStr.replace(',', '.')) || 0;
    return checkAccountFunds(selectedAccountId, amt, settings.currency || 'EUR', accounts, currentBalMap, stashes);
  }, [selectedAccountId, amountStr, settings.currency, accounts, currentBalMap, stashes]);

  const fromSource = selectableSources.find(s => s.id === transferFromId) || selectableSources[0];
  const toSource = selectableSources.find(s => s.id === transferToId) || selectableSources[1] || selectableSources[0];
  const isMultiCur = fromSource && toSource && fromSource.currency !== toSource.currency;
  const numTransferAmt = parseFloat(transferAmountStr.replace(',', '.')) || 0;
  const transferIsShort = fromSource && numTransferAmt > 0 && numTransferAmt > fromSource.freeBal;

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
    if (transferIsShort) {
      Alert.alert('Insufficient Funds', `${fromSource.name} only has ${money(fromSource.freeBal, fromSource.currency)} available free funds.`);
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
                          {acc.name} · {acc.stashedAmt > 0 ? `${money(acc.freeBal, acc.currency)} free` : money(acc.bal, acc.currency)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {fundCheck.isShort && (
                  <View style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 10, padding: 10, marginVertical: 8 }}>
                    <Text style={{ fontSize: 13, color: '#991B1B', fontWeight: '600' }}>
                      ⚠️ Low free balance: {fundCheck.accountName} only has {money(fundCheck.balance ?? 0, fundCheck.accountCurrency)} free to spend
                      {fundCheck.stashedBalance && fundCheck.stashedBalance > 0
                        ? ` (Total: ${money(fundCheck.totalBalance ?? 0, fundCheck.accountCurrency)}, 🔒 ${money(fundCheck.stashedBalance, fundCheck.accountCurrency)} in stashes)`
                        : ''}
                    </Text>
                    {fundCheck.stashesInAccount && fundCheck.stashesInAccount.length > 0 && (
                      <View style={{ marginTop: 6 }}>
                        <Text style={{ fontSize: 12, color: '#7F1D1D', marginBottom: 4 }}>Pay from a stash instead?</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {fundCheck.stashesInAccount.map(s => {
                            const sBal = currentBalMap.get(`stash_${s.id}`) ?? currentBalMap.get(s.id) ?? 0;
                            return (
                              <TouchableOpacity
                                key={s.id}
                                style={{ backgroundColor: '#FFFFFF', borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}
                                onPress={() => {
                                  triggerHaptic('light');
                                  setSelectedAccountId(`stash_${s.id}`);
                                }}
                              >
                                <Text style={{ fontSize: 12, color: '#991B1B', fontWeight: '600' }}>
                                  {s.emoji} Pay from {s.name} ({money(sBal, s.currency)})
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                )}

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
                          {s.name} · {s.stashedAmt > 0 ? `${money(s.freeBal, s.currency)} free` : money(s.bal, s.currency)}
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
                          {s.name} · {s.stashedAmt > 0 ? `${money(s.freeBal, s.currency)} free` : money(s.bal, s.currency)}
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

                {transferIsShort && (
                  <View style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 10, padding: 10, marginVertical: 8 }}>
                    <Text style={{ fontSize: 13, color: '#991B1B', fontWeight: '600' }}>
                      ⚠️ Insufficient free funds in {fromSource.name}: Only {money(fromSource.freeBal, fromSource.currency)} available free to transfer (short by {money(numTransferAmt - fromSource.freeBal, fromSource.currency)})
                    </Text>
                    {!fromSource.isStash && toSource.isStash && (
                      <TouchableOpacity
                        style={{ marginTop: 6, backgroundColor: '#FFFFFF', borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' }}
                        onPress={() => {
                          triggerHaptic('light');
                          const curFrom = transferFromId;
                          const curTo = transferToId;
                          setTransferFromId(curTo);
                          setTransferToId(curFrom);
                        }}
                      >
                        <Text style={{ fontSize: 12, color: '#991B1B', fontWeight: '600' }}>
                          ⇄ Swap direction to withdraw from {toSource.name}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
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
