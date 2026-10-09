import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useData } from '../context/DataContext';
import { occurrences, today, addDays, money } from '../domain/schedule';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import type { Occurrence } from '../domain/types';

interface PayEarlyModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (occurrence: Occurrence) => void;
}

export function PayEarlyModal({ visible, onClose, onSelect }: PayEarlyModalProps) {
  const { plans, payments, categories, accounts, stashes } = useData();
  const [query, setQuery] = useState('');
  const t = today();

  // Search upcoming planned occurrences for next 90 days
  const upcoming = useMemo(() => {
    return occurrences(plans, payments, addDays(t, 1), addDays(t, 90)).filter(
      o => o.status === 'pending'
    );
  }, [plans, payments, t]);

  const cat = (id: string) => categories.find(c => c.id === id);
  const acc = (id?: string) => accounts.find(a => a.id === id);
  const stash = (id?: string) => stashes.find(s => s.id === id || `stash_${s.id}` === id);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return upcoming;
    return upcoming.filter(o => {
      const c = cat(o.categoryId);
      return (
        o.name.toLowerCase().includes(q) ||
        (o.subcategory && o.subcategory.toLowerCase().includes(q)) ||
        (c && c.name.toLowerCase().includes(q)) ||
        String(o.amount).includes(q)
      );
    });
  }, [upcoming, query, categories]);

  const handleSelect = (o: Occurrence) => {
    triggerHaptic('light');
    onClose();
    onSelect(o);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.titleCol}>
              <Text style={styles.title}>⚡ Early Actions</Text>
              <Text style={styles.subtitle}>
                Record an upcoming bill, income, or transfer ahead of time — satisfies the scheduled occurrence so you won't be asked again.
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

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search upcoming bills (rent, gym, wifi)..."
              value={query}
              onChangeText={setQuery}
              autoFocus={false}
              clearButtonMode="while-editing"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Text style={styles.clearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* List of upcoming items */}
          <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>🔍</Text>
                <Text style={styles.emptyTitle}>
                  {query ? 'No matching upcoming bills' : 'No upcoming bills in next 90 days'}
                </Text>
                <Text style={styles.emptySub}>
                  {query
                    ? 'Try searching for a different keyword or amount.'
                    : 'All planned bills are either completed or further out.'}
                </Text>
              </View>
            ) : (
              filtered.map(o => {
                const c = cat(o.categoryId);
                const a = acc(o.accountId);
                const s = stash(o.stashId || o.accountId);
                const icon = c?.emoji || s?.emoji || '🗓️';
                const accLabel = a?.name || (s ? `${s.name} (Stash)` : 'No account');

                return (
                  <TouchableOpacity
                    key={o.key}
                    style={styles.itemCard}
                    activeOpacity={0.7}
                    onPress={() => handleSelect(o)}
                  >
                    <View style={styles.itemHeader}>
                      <View style={styles.iconCircle}>
                        <Text style={styles.iconText}>{icon}</Text>
                      </View>
                      <View style={styles.itemInfo}>
                        <View style={styles.itemNameRow}>
                          <Text style={styles.itemName} numberOfLines={1}>
                            {o.name}
                          </Text>
                          <View style={styles.dueDateBadge}>
                            <Text style={styles.dueDateText}>Due {o.dueDate}</Text>
                          </View>
                        </View>
                        <Text style={styles.itemMeta} numberOfLines={1}>
                          {c?.name || 'Pot'}{o.subcategory ? ` · ${o.subcategory}` : ''} • {accLabel}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.itemBottomRow}>
                      <Text style={styles.itemAmount}>
                        {money(o.amount, o.currency)}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.payTodayBtn,
                          {
                            backgroundColor:
                              o.kind === 'income'
                                ? '#166534'
                                : (o.kind === 'transfer' || o.kind === 'saving')
                                ? '#4338CA'
                                : '#D97706',
                          },
                        ]}
                        onPress={() => handleSelect(o)}
                      >
                        <Text style={styles.payTodayBtnText}>
                          {o.kind === 'income'
                            ? '⚡ Got today'
                            : (o.kind === 'transfer' || o.kind === 'saving')
                            ? '⚡ Move today'
                            : '⚡ Pay today'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })
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
    maxHeight: '85%',
    ...theme.shadowCard,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  titleCol: {
    flex: 1,
    paddingRight: 10,
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
    marginTop: 4,
    lineHeight: 16,
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.line,
    marginBottom: 12,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.ink,
    padding: 0,
  },
  clearText: {
    fontSize: 13,
    color: theme.colors.mute,
    paddingHorizontal: 4,
  },
  scrollList: {
    maxHeight: 400,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    ...theme.shadowCard,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 18,
  },
  itemInfo: {
    flex: 1,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.ink,
    flex: 1,
  },
  dueDateBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dueDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  itemMeta: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  itemBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  payTodayBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  payTodayBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  emptySub: {
    fontSize: 12,
    color: theme.colors.mute,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
});
