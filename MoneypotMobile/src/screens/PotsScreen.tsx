import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useData } from '../context/DataContext';
import {
  thisMonth,
  shiftMonth,
  monthRange,
  monthLabel,
  occurrences,
  money,
} from '../domain/schedule';
import { calcMonthStartingBalances } from '../domain/balances';
import { convert } from '../domain/fx';
import { theme, useStyles, type Theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import { TopHeader } from '../components/TopHeader';
import { CategoryEditModal } from '../components/CategoryEditModal';
import { GripVerticalIcon } from '../components/GripVerticalIcon';
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import type { Category } from '../domain/types';

export function PotsScreen() {
  const { categories, plans, payments, accounts, stashes, transfers, settings, reorder } = useData();
  const styles = useStyles(getStyles);

  const currentYm = thisMonth();
  const [selectedYm, setSelectedYm] = useState<string>(currentYm);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const [monthStart, monthEnd] = monthRange(selectedYm);
  const monthOccurrences = occurrences(plans, payments, monthStart, monthEnd);

  // 1. Starting liquid balance for this month
  const startingProjection = calcMonthStartingBalances(
    accounts,
    payments,
    transfers,
    plans,
    stashes,
    selectedYm,
    settings.currency
  );
  const startingAvailable = startingProjection.totalAvailable;
  const startingTotalLiquid = startingProjection.totalLiquid;
  const startingTotalStashed = startingProjection.totalStashed;

  // 2. Coming in (Income) & 3. Going out (Expense & Saving, strictly excluding internal transfers)
  let incomePaid = 0;
  let incomePlanned = 0;
  let expensePaid = 0;
  let expensePlanned = 0;

  for (const o of monthOccurrences) {
    if (o.kind === 'transfer') continue; // Excluded from Pots budget
    const amtInMain = convert(o.amount, o.currency, settings.currency);

    if (o.kind === 'income') {
      if (o.status === 'confirmed') incomePaid += amtInMain;
      else if (o.status === 'pending') incomePlanned += amtInMain;
    } else {
      if (o.status === 'confirmed') expensePaid += amtInMain;
      else if (o.status === 'pending') expensePlanned += amtInMain;
    }
  }

  const totalComingIn = incomePaid + incomePlanned;
  const totalGoingOut = expensePaid + expensePlanned;
  const flowNet = totalComingIn - totalGoingOut;

  const isFutureMonth = selectedYm > currentYm;
  const isPastMonth = selectedYm < currentYm;

  // Month-end outlook (available to spend at month end):
  // For current month: starting available + pending in - pending out
  // For past month: starting available + paid in - paid out
  // For future month: starting available + planned in - planned out (all pending)
  const monthEndAvailable = isPastMonth
    ? startingAvailable + incomePaid - expensePaid
    : startingAvailable + incomePlanned - expensePlanned;
  const monthEndTotal = isPastMonth
    ? startingTotalLiquid + incomePaid - expensePaid
    : startingTotalLiquid + incomePlanned - expensePlanned;
  const isShortfall = monthEndAvailable < 0;
  const isCoveredByBalance = !isShortfall && flowNet < 0;

  const handlePrevMonth = () => {
    triggerHaptic('light');
    setSelectedYm(shiftMonth(selectedYm, -1));
  };

  const handleNextMonth = () => {
    triggerHaptic('light');
    setSelectedYm(shiftMonth(selectedYm, 1));
  };

  const handleBackToNow = () => {
    triggerHaptic('light');
    setSelectedYm(currentYm);
  };

  const handleOpenAdd = () => {
    triggerHaptic('light');
    setActiveCategory(null);
    setModalVisible(true);
  };

  const handleCategoryPress = (cat: Category) => {
    triggerHaptic('light');
    setActiveCategory(cat);
    setModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopHeader
        title="Pots"
        subtitle="Monthly Budget Envelopes"
        rightAction={
          <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
            <Text style={styles.addBtnText}>+ Add Pot</Text>
          </TouchableOpacity>
        }
      />

      {/* Month Selector Bar */}
      <View style={styles.monthSelectorBar}>
        <TouchableOpacity style={styles.monthNavBtn} onPress={handlePrevMonth}>
          <Text style={styles.monthNavIcon}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleBackToNow}>
          <Text style={styles.monthTitle}>{monthLabel(selectedYm)}</Text>
          {selectedYm !== currentYm && (
            <Text style={styles.backToNowSub}>Tap to return to now</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.monthNavBtn} onPress={handleNextMonth}>
          <Text style={styles.monthNavIcon}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Consecutive Future Projection Banner */}
      {isFutureMonth && (
        <View style={styles.futureBanner}>
          <Text style={styles.futureBannerText}>
            🔮 Future Month: Projected starting balance factors in prior months' pending plans.
          </Text>
        </View>
      )}

      {/* Top 4 KPI Cards Grid */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>
            {selectedYm === currentYm ? 'Available in accounts' : isFutureMonth ? 'Projected available' : 'Starting balance'}
          </Text>
          <Text style={styles.kpiValue}>{money(startingAvailable, settings.currency)}</Text>
          <Text style={styles.kpiSub}>
            {selectedYm === currentYm
              ? `Total: ${money(startingTotalLiquid, settings.currency)}${startingTotalStashed > 0 ? ` · 🔒 ${money(startingTotalStashed, settings.currency)}` : ''}`
              : isFutureMonth
              ? `Prior plans factored${startingTotalStashed > 0 ? ` · 🔒 ${money(startingTotalStashed, settings.currency)}` : ''}`
              : `Total: ${money(startingTotalLiquid, settings.currency)}`}
          </Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Coming in</Text>
          <Text style={[styles.kpiValue, { color: theme.colors.brandDark }]}>
            +{money(totalComingIn, settings.currency)}
          </Text>
          <Text style={styles.kpiSub}>
            {incomePaid > 0 ? `Paid: ${money(incomePaid, settings.currency)}` : '0 paid'}
            {incomePlanned > 0 ? ` · ${money(incomePlanned, settings.currency)} left` : ''}
          </Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Going out</Text>
          <Text style={[styles.kpiValue, { color: theme.colors.ink }]}>
            −{money(totalGoingOut, settings.currency)}
          </Text>
          <Text style={styles.kpiSub}>
            {expensePaid > 0 ? `Paid: ${money(expensePaid, settings.currency)}` : '0 paid'}
            {expensePlanned > 0 ? ` · ${money(expensePlanned, settings.currency)} left` : ''}
          </Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>
            {isShortfall ? 'Projected shortfall' : 'Month-end outlook'}
          </Text>
          <Text
            style={[
              styles.kpiValue,
              isShortfall ? { color: theme.colors.bad } : { color: theme.colors.brandDark },
            ]}
          >
            {money(isShortfall ? Math.abs(monthEndAvailable) : monthEndAvailable, settings.currency)}
          </Text>
          <Text style={styles.kpiSub}>
            {isShortfall
              ? 'Short of budget'
              : isCoveredByBalance
              ? `Covers ${money(Math.abs(flowNet), settings.currency)} deficit`
              : `+${money(flowNet, settings.currency)} net surplus`}
          </Text>
        </View>
      </View>

      {/* Pots Grid */}
      <DraggableFlatList
        data={categories}
        keyExtractor={item => item.id}
        onDragBegin={() => triggerHaptic('medium')}
        onDragEnd={({ data }) => {
          triggerHaptic('light');
          reorder('categories', data);
        }}
        containerStyle={styles.container}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
          <Text style={styles.sectionTitle}>Budget Pots ({categories.length})</Text>
        }
        renderItem={({ item: cat, drag, isActive }: RenderItemParams<Category>) => {
          const catOccurrences = monthOccurrences.filter(o => o.categoryId === cat.id);
          let paidAmt = 0;
          let plannedAmt = 0;

          for (const o of catOccurrences) {
            const amtInMain = convert(o.amount, o.currency, settings.currency);
            if (o.status === 'confirmed') paidAmt += amtInMain;
            else if (o.status === 'pending') plannedAmt += amtInMain;
          }

          const totalExpected = paidAmt + plannedAmt;
          const progressPercent = totalExpected > 0 ? Math.min(100, Math.round((paidAmt / totalExpected) * 100)) : 0;

          return (
            <ScaleDecorator>
              <View style={[styles.potCard, isActive && styles.cardActive]}>
                <TouchableOpacity
                  onPress={() => handleCategoryPress(cat)}
                  disabled={isActive}
                >
                  <View style={styles.potHeader}>
                    <View style={styles.potLeft}>
                      <TouchableOpacity
                        style={styles.dragHandle}
                        onPressIn={drag}
                        disabled={isActive}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      >
                        <GripVerticalIcon size={18} color={isActive ? theme.colors.brand : '#9CA3AF'} />
                      </TouchableOpacity>
                      <View style={[styles.potEmojiCircle, { backgroundColor: cat.color ? `${cat.color}20` : theme.colors.bg }]}>
                        <Text style={styles.potEmoji}>{cat.emoji}</Text>
                      </View>
                      <View>
                        <Text style={styles.potName}>{cat.name}</Text>
                        <Text style={styles.potKind}>
                          {cat.kind === 'income' ? 'Income Pot' : cat.kind === 'saving' ? 'Savings Pot' : 'Spending Pot'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.potRight}>
                      <Text style={styles.potTotal}>{money(totalExpected, settings.currency)}</Text>
                      <Text style={styles.potPaidSub}>Paid: {money(paidAmt, settings.currency)}</Text>
                    </View>
                  </View>

                  {/* Progress Bar */}
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${progressPercent}%`,
                          backgroundColor: cat.color || theme.colors.brand,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.potFooter}>
                    <Text style={styles.potFooterText}>{progressPercent}% realized this month</Text>
                    {cat.sharedWith && cat.sharedWith.length > 0 && (
                      <View style={styles.sharedBadge}>
                        <Text style={styles.sharedBadgeText}>👥 Shared</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            </ScaleDecorator>
          );
        }}
      />

      {/* Category Edit Modal */}
      <CategoryEditModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        categoryToEdit={activeCategory}
      />
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  addBtn: {
    backgroundColor: theme.colors.brand,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
  },
  addBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  monthSelectorBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadow,
  },
  monthNavIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.ink,
    textAlign: 'center',
  },
  backToNowSub: {
    fontSize: 11,
    color: theme.colors.brand,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  futureBanner: {
    backgroundColor: theme.colors.purpleLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    borderRadius: theme.radius.sm,
    marginBottom: 8,
  },
  futureBannerText: {
    fontSize: 12,
    color: theme.colors.purple,
    fontWeight: '600',
    textAlign: 'center',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  kpiCard: {
    width: '48.5%',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: 12,
    ...theme.shadow,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.mute,
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.ink,
    marginTop: 4,
  },
  kpiSub: {
    fontSize: 11,
    color: theme.colors.mute,
    marginTop: 2,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginVertical: 10,
  },
  potCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 10,
    ...theme.shadowCard,
  },
  cardActive: {
    opacity: 0.95,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  potHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  potLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dragHandle: {
    paddingRight: 4,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  potEmojiCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  potEmoji: {
    fontSize: 22,
  },
  potName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  potKind: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  potRight: {
    alignItems: 'flex-end',
  },
  potTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  potPaidSub: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: theme.colors.bg,
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  potFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  potFooterText: {
    fontSize: 11,
    color: theme.colors.mute,
    fontWeight: '500',
  },
  sharedBadge: {
    backgroundColor: theme.colors.blueLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.xs,
  },
  sharedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.blue,
  },
});
