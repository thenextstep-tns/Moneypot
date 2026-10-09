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
  Switch,
} from 'react-native';
import { useData, uid } from '../context/DataContext';
import { today, money } from '../domain/schedule';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import { EmojiPickerModal } from './EmojiPickerModal';
import type { Stash } from '../domain/types';

interface StashEditModalProps {
  visible: boolean;
  onClose: () => void;
  stashToEdit?: Stash | null;
  onOpenCorrection?: (stash: Stash) => void;
}

export function StashEditModal({
  visible,
  onClose,
  stashToEdit,
  onOpenCorrection,
}: StashEditModalProps) {
  const { accounts, settings, save, remove } = useData();

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🌱');
  const [targetStr, setTargetStr] = useState('');
  const [starterBalanceStr, setStarterBalanceStr] = useState('');
  const [currency, setCurrency] = useState(settings.currency || 'EUR');
  const [accountId, setAccountId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [isInstantAccess, setIsInstantAccess] = useState(true);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);

  useEffect(() => {
    if (stashToEdit) {
      setName(stashToEdit.name);
      setEmoji(stashToEdit.emoji || '🌱');
      setTargetStr(stashToEdit.target ? String(stashToEdit.target) : '');
      setStarterBalanceStr(''); // Existing stashes use Balance Correction instead
      setCurrency(stashToEdit.currency || settings.currency || 'EUR');
      setAccountId(stashToEdit.accountId || accounts[0]?.id || '');
      setDeadline(stashToEdit.deadline || '');
      setIsInstantAccess(stashToEdit.isInstantAccess ?? true);
    } else {
      setName('');
      setEmoji('🌱');
      setTargetStr('');
      setStarterBalanceStr('');
      setCurrency(settings.currency || 'EUR');
      setAccountId(accounts[0]?.id || '');
      setDeadline('');
      setIsInstantAccess(true);
    }
  }, [stashToEdit, visible]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a name for your savings stash.');
      return;
    }

    triggerHaptic('success');
    const stashId = stashToEdit ? stashToEdit.id : `stash_${uid()}`;
    const targetAmt = parseFloat(targetStr.replace(',', '.')) || 0;
    const starterAmt = parseFloat(starterBalanceStr.replace(',', '.')) || 0;

    const newStash: Stash = {
      id: stashId,
      name: name.trim(),
      emoji: emoji || '🌱',
      target: targetAmt,
      currency,
      accountId: accountId || undefined,
      startAmount: 0, // Stored as 0 to prevent double-counting as per blueprint
      deadline: deadline || undefined,
      isInstantAccess,
      sharedWith: stashToEdit?.sharedWith,
      ownerEmail: stashToEdit?.ownerEmail,
    };

    await save('stashes', newStash);

    // If new stash with initial amount, log an initial payment
    if (!stashToEdit && starterAmt > 0) {
      const initPaymentId = `init_stash_${stashId}`;
      await save('payments', {
        id: initPaymentId,
        planId: initPaymentId,
        dueDate: today(),
        date: today(),
        name: `Initial stash balance (${name.trim()})`,
        amount: starterAmt,
        currency,
        status: 'confirmed',
        kind: 'saving',
        accountId: `stash_${stashId}`,
        stashId,
        note: 'Starter balance',
      });
    }

    onClose();
  };

  const handleDelete = () => {
    if (!stashToEdit) return;
    Alert.alert(
      'Delete Stash',
      `Delete "${stashToEdit.name}"? Past payments associated with it will remain in history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            triggerHaptic('warning');
            await remove('stashes', stashToEdit.id);
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
            <Text style={styles.title}>{stashToEdit ? 'Edit Stash' : 'New Savings Stash'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* Emoji and Name */}
            <View style={styles.nameRow}>
              <TouchableOpacity
                style={styles.emojiPickerBtn}
                onPress={() => {
                  triggerHaptic('light');
                  setEmojiPickerVisible(true);
                }}
              >
                <Text style={styles.emojiDisplay}>{emoji}</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.nameInput}
                placeholder="Stash name (e.g. Vacation, Car...)"
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Target Goal */}
            <Text style={styles.fieldLabel}>Savings Target Goal</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00 (Optional)"
                value={targetStr}
                onChangeText={setTargetStr}
                keyboardType="numeric"
              />
              <Text style={styles.currencyBadge}>{currency}</Text>
            </View>

            {/* Starter Balance (Only shown when creating new stash) */}
            {!stashToEdit ? (
              <>
                <Text style={styles.fieldLabel}>Starter Amount</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0.00"
                    value={starterBalanceStr}
                    onChangeText={setStarterBalanceStr}
                    keyboardType="numeric"
                  />
                  <Text style={styles.currencyBadge}>{currency}</Text>
                </View>
              </>
            ) : (
              // Existing stash: Balance Correction Shortcut
              <TouchableOpacity
                style={styles.balanceCorrCard}
                onPress={() => {
                  onClose();
                  onOpenCorrection?.(stashToEdit);
                }}
              >
                <View>
                  <Text style={styles.balanceCorrTitle}>⚖️ Balance Correction</Text>
                  <Text style={styles.balanceCorrSub}>Adjust stash balance to match actual savings</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            )}

            {/* Parent Account */}
            <Text style={styles.fieldLabel}>Where money physically sits</Text>
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

            {/* Instant Access Toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleTitle}>Instant Access</Text>
                <Text style={styles.toggleSub}>
                  {isInstantAccess
                    ? 'Allows paying expenses directly from this stash like a sub-account.'
                    : 'Reserved savings goal. Direct spending is locked.'}
                </Text>
              </View>
              <Switch
                value={isInstantAccess}
                onValueChange={val => {
                  triggerHaptic('light');
                  setIsInstantAccess(val);
                }}
                trackColor={{ false: theme.colors.line, true: theme.colors.brandLight }}
                thumbColor={isInstantAccess ? theme.colors.brand : '#f4f3f4'}
              />
            </View>

            {/* Save & Delete */}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{stashToEdit ? 'Save Stash' : 'Create Stash'}</Text>
            </TouchableOpacity>

            {stashToEdit && (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Text style={styles.deleteBtnText}>Delete Stash</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <EmojiPickerModal
            visible={emojiPickerVisible}
            onClose={() => setEmojiPickerVisible(false)}
            onSelect={setEmoji}
            currentEmoji={emoji}
          />
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  emojiPickerBtn: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.line,
  },
  emojiDisplay: {
    fontSize: 26,
  },
  nameInput: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.inkSecondary,
    marginTop: 10,
    marginBottom: 6,
  },
  inputRow: {
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
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 14,
    marginTop: 14,
    gap: 12,
  },
  toggleTextCol: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  toggleSub: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
    lineHeight: 16,
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
