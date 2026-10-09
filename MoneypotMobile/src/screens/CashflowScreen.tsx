import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import Svg, { Rect, Path, Line, Text as SvgText, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useData } from '../context/DataContext';
import { calculateCashflowRange, type DayCashflow, type CashflowItem } from '../domain/cashflow';
import { today, addDays, thisMonth, monthRange, weekRange, money } from '../domain/schedule';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import { TopHeader } from '../components/TopHeader';

const SCREEN_WIDTH = Dimensions.get('window').width;

export function CashflowScreen() {
  const { accounts, payments, transfers, plans, stashes, categories, settings } = useData();

  const [rangeMode, setRangeMode] = useState<'month' | 'week' | '30days'>('30days');
  const t = today();

  const [fromDate, toDate] = useMemo(() => {
    if (rangeMode === 'week') {
      return weekRange(t);
    }
    if (rangeMode === 'month') {
      return monthRange(thisMonth());
    }
    // 30 days: from 7 days ago to 23 days ahead
    return [addDays(t, -7), addDays(t, 23)];
  }, [rangeMode, t]);

  const cashflowData: DayCashflow[] = useMemo(() => {
    return calculateCashflowRange(
      fromDate,
      toDate,
      accounts,
      payments,
      transfers,
      plans,
      stashes,
      categories,
      settings.currency
    );
  }, [fromDate, toDate, accounts, payments, transfers, plans, stashes, categories, settings.currency]);

  // Selected date defaults to today if present, or first date
  const [selectedDate, setSelectedDate] = useState<string>(t);

  const activeDay = useMemo(() => {
    return cashflowData.find(d => d.date === selectedDate) || cashflowData[0] || null;
  }, [cashflowData, selectedDate]);

  // Chart measurements
  const chartHeight = 180;
  const paddingBottom = 26;
  const chartInnerHeight = chartHeight - paddingBottom;
  const numDays = cashflowData.length;
  const colWidth = Math.max(14, (SCREEN_WIDTH - 32) / numDays);
  const chartTotalWidth = Math.max(SCREEN_WIDTH - 32, numDays * colWidth);

  // Maximum cumulative height (Accounts Total Cash)
  const maxVal = useMemo(() => {
    let max = 100;
    for (const d of cashflowData) {
      const top = Math.max(d.totalBalance, d.totalAvailable, 0);
      if (top > max) max = top;
    }
    return max * 1.1; // 10% breathing room
  }, [cashflowData]);

  const scaleY = (val: number) => {
    return chartInnerHeight - (val / maxVal) * chartInnerHeight;
  };

  const handleSelectDay = (d: DayCashflow) => {
    triggerHaptic('light');
    setSelectedDate(d.date);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopHeader
        title="Cashflow"
        subtitle="Trajectory & Interactive Projection"
      />

      {/* Range Mode Switcher */}
      <View style={styles.rangeRow}>
        {[
          { key: '30days', label: 'Rolling 30 Days' },
          { key: 'month', label: 'This Month' },
          { key: 'week', label: 'This Week' },
        ].map(r => {
          const active = rangeMode === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              style={[styles.rangeChip, active && styles.rangeChipActive]}
              onPress={() => {
                triggerHaptic('light');
                setRangeMode(r.key as any);
              }}
            >
              <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={styles.mainContainer} contentContainerStyle={styles.scrollContent}>
        {/* Interactive Chart Container */}
        <View style={styles.chartWrapper}>
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.brand }]} />
              <Text style={styles.legendText}>Available to Spend</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#9CA3AF' }]} />
              <Text style={styles.legendText}>🔒 Stashed (Reserved)</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
            <Svg width={chartTotalWidth} height={chartHeight}>
              <Defs>
                <LinearGradient id="stashedGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#9CA3AF" stopOpacity="0.8" />
                  <Stop offset="1" stopColor="#D1D5DB" stopOpacity="0.4" />
                </LinearGradient>
              </Defs>

              {/* Zero baseline */}
              <Line
                x1="0"
                y1={chartInnerHeight}
                x2={chartTotalWidth}
                y2={chartInnerHeight}
                stroke={theme.colors.line}
                strokeWidth="1.5"
              />

              {cashflowData.map((d, idx) => {
                const x = idx * colWidth;
                const isSelected = d.date === selectedDate;
                const isTodayDate = d.date === t;

                // Available spending cash height (base green bar)
                const availY = scaleY(d.totalAvailable);
                const availH = Math.max(0, chartInnerHeight - availY);

                // Total accounts physical height (top of bar)
                const totalY = scaleY(d.totalBalance);
                // Stashed layer sits inside the top of the bar, between availY and totalY
                const stashedH = Math.max(0, availY - totalY);

                return (
                  <G key={d.date} onPress={() => handleSelectDay(d)}>
                    {/* Selected column highlight background */}
                    {isSelected && (
                      <Rect
                        x={x}
                        y={0}
                        width={colWidth}
                        height={chartInnerHeight + 20}
                        fill="rgba(47, 163, 107, 0.12)"
                        rx={4}
                      />
                    )}

                    {/* Today indicator line */}
                    {isTodayDate && (
                      <Line
                        x1={x + colWidth / 2}
                        y1={0}
                        x2={x + colWidth / 2}
                        y2={chartInnerHeight}
                        stroke={theme.colors.brand}
                        strokeWidth="1"
                        strokeDasharray="2,2"
                      />
                    )}

                    {/* Available Cash Bar */}
                    <Rect
                      x={x + 2}
                      y={availY}
                      width={Math.max(2, colWidth - 4)}
                      height={availH}
                      fill={theme.colors.brand}
                      rx={d.totalStashed > 0 && stashedH > 0 ? 0 : 2}
                    />

                    {/* Stashed Layer Bar (Reserved inside account) */}
                    {d.totalStashed > 0 && stashedH > 0 && (
                      <Rect
                        x={x + 2}
                        y={totalY}
                        width={Math.max(2, colWidth - 4)}
                        height={stashedH}
                        fill="url(#stashedGrad)"
                        rx={2}
                      />
                    )}

                    {/* Date label at bottom */}
                    {(idx % Math.ceil(numDays / 7) === 0 || isSelected) && (
                      <SvgText
                        x={x + colWidth / 2}
                        y={chartHeight - 6}
                        fontSize="10"
                        fontWeight={isSelected ? 'bold' : 'normal'}
                        fill={isSelected ? theme.colors.brandDark : theme.colors.mute}
                        textAnchor="middle"
                      >
                        {d.dayLabel}
                      </SvgText>
                    )}
                  </G>
                );
              })}
            </Svg>
          </ScrollView>
        </View>

        {/* Active Selected Day Card */}
        {activeDay && (
          <View style={styles.dayCard}>
            <View style={styles.dayCardHeader}>
              <View>
                <Text style={styles.dayDateTitle}>{activeDay.fullLabel}</Text>
                <Text style={styles.dayStatusMeta}>
                  {activeDay.isToday ? 'Today' : activeDay.isFuture ? 'Future Projection' : 'Past Audit'}
                </Text>
              </View>

              <View style={styles.dayNetBadge}>
                <Text
                  style={[
                    styles.dayNetText,
                    activeDay.netChange > 0
                      ? styles.textPositive
                      : activeDay.netChange < 0
                      ? styles.textNegative
                      : styles.textNeutral,
                  ]}
                >
                  {activeDay.netChange > 0 ? '+' : ''}{money(activeDay.netChange, settings.currency)}
                </Text>
              </View>
            </View>

            {/* Total Balance Breakdown */}
            <View style={styles.balanceStrip}>
              <View style={styles.balanceCol}>
                <Text style={styles.balColLabel}>Available to Spend</Text>
                <Text style={[styles.balColVal, { color: theme.colors.brandDark }]}>
                  {money(activeDay.totalAvailable, settings.currency)}
                </Text>
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceCol}>
                <Text style={styles.balColLabel}>🔒 Reserved</Text>
                <Text style={[styles.balColVal, { color: '#6B7280' }]}>
                  {money(activeDay.totalStashed, settings.currency)}
                </Text>
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceCol}>
                <Text style={styles.balColLabel}>Total in Accounts</Text>
                <Text style={[styles.balColVal, { color: theme.colors.ink }]}>
                  {money(activeDay.totalBalance, settings.currency)}
                </Text>
              </View>
            </View>

            {/* Account Chips */}
            <Text style={styles.subHeading}>Liquid Accounts on this day</Text>
            <View style={styles.chipsRow}>
              {activeDay.accounts.map(acc => (
                <View key={acc.accountId} style={styles.accountChip}>
                  <View style={[styles.accChipDot, { backgroundColor: acc.accountColor }]} />
                  <Text style={styles.accChipName}>{acc.accountName}:</Text>
                  <Text style={styles.accChipAmount}>{money(acc.availableOriginal, acc.currency)} free</Text>
                  {acc.stashedOriginal > 0 && (
                    <Text style={{ fontSize: 11, color: theme.colors.mute }}> ({money(acc.balanceOriginal, acc.currency)})</Text>
                  )}
                </View>
              ))}
            </View>

            {/* Stash Chips */}
            {activeDay.stashes.length > 0 && (
              <>
                <Text style={styles.subHeading}>Stashed Savings on this day</Text>
                <View style={styles.chipsRow}>
                  {activeDay.stashes.map(st => (
                    <View key={st.stashId} style={styles.stashChip}>
                      <Text style={styles.stashChipEmoji}>{st.stashEmoji}</Text>
                      <Text style={styles.stashChipName}>{st.stashName}:</Text>
                      <Text style={styles.stashChipAmount}>{money(st.balanceOriginal, st.currency)}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Transactions on this day */}
            <Text style={styles.subHeading}>
              Transactions on this day ({activeDay.items.length})
            </Text>
            {activeDay.items.length === 0 ? (
              <Text style={styles.noTransactionsText}>No scheduled payments on this date.</Text>
            ) : (
              activeDay.items.map(item => (
                <View key={item.id} style={styles.txRow}>
                  <View style={styles.txLeft}>
                    <Text style={styles.txEmoji}>{item.emoji || '🧾'}</Text>
                    <View>
                      <Text style={styles.txName}>{item.name}</Text>
                      <Text style={styles.txMeta}>
                        {item.accountName ? `${item.accountName} • ` : ''}
                        {item.status === 'confirmed' ? '✓ Confirmed' : '⏳ Scheduled'}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.txAmount,
                      item.kind === 'income' ? styles.textPositive : styles.textNegative,
                    ]}
                  >
                    {item.kind === 'income' ? '+' : '−'}{money(item.amount, item.currency)}
                  </Text>
                </View>
              ))
            )}
          </View>
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
  rangeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rangeChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    alignItems: 'center',
  },
  rangeChipActive: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
  },
  rangeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.mute,
  },
  rangeChipTextActive: {
    color: '#FFF',
  },
  mainContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  chartWrapper: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
    marginBottom: 14,
    ...theme.shadowCard,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: theme.colors.mute,
    fontWeight: '600',
  },
  dayCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 18,
    ...theme.shadowCard,
  },
  dayCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dayDateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  dayStatusMeta: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  dayNetBadge: {
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
  },
  dayNetText: {
    fontSize: 14,
    fontWeight: '800',
  },
  textPositive: {
    color: theme.colors.brandDark,
  },
  textNegative: {
    color: theme.colors.ink,
  },
  textNeutral: {
    color: theme.colors.mute,
  },
  balanceStrip: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 12,
    marginVertical: 10,
  },
  balanceCol: {
    flex: 1,
    alignItems: 'center',
  },
  balanceDivider: {
    width: 1,
    backgroundColor: theme.colors.line,
  },
  balColLabel: {
    fontSize: 11,
    color: theme.colors.mute,
    fontWeight: '600',
  },
  balColVal: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.ink,
    marginTop: 2,
  },
  subHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.mute,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    gap: 6,
  },
  accChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  accChipName: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  accChipAmount: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  stashChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    gap: 6,
  },
  stashChipEmoji: {
    fontSize: 14,
  },
  stashChipName: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  stashChipAmount: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.brandDark,
  },
  noTransactionsText: {
    fontSize: 13,
    color: theme.colors.mute,
    fontStyle: 'italic',
    marginVertical: 4,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lineLight,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  txEmoji: {
    fontSize: 20,
  },
  txName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.ink,
  },
  txMeta: {
    fontSize: 11,
    color: theme.colors.mute,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
});
