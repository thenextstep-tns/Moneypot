import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useData } from '../context/DataContext';
import { freqLabel, perMonth, money } from '../domain/schedule';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import { TopHeader } from '../components/TopHeader';
import { PlanEditModal } from '../components/PlanEditModal';
import type { Plan, Kind } from '../domain/types';

export function PlansScreen() {
  const { plans, categories, accounts, stashes, settings } = useData();
  const [filter, setFilter] = useState<'all' | 'income' | 'expense' | 'saving' | 'transfer'>('all');
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const filteredPlans = plans.filter(p => {
    if (filter === 'all') return true;
    return p.kind === filter;
  });

  const totalMonthlyExpense = plans
    .filter(p => p.kind === 'expense')
    .reduce((sum, p) => sum + perMonth(p), 0);

  const totalMonthlyIncome = plans
    .filter(p => p.kind === 'income')
    .reduce((sum, p) => sum + perMonth(p), 0);

  const totalMonthlySaving = plans
    .filter(p => p.kind === 'saving')
    .reduce((sum, p) => sum + perMonth(p), 0);

  const handleOpenAdd = () => {
    triggerHaptic('light');
    setActivePlan(null);
    setModalVisible(true);
  };

  const handlePlanPress = (p: Plan) => {
    triggerHaptic('light');
    setActivePlan(p);
    setModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopHeader
        title="Plans"
        subtitle={`${plans.length} recurring & scheduled movements`}
        rightAction={
          <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        }
      />

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterTabs}
        style={styles.tabsContainer}
      >
        {[
          { key: 'all', label: `All (${plans.length})` },
          { key: 'expense', label: 'Bills & Living' },
          { key: 'income', label: 'Incomes' },
          { key: 'saving', label: 'Savings' },
          { key: 'transfer', label: 'Transfers' },
        ].map(item => {
          const active = filter === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => {
                triggerHaptic('light');
                setFilter(item.key as any);
              }}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Summary KPI Strip */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Avg Monthly Out</Text>
          <Text style={styles.kpiVal}>{money(totalMonthlyExpense, settings.currency)}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Avg Monthly In</Text>
          <Text style={[styles.kpiVal, { color: theme.colors.brandDark }]}>
            {money(totalMonthlyIncome, settings.currency)}
          </Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Avg Savings</Text>
          <Text style={[styles.kpiVal, { color: theme.colors.purple }]}>
            {money(totalMonthlySaving, settings.currency)}
          </Text>
        </View>
      </View>

      {/* Plans List */}
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {filteredPlans.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🗓️</Text>
            <Text style={styles.emptyTitle}>No plans in this filter</Text>
            <Text style={styles.emptySub}>
              Tap the "+ Add" button above to set up a recurring income, bill, or savings goal.
            </Text>
          </View>
        ) : (
          filteredPlans.map(p => {
            const cat = categories.find(c => c.id === p.categoryId);
            const acc = accounts.find(a => a.id === p.accountId);
            const toAcc = accounts.find(a => a.id === p.toAccountId);
            const stash = stashes.find(s => s.id === p.stashId);

            const icon = p.kind === 'saving'
              ? (stash?.emoji || '🌱')
              : p.kind === 'transfer'
              ? '⇄'
              : (cat?.emoji || (p.kind === 'income' ? '💰' : '💸'));

            const accountLabel = p.kind === 'transfer'
              ? `${acc?.name || 'Account'} → ${toAcc?.name || 'Account'}`
              : acc?.name || 'Unassigned';

            const monthlyVal = perMonth(p);

            return (
              <TouchableOpacity
                key={p.id}
                style={styles.planCard}
                onPress={() => handlePlanPress(p)}
              >
                <View style={styles.planHeader}>
                  <View style={styles.iconCircle}>
                    <Text style={styles.iconText}>{icon}</Text>
                  </View>
                  <View style={styles.planInfo}>
                    <Text style={styles.planTitle}>{p.name}</Text>
                    <Text style={styles.planCadence}>🗓️ {freqLabel(p)}</Text>
                    <Text style={styles.planSub}>
                      {accountLabel} {p.subcategory ? `• ${p.subcategory}` : ''}
                    </Text>
                  </View>
                  <View style={styles.planAmountCol}>
                    <Text style={[styles.planAmount, p.kind === 'income' && styles.incomeText]}>
                      {p.kind === 'income' ? '+' : '−'}{money(p.amount, p.currency)}
                    </Text>
                    {monthlyVal > 0 && (
                      <Text style={styles.monthlyImpact}>
                        ~{money(monthlyVal, p.currency)}/mo
                      </Text>
                    )}
                  </View>
                </View>

                {p.note ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteText}>💬 {p.note}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Plan Edit Modal */}
      <PlanEditModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        planToEdit={activePlan}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  tabsContainer: {
    maxHeight: 46,
    backgroundColor: theme.colors.bg,
  },
  filterTabs: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  filterChipActive: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.mute,
  },
  filterChipTextActive: {
    color: '#FFF',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginVertical: 12,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: 10,
    alignItems: 'center',
    ...theme.shadow,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.mute,
    textTransform: 'uppercase',
  },
  kpiVal: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.ink,
    marginTop: 2,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  planCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 10,
    ...theme.shadowCard,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 22,
  },
  planInfo: {
    flex: 1,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  planCadence: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.brandDark,
    marginTop: 2,
  },
  planSub: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  planAmountCol: {
    alignItems: 'flex-end',
  },
  planAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  incomeText: {
    color: theme.colors.brandDark,
  },
  monthlyImpact: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.mute,
    marginTop: 2,
  },
  noteBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lineLight,
  },
  noteText: {
    fontSize: 12,
    color: theme.colors.inkSecondary,
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
