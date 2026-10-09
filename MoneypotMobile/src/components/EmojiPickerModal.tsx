import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { EMOJI_GROUPS } from '../domain/emojis';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';

interface EmojiPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  currentEmoji?: string;
}

export function EmojiPickerModal({
  visible,
  onClose,
  onSelect,
  currentEmoji,
}: EmojiPickerModalProps) {
  const [activeGroup, setActiveGroup] = useState<string>('Popular');
  const [customText, setCustomText] = useState('');

  const currentEmojis =
    EMOJI_GROUPS.find(g => g.name === activeGroup)?.emojis ?? EMOJI_GROUPS[0].emojis;

  const handleSelect = (emoji: string) => {
    triggerHaptic('light');
    onSelect(emoji);
    onClose();
  };

  const handleCustomChange = (text: string) => {
    setCustomText(text);
    if (text.trim().length > 0) {
      triggerHaptic('light');
      onSelect(text.trim());
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheetContainer}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Choose Icon</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          {/* Category Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScroll}
            style={styles.tabsContainer}
          >
            {EMOJI_GROUPS.map(g => {
              const isActive = activeGroup === g.name;
              return (
                <TouchableOpacity
                  key={g.name}
                  style={[styles.tabChip, isActive && styles.tabChipActive]}
                  onPress={() => {
                    triggerHaptic('light');
                    setActiveGroup(g.name);
                  }}
                >
                  <Text style={styles.tabIcon}>{g.icon}</Text>
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {g.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Emoji Grid */}
          <ScrollView contentContainerStyle={styles.emojiGrid}>
            {currentEmojis.map(emoji => {
              const isSelected = emoji === currentEmoji;
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.emojiItem, isSelected && styles.emojiItemSelected]}
                  onPress={() => handleSelect(emoji)}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Custom Input */}
          <View style={styles.customRow}>
            <Text style={styles.customLabel}>Or type any emoji:</Text>
            <TextInput
              style={styles.customInput}
              placeholder="e.g. 🍕"
              value={customText}
              onChangeText={handleCustomChange}
              maxLength={4}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    maxHeight: '75%',
    paddingBottom: 20,
    ...theme.shadowCard,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lineLight,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  closeText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.brand,
  },
  tabsContainer: {
    maxHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lineLight,
  },
  tabsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.bg,
    gap: 6,
  },
  tabChipActive: {
    backgroundColor: theme.colors.ink,
  },
  tabIcon: {
    fontSize: 14,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.mute,
  },
  tabLabelActive: {
    color: '#FFF',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    justifyContent: 'space-between',
  },
  emojiItem: {
    width: '15%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radius.sm,
    marginVertical: 4,
  },
  emojiItemSelected: {
    backgroundColor: theme.colors.brandLight,
    borderWidth: 1.5,
    borderColor: theme.colors.brand,
  },
  emojiText: {
    fontSize: 26,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lineLight,
  },
  customLabel: {
    fontSize: 13,
    color: theme.colors.mute,
    fontWeight: '500',
  },
  customInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 18,
    textAlign: 'center',
  },
});
