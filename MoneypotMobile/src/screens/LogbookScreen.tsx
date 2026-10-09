import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useData } from '../context/DataContext';
import { money } from '../domain/schedule';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import { TopHeader } from '../components/TopHeader';
import type { Payment, Transfer } from '../domain/types';

interface LogItem {
  id: string;
  type: 'payment' | 'transfer';
  date: string;
  name: string;
  amount: number;
  currency: string;
  kind?: string;
  accountName?: string;
  categoryName?: string;
  stashName?: string;
  emoji?: string;
  isCorrection?: boolean;
  isShared?: boolean;
  contributorName?: string;
  note?: string;
  raw: Payment | Transfer;
}

export function LogbookScreen() {
  const { payments, transfers, accounts, categories, stashes, remove } = useData();

  const [search, setSearch] = useState('');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('all');
  const [selectedPotFilter, setSelectedPotFilter] = useState<string>('all');

  // Build combined unified audit list of confirmed items
  const logItems: LogItem[] = [];

  for (const p of payments) {
    if (p.status !== 'confirmed') continue;
    const cat = categories.find(c => c.id === p.categoryId);
    const acc = accounts.find(a => a.id === p.accountId);
    const stash = stashes.find(s => s.id === p.stashId || `stash_${s.id}` === p.accountId);
    const isCorrection = p.name?.includes('Balance correction') || p.id.startsWith('adj_');

    logItems.push({
      id: p.id,
      type: 'payment',
      date: p.date,
      name: p.name || cat?.name || 'Payment',
      amount: p.amount,
      currency: p.currency,
      kind: p.kind || 'expense',
      accountName: acc?.name || (stash ? `${stash.emoji} ${stash.name}` : undefined),
      categoryName: cat?.name,
      stashName: stash?.name,
      emoji: isCorrection ? '⚖️' : (p.kind === 'saving' ? (stash?.emoji || '🌱') : (cat?.emoji || (p.kind === 'income' ? '💰' : '💸'))),
      isCorrection,
      isShared: p.isShared,
      contributorName: p.contributorName,
      note: p.note,
      raw: p,
    });
  }

  for (const tr of transfers) {
    if (tr.status === 'cancelled') continue;
    const fromAcc = accounts.find(a => a.id === tr.fromAccountId);
    const toAcc = accounts.find(a => a.id === tr.toAccountId);

    logItems.push({
      id: tr.id,
      type: 'transfer',
      date: tr.date,
      name: `Transfer (${fromAcc?.name || 'Account'} → ${toAcc?.name || 'Account'})`,
      amount: tr.fromAmount,
      currency: tr.fromCurrency,
      kind: 'transfer',
      accountName: `${fromAcc?.name} → ${toAcc?.name}`,
      emoji: '⇄',
      note: tr.note,
      raw: tr,
    });
  }

  // Sort descending by date
  logItems.sort((a, b) => b.date.localeCompare(a.date));

  // Apply filters
  const filtered = logItems.filter(item => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        item.name.toLowerCase().includes(q) ||
        (item.note && item.note.toLowerCase().includes(q)) ||
        (item.accountName && item.accountName.toLowerCase().includes(q)) ||
        (item.categoryName && item.categoryName.toLowerCase().includes(q));
      if (!match) return false;
    }

    if (selectedAccountFilter !== 'all') {
      const p = item.raw as Payment;
      if (item.type === 'payment' && p.accountId !== selectedAccountFilter) return false;
    }

    if (selectedPotFilter !== 'all') {
      const p = item.raw as Payment;
      if (item.type === 'payment' && p.categoryId !== selectedPotFilter) return false;
    }

    return true;
  });

  const handleDeleteItem = (item: LogItem) => {
    Alert.alert(
      'Delete Record',
      `Delete record "${item.name}" of ${money(item.amount, item.currency)}? This will recalculate balances.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            triggerHaptic('warning');
            if (item.type === 'payment') {
              await remove('payments', item.id);
            } else {
              await remove('transfers', item.id);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopHeader
        title="Logbook"
        subtitle={`${logItems.length} confirmed entries in history`}
      />

      {/* Search Bar */}
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by title, account, note..."
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearSearch}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipRow}
        style={styles.filterChipScroll}
      >
        <TouchableOpacity
          style={[styles.chip, selectedAccountFilter === 'all' && styles.chipActive]}
          onPress={() => {
            triggerHaptic('light');
            setSelectedAccountFilter('all');
          }}
        >
          <Text style={[styles.chipText, selectedAccountFilter === 'all' && styles.chipTextActive]}>
            All Accounts
          </Text>
        </TouchableOpacity>

        {accounts.map(a => (
          <TouchableOpacity
            key={a.id}
            style={[styles.chip, selectedAccountFilter === a.id && styles.chipActive]}
            onPress={() => {
              triggerHaptic('light');
              setSelectedAccountFilter(selectedAccountFilter === a.id ? 'all' : a.id);
            }}
          >
            <Text style={[styles.chipText, selectedAccountFilter === a.id && styles.chipTextActive]}>
              {a.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Audit Stream List */}
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📜</Text>
            <Text style={styles.emptyTitle}>No matching transactions</Text>
            <Text style={styles.emptySub}>
              Confirmed payments and completed transfers will show up here in chronological order.
            </Text>
          </View>
        ) : (
          filtered.map(item => (
            <View key={item.id} style={styles.logCard}>
              <View style={styles.logLeft}>
                <View style={styles.iconCircle}>
                  <Text style={styles.iconText}>{item.emoji || '🧾'}</Text>
                </View>

                <View style={styles.infoCol}>
                  <Text style={styles.logTitle}>{item.name}</Text>
                  <Text style={styles.logMeta}>
                    {item.date} {item.accountName ? `• ${item.accountName}` : ''}
                  </Text>

                  {/* Badges for shared / balance correction */}
                  <View style={styles.badgeRow}>
                    {item.isCorrection && (
                      <View style={styles.correctionBadge}>
                        <Text style={styles.correctionBadgeText}>⚖️ Adjustment</Text>
                      </View>
                    )}
                    {item.isShared && (
                      <View style={styles.sharedBadge}>
                        <Text style={styles.sharedBadgeText}>
                          👥 {item.contributorName ? item.contributorName : 'Shared'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {item.note && <Text style={styles.logNote}>{item.note}</Text>}
                </View>
              </View>

              <View style={styles.logRight}>
                <Text
                  style={[
                    styles.logAmount,
                    item.kind === 'income' ? styles.incomeText : styles.expenseText,
                  ]}
                >
                  {item.kind === 'income' ? '+' : item.kind === 'transfer' ? '' : '−'}
                  {money(item.amount, item.currency)}
                </Text>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteItem(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    marginHorizontal: 16,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.line,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.ink,
  },
  clearSearch: {
    fontSize: 14,
    color: theme.colors.mute,
    padding: 4,
  },
  filterChipScroll: {
    maxHeight: 46,
    marginVertical: 8,
  },
  filterChipRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  chipActive: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.mute,
  },
  chipTextActive: {
    color: '#FFF',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  logCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...theme.shadowCard,
  },
  logLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 20,
  },
  infoCol: {
    flex: 1,
  },
  logTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  logMeta: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  correctionBadge: {
    backgroundColor: theme.colors.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.xs,
  },
  correctionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.warningText,
  },
  sharedBadge: {
    backgroundColor: theme.colors.blueLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.xs,
  },
  sharedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.blue,
  },
  logNote: {
    fontSize: 12,
    color: theme.colors.inkSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  logRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  logAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  incomeText: {
    color: theme.colors.brandDark,
  },
  expenseText: {
    color: theme.colors.ink,
  },
  deleteBtn: {
    padding: 2,
  },
  deleteBtnText: {
    fontSize: 13,
    color: theme.colors.mute,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
    ...theme.shadow,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.ink,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: theme.colors.mute,
    textAlign: 'center',
    lineHeight: 18,
  },
});
