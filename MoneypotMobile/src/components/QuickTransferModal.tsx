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
import { calcAllAccountBalances } from '../domain/balances';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';

interface QuickTransferModalProps {
  visible: boolean;
  onClose: () => void;
  defaultFromAccountId?: string;
  defaultToAccountId?: string;
}

export function QuickTransferModal({
  visible,
  onClose,
  defaultFromAccountId,
  defaultToAccountId,
}: QuickTransferModalProps) {
  const { accounts, stashes, payments, transfers, plans, save } = useData();

  const currentBalMap = useMemo(
    () => calcAllAccountBalances(accounts, payments, transfers, plans, stashes),
    [accounts, payments, transfers, plans, stashes]
  );

  // Instant access stashes are also valid transfer participants
  const selectableSources = useMemo(() => [
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
        color: a.color,
      };
    }),
    ...stashes
      .filter(s => s.isInstantAccess)
      .map(s => {
        const bal = currentBalMap.get(`stash_${s.id}`) ?? currentBalMap.get(s.id) ?? 0;
        return {
          id: `stash_${s.id}`,
          name: `${s.emoji} ${s.name}`,
          currency: s.currency,
          bal,
          stashedAmt: 0,
          freeBal: bal,
          isStash: true,
          color: '#2FA36B',
        };
      }),
  ], [accounts, stashes, currentBalMap]);

  const [fromId, setFromId] = useState(defaultFromAccountId || selectableSources[0]?.id || '');
  const [toId, setToId] = useState(defaultToAccountId || selectableSources[1]?.id || selectableSources[0]?.id || '');
  const [fromAmountStr, setFromAmountStr] = useState('');
  const [toAmountStr, setToAmountStr] = useState('');
  const [note, setNote] = useState('');
  const [dateStr, setDateStr] = useState(today());

  useEffect(() => {
    if (defaultFromAccountId) setFromId(defaultFromAccountId);
    if (defaultToAccountId) setToId(defaultToAccountId);
  }, [defaultFromAccountId, defaultToAccountId, visible]);

  const fromSource = selectableSources.find(s => s.id === fromId) || selectableSources[0];
  const toSource = selectableSources.find(s => s.id === toId) || selectableSources[1] || selectableSources[0];

  const handleFromAmountChange = (text: string) => {
    setFromAmountStr(text);
    const num = parseFloat(text.replace(',', '.'));
    if (!isNaN(num) && fromSource && toSource) {
      if (fromSource.currency === toSource.currency) {
        setToAmountStr(text);
      } else {
        const converted = convert(num, fromSource.currency, toSource.currency);
        setToAmountStr(converted.toFixed(2));
      }
    } else {
      setToAmountStr('');
    }
  };

  const handleTransfer = async () => {
    const fromAmt = parseFloat(fromAmountStr.replace(',', '.'));
    const toAmt = parseFloat(toAmountStr.replace(',', '.')) || fromAmt;

    if (!fromAmt || fromAmt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a transfer amount.');
      return;
    }

    if (fromId === toId) {
      Alert.alert('Invalid Selection', 'Please select different source and destination accounts.');
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
      fromAccountId: fromId,
      toAccountId: toId,
      fromAmount: fromAmt,
      fromCurrency: fromSource.currency,
      toAmount: toAmt,
      toCurrency: toSource.currency,
      date: dateStr,
      note: note.trim() || undefined,
      status: 'confirmed',
      createdAt: Date.now(),
    });

    setFromAmountStr('');
    setToAmountStr('');
    setNote('');
    onClose();
  };

  if (!fromSource || !toSource) return null;

  const rate = getRate(fromSource.currency, toSource.currency);
  const isMultiCur = fromSource.currency !== toSource.currency;
  const numFromAmt = parseFloat(fromAmountStr.replace(',', '.')) || 0;
  const transferIsShort = fromSource && numFromAmt > 0 && numFromAmt > fromSource.freeBal;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>⇄ Move Money</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* From Account */}
            <Text style={styles.fieldLabel}>From (Source Account)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {selectableSources.map(s => {
                const active = s.id === fromId;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.accountChip, active && styles.accountChipActive]}
                    onPress={() => {
                      triggerHaptic('light');
                      setFromId(s.id);
                    }}
                  >
                    <Text style={[styles.accountChipText, active && styles.accountChipTextActive]}>
                      {s.name} · {s.stashedAmt > 0 ? `${money(s.freeBal, s.currency)} free` : money(s.bal, s.currency)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* To Account */}
            <Text style={styles.fieldLabel}>To (Destination Account)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {selectableSources.map(s => {
                const active = s.id === toId;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.accountChip, active && styles.accountChipActive]}
                    onPress={() => {
                      triggerHaptic('light');
                      setToId(s.id);
                    }}
                  >
                    <Text style={[styles.accountChipText, active && styles.accountChipTextActive]}>
                      {s.name} · {s.stashedAmt > 0 ? `${money(s.freeBal, s.currency)} free` : money(s.bal, s.currency)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Amount Input */}
            <View style={styles.amountBox}>
              <View style={styles.amountCol}>
                <Text style={styles.subLabel}>{isMultiCur ? `Deducted (${fromSource.currency})` : `Amount (${fromSource.currency})`}</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  value={fromAmountStr}
                  onChangeText={handleFromAmountChange}
                  keyboardType="numeric"
                />
              </View>

              {isMultiCur && (
                <View style={styles.amountCol}>
                  <Text style={styles.subLabel}>Received ({toSource.currency})</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0.00"
                    value={toAmountStr}
                    onChangeText={setToAmountStr}
                    keyboardType="numeric"
                  />
                </View>
              )}
            </View>

            {isMultiCur && (
              <Text style={styles.fxRateText}>
                Live FX Rate: 1 {fromSource.currency} ≈ {rate.toFixed(4)} {toSource.currency}
              </Text>
            )}

            {transferIsShort && (
              <View style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 10, padding: 10, marginVertical: 8 }}>
                <Text style={{ fontSize: 13, color: '#991B1B', fontWeight: '600' }}>
                  ⚠️ Insufficient free funds in {fromSource.name}: Only {money(fromSource.freeBal, fromSource.currency)} available free to transfer (short by {money(numFromAmt - fromSource.freeBal, fromSource.currency)})
                </Text>
                {!fromSource.isStash && toSource.isStash && (
                  <TouchableOpacity
                    style={{ marginTop: 6, backgroundColor: '#FFFFFF', borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' }}
                    onPress={() => {
                      triggerHaptic('light');
                      const curFrom = fromId;
                      const curTo = toId;
                      setFromId(curTo);
                      setToId(curFrom);
                    }}
                  >
                    <Text style={{ fontSize: 12, color: '#991B1B', fontWeight: '600' }}>
                      ⇄ Swap direction to withdraw from {toSource.name}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Note */}
            <Text style={styles.fieldLabel}>Note (Optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Card top-up, currency exchange..."
              value={note}
              onChangeText={setNote}
            />

            {/* Confirmation Banner */}
            <View style={styles.neutralityBanner}>
              <Text style={styles.neutralityText}>
                💡 Net Wealth Neutral: Moving money between your accounts changes balances without reducing total wealth.
              </Text>
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleTransfer}>
              <Text style={styles.submitBtnText}>Confirm Transfer</Text>
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
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  closeBtn: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.mute,
  },
  formScroll: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.inkSecondary,
    marginTop: 12,
    marginBottom: 8,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 2,
  },
  accountChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.bg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  accountChipActive: {
    backgroundColor: theme.colors.brandLight,
    borderColor: theme.colors.brand,
  },
  accountChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.mute,
  },
  accountChipTextActive: {
    color: theme.colors.brandDark,
  },
  amountBox: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  amountCol: {
    flex: 1,
  },
  subLabel: {
    fontSize: 12,
    color: theme.colors.mute,
    marginBottom: 4,
    fontWeight: '600',
  },
  amountInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  fxRateText: {
    fontSize: 12,
    color: theme.colors.brand,
    marginTop: 6,
    fontWeight: '600',
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
  neutralityBanner: {
    backgroundColor: theme.colors.brandLight,
    padding: 12,
    borderRadius: theme.radius.md,
    marginTop: 16,
    marginBottom: 16,
  },
  neutralityText: {
    fontSize: 12,
    color: theme.colors.brandDark,
    lineHeight: 16,
    fontWeight: '500',
  },
  submitBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
