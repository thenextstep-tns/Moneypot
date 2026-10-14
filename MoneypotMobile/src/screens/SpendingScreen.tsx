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
import Svg, { Path, G, Text as SvgText } from 'react-native-svg';
import { useData } from '../context/DataContext';
import { convert } from '../domain/fx';
import {
  today,
  addDays,
  thisMonth,
  shiftMonth,
  monthRange,
  monthLabel,
  money,
} from '../domain/schedule';
import { theme, useStyles, useTheme, type Theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import { TopHeader } from '../components/TopHeader';

const SCREEN_WIDTH = Dimensions.get('window').width;

type PeriodType = 'this_month' | 'last_month' | 'last_30' | 'this_year' | 'all_time';

interface SubcatSpending {
  key: string;
  potId: string;
  potName: string;
  potEmoji: string;
  potColor: string;
  subcategory: string;
  total: number;
  count: number;
  avgPerOp: number;
  percentage: number;
  sliceColor: string;
}

interface PieSlice extends SubcatSpending {
  startAngle: number;
  endAngle: number;
  midAngle: number;
  pathD: string;
}

function hexToHsl(hex: string): [number, number, number] {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return [210, 50, 50];
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function getSubcatColor(potColor: string, index: number, totalInPot: number): string {
  if (totalInPot <= 1) return potColor;
  const [h, s, l] = hexToHsl(potColor);
  const step = totalInPot > 1 ? 32 / (totalInPot - 1) : 0;
  const targetL = Math.min(82, Math.max(26, (l - 16) + index * step));
  const hueShift = totalInPot > 2 ? ((index % 2 === 0 ? 1 : -1) * (index * 3)) : 0;
  const targetH = (h + hueShift + 360) % 360;
  return `hsl(${targetH}, ${Math.max(35, s)}%, ${targetL}%)`;
}

function createDonutArc(
  cx: number,
  cy: number,
  R: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const delta = endAngle - startAngle;
  if (delta >= 2 * Math.PI - 0.001) {
    return [
      `M ${cx} ${cy - R}`,
      `A ${R} ${R} 0 1 1 ${cx} ${cy + R}`,
      `A ${R} ${R} 0 1 1 ${cx} ${cy - R}`,
      `M ${cx} ${cy - r}`,
      `A ${r} ${r} 0 1 0 ${cx} ${cy + r}`,
      `A ${r} ${r} 0 1 0 ${cx} ${cy - r}`,
      'Z',
    ].join(' ');
  }

  const theta1 = startAngle - Math.PI / 2;
  const theta2 = endAngle - Math.PI / 2;
  const x1 = cx + R * Math.cos(theta1);
  const y1 = cy + R * Math.sin(theta1);
  const x2 = cx + R * Math.cos(theta2);
  const y2 = cy + R * Math.sin(theta2);
  const ix2 = cx + r * Math.cos(theta2);
  const iy2 = cy + r * Math.sin(theta2);
  const ix1 = cx + r * Math.cos(theta1);
  const iy1 = cy + r * Math.sin(theta1);
  const largeArc = delta > Math.PI ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${ix2} ${iy2}`,
    `A ${r} ${r} 0 ${largeArc} 0 ${ix1} ${iy1}`,
    'Z',
  ].join(' ');
}

export function SpendingScreen() {
  const { payments, categories, settings } = useData();
  const { theme } = useTheme();
  const styles = useStyles(getStyles);
  const [period, setPeriod] = useState<PeriodType>('this_month');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const curCurrency = settings.currency || 'EUR';

  // Date range
  const { startDate, endDate, periodLabel } = useMemo(() => {
    const todayStr = today();
    const currentYm = thisMonth();
    const curYear = new Date().getFullYear();

    if (period === 'this_month') {
      const [start, end] = monthRange(currentYm);
      return { startDate: start, endDate: end, periodLabel: monthLabel(currentYm) };
    }
    if (period === 'last_month') {
      const lastYm = shiftMonth(currentYm, -1);
      const [start, end] = monthRange(lastYm);
      return { startDate: start, endDate: end, periodLabel: monthLabel(lastYm) };
    }
    if (period === 'last_30') {
      const start = addDays(todayStr, -29);
      return { startDate: start, endDate: todayStr, periodLabel: 'Last 30 Days' };
    }
    if (period === 'this_year') {
      return { startDate: `${curYear}-01-01`, endDate: `${curYear}-12-31`, periodLabel: `Year ${curYear}` };
    }
    return { startDate: '2000-01-01', endDate: '2099-12-31', periodLabel: 'All Time' };
  }, [period]);

  // Aggregation
  const { rundownList, grandTotal, totalOperations } = useMemo(() => {
    const catMap = new Map(categories.map(c => [c.id, c]));
    const itemMap = new Map<string, {
      potId: string;
      potName: string;
      potEmoji: string;
      potColor: string;
      subcategory: string;
      total: number;
      count: number;
    }>();

    const potTotalMap = new Map<string, number>();

    for (const p of payments) {
      if (p.kind !== 'expense' || p.status !== 'confirmed') continue;
      if (p.date < startDate || p.date > endDate) continue;

      const pot = p.categoryId ? catMap.get(p.categoryId) : undefined;
      const potId = pot?.id || 'other';
      const potName = pot?.name || 'Other / General';
      const potEmoji = pot?.emoji || '📦';
      const potColor = pot?.color || '#9AA0A6';
      const subcategory = (p.subcategory || '').trim() || 'General';

      const key = `${potId}:::${subcategory}`;
      const convertedAmt = convert(p.amount, p.currency, curCurrency);

      const existing = itemMap.get(key) || {
        potId,
        potName,
        potEmoji,
        potColor,
        subcategory,
        total: 0,
        count: 0,
      };

      existing.total += convertedAmt;
      existing.count += 1;
      itemMap.set(key, existing);

      potTotalMap.set(potId, (potTotalMap.get(potId) ?? 0) + convertedAmt);
    }

    const grand = Array.from(itemMap.values()).reduce((sum, item) => sum + item.total, 0);
    const ops = Array.from(itemMap.values()).reduce((sum, item) => sum + item.count, 0);

    // Group by pot
    const potGroups = new Map<string, Array<typeof itemMap extends Map<any, infer V> ? V : never>>();
    for (const item of itemMap.values()) {
      if (!potGroups.has(item.potId)) potGroups.set(item.potId, []);
      potGroups.get(item.potId)!.push(item);
    }

    const sortedPots = Array.from(potGroups.entries()).sort(
      ([potA], [potB]) => (potTotalMap.get(potB) ?? 0) - (potTotalMap.get(potA) ?? 0)
    );

    const orderedGrouped: SubcatSpending[] = [];

    for (const [, subItems] of sortedPots) {
      subItems.sort((a, b) => b.total - a.total);
      subItems.forEach((item, idx) => {
        const percentage = grand > 0 ? (item.total / grand) * 100 : 0;
        const avgPerOp = item.count > 0 ? item.total / item.count : 0;
        const sliceColor = getSubcatColor(item.potColor, idx, subItems.length);
        orderedGrouped.push({
          key: `${item.potId}:::${item.subcategory}`,
          ...item,
          percentage,
          avgPerOp,
          sliceColor,
        });
      });
    }

    // Rundown starting with biggest % subcategory
    const rundown = [...orderedGrouped].sort((a, b) => b.total - a.total);

    return {
      rundownList: rundown,
      grandTotal: grand,
      totalOperations: ops,
    };
  }, [payments, categories, startDate, endDate, curCurrency]);

  // Slices
  const slices: PieSlice[] = useMemo(() => {
    if (grandTotal <= 0) return [];
    let currentAngle = 0;
    const cx = 150;
    const cy = 150;
    const R = 130;
    const r = 70;

    return rundownList.map(item => {
      const fraction = item.total / grandTotal;
      const angle = fraction * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      const midAngle = (startAngle + endAngle) / 2;
      currentAngle = endAngle;

      const pathD = createDonutArc(cx, cy, R, r, startAngle, endAngle);

      return {
        ...item,
        startAngle,
        endAngle,
        midAngle,
        pathD,
      };
    });
  }, [rundownList, grandTotal]);

  const activeItem = useMemo(() => {
    if (!selectedKey) return null;
    return rundownList.find(i => i.key === selectedKey) || null;
  }, [selectedKey, rundownList]);

  const overallAvgPerOp = totalOperations > 0 ? grandTotal / totalOperations : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopHeader title="Spending" subtitle={`Breakdown for ${periodLabel}`} />

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Period Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.periodScroll}
          contentContainerStyle={styles.periodContent}
        >
          {(
            [
              ['this_month', 'This Month'],
              ['last_month', 'Last Month'],
              ['last_30', 'Last 30 Days'],
              ['this_year', 'This Year'],
              ['all_time', 'All Time'],
            ] as const
          ).map(([val, label]) => (
            <TouchableOpacity
              key={val}
              style={[styles.periodChip, period === val && styles.periodChipActive]}
              onPress={() => {
                triggerHaptic('light');
                setPeriod(val);
                setSelectedKey(null);
              }}
            >
              <Text style={[styles.periodChipText, period === val && styles.periodChipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {grandTotal <= 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🥧</Text>
            <Text style={styles.emptyTitle}>No expenses recorded</Text>
            <Text style={styles.emptySub}>
              There are no confirmed expenses in this timeframe. Select another period or record an operation.
            </Text>
          </View>
        ) : (
          <>
            {/* KPI Cards */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Total Spent</Text>
                <Text style={[styles.kpiValue, { color: theme.colors.brandDark }]}>
                  {money(grandTotal, curCurrency)}
                </Text>
                <Text style={styles.kpiSub}>In {curCurrency}</Text>
              </View>

              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Operations</Text>
                <Text style={styles.kpiValue}>{totalOperations}</Text>
                <Text style={styles.kpiSub}>Confirmed</Text>
              </View>

              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Avg per Op</Text>
                <Text style={styles.kpiValue}>{money(overallAvgPerOp, curCurrency)}</Text>
                <Text style={styles.kpiSub}>Overall</Text>
              </View>
            </View>

            {/* Interactive SVG Donut */}
            <View style={styles.chartCard}>
              <Text style={styles.chartHint}>Tap any slice to inspect subcategory details</Text>

              <View style={styles.donutContainer}>
                <Svg width={300} height={300} viewBox="0 0 300 300">
                  <G>
                    {slices.map(slice => {
                      const isSelected = selectedKey === slice.key;
                      return (
                        <Path
                          key={slice.key}
                          d={slice.pathD}
                          fill={slice.sliceColor}
                          stroke="#ffffff"
                          strokeWidth={isSelected ? 3.5 : 1.5}
                          onPress={() => {
                            triggerHaptic('light');
                            setSelectedKey(prev => (prev === slice.key ? null : slice.key));
                          }}
                        />
                      );
                    })}
                  </G>

                  {/* Center Text */}
                  <G pointerEvents="none">
                    {activeItem ? (
                      <>
                        <SvgText
                          x="150"
                          y="130"
                          textAnchor="middle"
                          fontSize="22"
                        >
                          {activeItem.potEmoji}
                        </SvgText>
                        <SvgText
                          x="150"
                          y="150"
                          textAnchor="middle"
                          fontSize="13"
                          fontWeight="700"
                          fill={theme.colors.ink}
                        >
                          {activeItem.subcategory.length > 16
                            ? `${activeItem.subcategory.slice(0, 14)}…`
                            : activeItem.subcategory}
                        </SvgText>
                        <SvgText
                          x="150"
                          y="172"
                          textAnchor="middle"
                          fontSize="18"
                          fontWeight="800"
                          fill={activeItem.sliceColor}
                        >
                          {activeItem.percentage.toFixed(1)}%
                        </SvgText>
                        <SvgText
                          x="150"
                          y="190"
                          textAnchor="middle"
                          fontSize="11"
                          fill="#64748B"
                        >
                          {money(activeItem.total, curCurrency)}
                        </SvgText>
                      </>
                    ) : (
                      <>
                        <SvgText
                          x="150"
                          y="140"
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="700"
                          fill="#94A3B8"
                        >
                          TOTAL SPENT
                        </SvgText>
                        <SvgText
                          x="150"
                          y="166"
                          textAnchor="middle"
                          fontSize="18"
                          fontWeight="800"
                          fill={theme.colors.ink}
                        >
                          {money(grandTotal, curCurrency)}
                        </SvgText>
                        <SvgText
                          x="150"
                          y="186"
                          textAnchor="middle"
                          fontSize="11"
                          fill={theme.colors.mute}
                        >
                          {totalOperations} ops
                        </SvgText>
                      </>
                    )}
                  </G>
                </Svg>
              </View>

              {/* Active Selection Details Card */}
              {activeItem && (
                <View style={styles.selectedDetailCard}>
                  <View style={styles.detailHeader}>
                    <Text style={styles.detailTitle}>
                      {activeItem.potEmoji} {activeItem.potName} › {activeItem.subcategory}
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedKey(null)}>
                      <Text style={styles.closeBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.detailStats}>
                    <View>
                      <Text style={styles.detailStatLabel}>Spent</Text>
                      <Text style={styles.detailStatVal}>{money(activeItem.total, curCurrency)}</Text>
                    </View>
                    <View>
                      <Text style={styles.detailStatLabel}>Share</Text>
                      <Text style={[styles.detailStatVal, { color: activeItem.sliceColor }]}>
                        {activeItem.percentage.toFixed(1)}%
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.detailStatLabel}>Avg per Op</Text>
                      <Text style={styles.detailStatVal}>{money(activeItem.avgPerOp, curCurrency)}</Text>
                    </View>
                    <View>
                      <Text style={styles.detailStatLabel}>Count</Text>
                      <Text style={styles.detailStatVal}>{activeItem.count} ops</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Ranked Rundown List Below */}
            <View style={styles.rundownSection}>
              <Text style={styles.sectionTitle}>Subcategories Breakdown</Text>
              <Text style={styles.sectionSub}>Starting with biggest % subcategories</Text>

              {rundownList.map((item, idx) => {
                const isSelected = selectedKey === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.rundownRow, isSelected && styles.rundownRowSelected]}
                    onPress={() => {
                      triggerHaptic('light');
                      setSelectedKey(prev => (prev === item.key ? null : item.key));
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.rankNum}>#{idx + 1}</Text>
                    <View style={[styles.swatch, { backgroundColor: item.sliceColor }]} />

                    <View style={styles.rowMain}>
                      <View style={styles.rowTop}>
                        <View style={styles.nameGroup}>
                          <Text style={styles.subcatName} numberOfLines={1}>
                            {item.subcategory}
                          </Text>
                          <Text style={styles.potTag}>
                            {item.potEmoji} {item.potName}
                          </Text>
                        </View>
                        <View style={styles.figureGroup}>
                          <Text style={styles.sumVal}>{money(item.total, curCurrency)}</Text>
                          <Text style={[styles.pctVal, { color: item.sliceColor }]}>
                            {item.percentage.toFixed(1)}%
                          </Text>
                        </View>
                      </View>

                      {/* Percentage Bar */}
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              width: `${Math.min(100, item.percentage)}%`,
                              backgroundColor: item.sliceColor,
                            },
                          ]}
                        />
                      </View>

                      <Text style={styles.opsSub}>
                        {item.count} {item.count === 1 ? 'op' : 'ops'} • Avg:{' '}
                        {money(item.avgPerOp, curCurrency)} / operation
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  periodScroll: {
    marginBottom: 14,
  },
  periodContent: {
    flexDirection: 'row',
    gap: 8,
  },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  periodChipActive: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
  },
  periodChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.mute,
  },
  periodChipTextActive: {
    color: theme.colors.bg,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.mute,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.ink,
    marginBottom: 2,
  },
  kpiSub: {
    fontSize: 11,
    color: theme.colors.mute,
  },
  chartCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.line,
    alignItems: 'center',
    marginBottom: 20,
  },
  chartHint: {
    fontSize: 12,
    color: theme.colors.mute,
    marginBottom: 6,
  },
  donutContainer: {
    width: 300,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedDetailCard: {
    marginTop: 12,
    width: '100%',
    backgroundColor: theme.colors.cardMuted,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  closeBtn: {
    fontSize: 14,
    color: theme.colors.mute,
    padding: 4,
  },
  detailStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailStatLabel: {
    fontSize: 10,
    color: theme.colors.mute,
    textTransform: 'uppercase',
  },
  detailStatVal: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.ink,
    marginTop: 2,
  },
  rundownSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  sectionSub: {
    fontSize: 12,
    color: theme.colors.mute,
    marginBottom: 12,
  },
  rundownRow: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rundownRowSelected: {
    borderColor: theme.colors.brand,
    backgroundColor: theme.colors.brandLight,
  },
  rankNum: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.mute,
    width: 24,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  rowMain: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameGroup: {
    flex: 1,
    marginRight: 8,
  },
  subcatName: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  potTag: {
    fontSize: 11,
    color: theme.colors.mute,
    marginTop: 1,
  },
  figureGroup: {
    alignItems: 'flex-end',
  },
  sumVal: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  pctVal: {
    fontSize: 12,
    fontWeight: '700',
  },
  barTrack: {
    height: 5,
    backgroundColor: theme.colors.line,
    borderRadius: 2.5,
    overflow: 'hidden',
    marginVertical: 4,
  },
  barFill: {
    height: '100%',
    borderRadius: 2.5,
  },
  opsSub: {
    fontSize: 11,
    color: theme.colors.mute,
  },
  emptyCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.line,
    marginTop: 20,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
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
