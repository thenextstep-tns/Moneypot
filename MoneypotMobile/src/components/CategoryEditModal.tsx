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
import { EmojiPickerModal } from './EmojiPickerModal';
import type { Category, Kind } from '../domain/types';

interface CategoryEditModalProps {
  visible: boolean;
  onClose: () => void;
  categoryToEdit?: Category | null;
}

export function CategoryEditModal({
  visible,
  onClose,
  categoryToEdit,
}: CategoryEditModalProps) {
  const { save, remove } = useData();

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🍏');
  const [kind, setKind] = useState<Kind>('expense');
  const [color, setColor] = useState('#6C8EF5');
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [newSubcatText, setNewSubcatText] = useState('');
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);

  const POT_COLORS = [
    '#6C8EF5', '#F2885B', '#3FB5A6', '#E5739A', '#9B7BEA',
    '#EDB536', '#4FA3E0', '#2FA36B', '#78B159', '#E5484D',
  ];

  useEffect(() => {
    if (categoryToEdit) {
      setName(categoryToEdit.name);
      setEmoji(categoryToEdit.emoji || '🍏');
      setKind(categoryToEdit.kind || 'expense');
      setColor(categoryToEdit.color || '#6C8EF5');
      setSubcategories(categoryToEdit.subcategories || []);
    } else {
      setName('');
      setEmoji('🍏');
      setKind('expense');
      setColor('#6C8EF5');
      setSubcategories([]);
    }
  }, [categoryToEdit, visible]);

  const handleAddSubcat = () => {
    if (!newSubcatText.trim()) return;
    triggerHaptic('light');
    setSubcategories(prev => [...prev, newSubcatText.trim()]);
    setNewSubcatText('');
  };

  const handleRemoveSubcat = (index: number) => {
    triggerHaptic('light');
    setSubcategories(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a name for this spending pot.');
      return;
    }

    triggerHaptic('success');
    const catId = categoryToEdit ? categoryToEdit.id : `cat_${uid()}`;
    const newCategory: Category = {
      id: catId,
      name: name.trim(),
      emoji: emoji || '🍏',
      kind,
      color,
      subcategories: subcategories.length ? subcategories : undefined,
      sharedWith: categoryToEdit?.sharedWith,
      ownerEmail: categoryToEdit?.ownerEmail,
    };

    await save('categories', newCategory);
    onClose();
  };

  const handleDelete = () => {
    if (!categoryToEdit) return;
    Alert.alert(
      'Delete Pot',
      `Delete pot "${categoryToEdit.name}"? Existing logged payments in this category will not be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            triggerHaptic('warning');
            await remove('categories', categoryToEdit.id);
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
            <Text style={styles.title}>{categoryToEdit ? 'Edit Pot' : 'New Pot'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* Kind Selector */}
            <View style={styles.kindRow}>
              {(['expense', 'income', 'saving'] as Kind[]).map(k => {
                const active = kind === k;
                const labels: Record<string, string> = {
                  expense: '💸 Expense',
                  income: '💰 Income',
                  saving: '🌱 Saving',
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
                placeholder="Pot name (e.g. Groceries, Bills...)"
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Color Accent */}
            <Text style={styles.fieldLabel}>Theme Color</Text>
            <View style={styles.colorRow}>
              {POT_COLORS.map(col => {
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

            {/* Subcategories */}
            <Text style={styles.fieldLabel}>Subcategories</Text>
            <View style={styles.subcatAddRow}>
              <TextInput
                style={styles.subcatInput}
                placeholder="Add subcategory (e.g. Coffee, Supermarket)..."
                value={newSubcatText}
                onChangeText={setNewSubcatText}
                onSubmitEditing={handleAddSubcat}
              />
              <TouchableOpacity style={styles.subcatAddBtn} onPress={handleAddSubcat}>
                <Text style={styles.subcatAddBtnText}>+ Add</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.subcatList}>
              {subcategories.map((sub, idx) => (
                <View key={idx} style={styles.subcatChip}>
                  <Text style={styles.subcatChipText}>{sub}</Text>
                  <TouchableOpacity onPress={() => handleRemoveSubcat(idx)}>
                    <Text style={styles.subcatRemoveIcon}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Save & Delete */}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{categoryToEdit ? 'Save Pot' : 'Create Pot'}</Text>
            </TouchableOpacity>

            {categoryToEdit && (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Text style={styles.deleteBtnText}>Delete Pot</Text>
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
  kindRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
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
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
    marginBottom: 10,
  },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: theme.colors.ink,
  },
  subcatAddRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  subcatInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: theme.colors.ink,
  },
  subcatAddBtn: {
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
  },
  subcatAddBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  subcatList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  subcatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  subcatChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.ink,
  },
  subcatRemoveIcon: {
    fontSize: 11,
    color: theme.colors.mute,
    fontWeight: '700',
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
