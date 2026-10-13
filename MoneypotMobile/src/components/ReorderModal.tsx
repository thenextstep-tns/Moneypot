import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';

interface ReorderModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  itemName: string;
  itemEmoji?: string;
  currentIndex: number;
  totalCount: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToTop: () => void;
  onMoveToBottom: () => void;
}

export function ReorderModal({
  visible,
  onClose,
  title,
  itemName,
  itemEmoji,
  currentIndex,
  totalCount,
  onMoveUp,
  onMoveDown,
  onMoveToTop,
  onMoveToBottom,
}: ReorderModalProps) {
  const isTop = currentIndex === 0;
  const isBottom = currentIndex === totalCount - 1;

  const handleMoveToTop = () => {
    if (isTop) return;
    triggerHaptic('medium');
    onMoveToTop();
  };

  const handleMoveUp = () => {
    if (isTop) return;
    triggerHaptic('light');
    onMoveUp();
  };

  const handleMoveDown = () => {
    if (isBottom) return;
    triggerHaptic('light');
    onMoveDown();
  };

  const handleMoveToBottom = () => {
    if (isBottom) return;
    triggerHaptic('light');
    onMoveToBottom();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={e => e.stopPropagation()}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>Rearrange card order</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Current Item Card */}
          <View style={styles.itemCard}>
            <View style={styles.itemLeft}>
              {itemEmoji ? <Text style={styles.itemEmoji}>{itemEmoji}</Text> : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{itemName}</Text>
                <Text style={styles.itemPosText}>
                  {isTop ? '🔝 #1 in list (Top card)' : `Position ${currentIndex + 1} of ${totalCount}`}
                </Text>
              </View>
            </View>
            {isTop && (
              <View style={styles.topBadge}>
                <Text style={styles.topBadgeText}>Default in Modals</Text>
              </View>
            )}
          </View>

          {/* Reorder Actions */}
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                isTop && styles.actionBtnDisabled,
                !isTop && styles.topActionBtn,
              ]}
              disabled={isTop}
              onPress={handleMoveToTop}
            >
              <Text style={styles.actionBtnIcon}>🔝</Text>
              <Text style={[styles.actionBtnText, !isTop && styles.topActionText]}>
                Move to Top
              </Text>
              <Text style={styles.actionBtnSub}>Set as default</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, isTop && styles.actionBtnDisabled]}
              disabled={isTop}
              onPress={handleMoveUp}
            >
              <Text style={styles.actionBtnIcon}>▲</Text>
              <Text style={styles.actionBtnText}>Move Up</Text>
              <Text style={styles.actionBtnSub}>1 spot</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, isBottom && styles.actionBtnDisabled]}
              disabled={isBottom}
              onPress={handleMoveDown}
            >
              <Text style={styles.actionBtnIcon}>▼</Text>
              <Text style={styles.actionBtnText}>Move Down</Text>
              <Text style={styles.actionBtnSub}>1 spot</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, isBottom && styles.actionBtnDisabled]}
              disabled={isBottom}
              onPress={handleMoveToBottom}
            >
              <Text style={styles.actionBtnIcon}>🔻</Text>
              <Text style={styles.actionBtnText}>To Bottom</Text>
              <Text style={styles.actionBtnSub}>Last spot</Text>
            </TouchableOpacity>
          </View>

          {/* Default notice */}
          <View style={styles.tipBox}>
            <Text style={styles.tipText}>
              💡 The top item is automatically pre-selected by default in payment, transfer, and budget modals.
            </Text>
          </View>

          {/* Done button */}
          <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
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
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.mute,
    marginTop: 2,
  },
  closeBtn: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.mute,
    padding: 4,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 16,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  itemEmoji: {
    fontSize: 28,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  itemPosText: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  topBadge: {
    backgroundColor: theme.colors.brandLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.brand,
  },
  topBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.brandDark,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: theme.colors.cardMuted,
    borderWidth: 1.5,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  actionBtnDisabled: {
    opacity: 0.35,
  },
  topActionBtn: {
    backgroundColor: theme.colors.brandLight,
    borderColor: theme.colors.brand,
  },
  actionBtnIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  topActionText: {
    color: theme.colors.brandDark,
  },
  actionBtnSub: {
    fontSize: 10,
    color: theme.colors.mute,
    marginTop: 2,
  },
  tipBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: 16,
  },
  tipText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },
  doneBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
