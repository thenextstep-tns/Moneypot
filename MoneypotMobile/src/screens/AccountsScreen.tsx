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
import {
  calcAccountBalance,
  calcAccountStashedBalance,
  calcTotalLiquidBalance,
  calcTotalStashedBalance,
  calcTotalStashedBreakdown,
  formatStashedBreakdown,
} from '../domain/balances';
import { money, today } from '../domain/schedule';
import { theme, useStyles, type Theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import { TopHeader } from '../components/TopHeader';
import { AccountEditModal } from '../components/AccountEditModal';
import { BalanceCorrectionModal } from '../components/BalanceCorrectionModal';
import { QuickTransferModal } from '../components/QuickTransferModal';
import { GripVerticalIcon } from '../components/GripVerticalIcon';
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import type { Account } from '../domain/types';

const TYPE_ICONS: Record<Account['type'], string> = {
  card: '💳',
  bank: '🏦',
  cash: '💵',
  wallet: '👛',
  savings: '🐷',
};

export function AccountsScreen() {
  const { accounts, payments, transfers, plans, stashes, settings, user, save, reorder } = useData();
  const styles = useStyles(getStyles);

  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [transferVisible, setTransferVisible] = useState(false);
  const [defaultTransferAccId, setDefaultTransferAccId] = useState<string | undefined>(undefined);
  const [correctionTarget, setCorrectionTarget] = useState<{
    type: 'account';
    item: Account;
    currentBalance: number;
  } | null>(null);

  const totalLiquid = calcTotalLiquidBalance(
    accounts,
    payments,
    transfers,
    plans,
    stashes,
    settings.currency
  );

  const { total: totalStashed, personal: totalPersonalStashed, shared: totalSharedStashed } =
    calcTotalStashedBreakdown(
      accounts,
      stashes,
      payments,
      transfers,
      plans,
      settings.currency
    );

  const totalAvailable = Math.max(0, totalLiquid - totalStashed);

  const handleOpenAdd = () => {
    triggerHaptic('light');
    setActiveAccount(null);
    setModalVisible(true);
  };

  const handleAccountPress = (acc: Account) => {
    triggerHaptic('light');
    setActiveAccount(acc);
    setModalVisible(true);
  };

  const handleOpenTransfer = (accId?: string) => {
    triggerHaptic('light');
    setDefaultTransferAccId(accId);
    setTransferVisible(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopHeader
        title="Accounts"
        subtitle="Cards, Wallets & Cash"
        rightAction={
          <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        }
      />

      {/* Net Liquid Total Banner */}
      <View style={styles.totalBanner}>
        <View style={styles.totalInfo}>
          <Text style={styles.totalLabel}>Available to Spend</Text>
          <Text style={styles.totalValue}>{money(totalAvailable, settings.currency)}</Text>
          <Text style={styles.totalSub}>
            Total: {money(totalLiquid, settings.currency)}
            {totalStashed > 0 ? ` · ${formatStashedBreakdown(totalStashed, totalPersonalStashed, totalSharedStashed, settings.currency)}` : ''}
          </Text>
        </View>

        <TouchableOpacity style={styles.transferBtn} onPress={() => handleOpenTransfer()}>
          <Text style={styles.transferBtnText}>⇄ Move Money</Text>
        </TouchableOpacity>
      </View>

      <DraggableFlatList
        data={accounts}
        keyExtractor={item => item.id}
        onDragBegin={() => triggerHaptic('medium')}
        onDragEnd={({ data }) => {
          triggerHaptic('light');
          reorder('accounts', data);
        }}
        containerStyle={styles.container}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
          <Text style={styles.sectionHeading}>Your Accounts ({accounts.length})</Text>
        }
        renderItem={({ item: acc, drag, isActive }: RenderItemParams<Account>) => {
          const totalBal = calcAccountBalance(acc, payments, transfers, plans, stashes);
          const stashedBal = calcAccountStashedBalance(acc, stashes, payments, transfers, plans, accounts);
          const freeBal = Math.max(0, totalBal - stashedBal);

          return (
            <ScaleDecorator>
              <View style={[styles.accountCard, isActive && styles.cardActive]}>
                <TouchableOpacity
                  style={styles.cardMainClick}
                  onPress={() => handleAccountPress(acc)}
                  disabled={isActive}
                >
                  <View style={styles.accLeft}>
                    <TouchableOpacity
                      style={styles.dragHandle}
                      onPressIn={drag}
                      disabled={isActive}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <GripVerticalIcon size={18} color={isActive ? theme.colors.brand : '#9CA3AF'} />
                    </TouchableOpacity>
                    <View style={[styles.avatarCircle, { backgroundColor: acc.color || theme.colors.brand }]}>
                      <Text style={styles.avatarIcon}>{TYPE_ICONS[acc.type] || '💳'}</Text>
                    </View>
                    <View>
                      <Text style={styles.accName}>{acc.name}</Text>
                      <Text style={styles.accSub}>
                        {acc.institution ? `${acc.institution} • ` : ''}
                        {acc.currency}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.accRight}>
                    <Text style={[styles.accBalance, freeBal < 0 && styles.negativeBalance]}>
                      {money(freeBal, acc.currency)}
                    </Text>
                    <Text style={styles.accFreeLabel}>free to spend</Text>
                    {stashedBal > 0 && (
                      <Text style={styles.accStashedSub}>
                        Total: {money(totalBal, acc.currency)} • 🔒 {money(stashedBal, acc.currency)}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>

                {/* Action shortcuts */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.actionPill}
                    disabled={isActive}
                    onPress={() => {
                      triggerHaptic('light');
                      setCorrectionTarget({
                        type: 'account',
                        item: acc,
                        currentBalance: totalBal,
                      });
                    }}
                  >
                    <Text style={styles.actionPillText}>⚖️ Balance Correction</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionPill}
                    disabled={isActive}
                    onPress={() => handleOpenTransfer(acc.id)}
                  >
                    <Text style={styles.actionPillText}>⇄ Transfer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScaleDecorator>
          );
        }}
      />

      {/* Account Edit Modal */}
      <AccountEditModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        accountToEdit={activeAccount}
        onOpenCorrection={acc => {
          const bal = calcAccountBalance(acc, payments, transfers, plans, stashes);
          setCorrectionTarget({ type: 'account', item: acc, currentBalance: bal });
        }}
      />

      {/* Quick Transfer Modal */}
      <QuickTransferModal
        visible={transferVisible}
        onClose={() => setTransferVisible(false)}
        defaultFromAccountId={defaultTransferAccId}
      />

      {/* Balance Correction Modal */}
      <BalanceCorrectionModal
        visible={!!correctionTarget}
        onClose={() => setCorrectionTarget(null)}
        target={correctionTarget}
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
  totalBanner: {
    backgroundColor: theme.colors.card,
    marginHorizontal: 16,
    marginVertical: 10,
    padding: 16,
    borderRadius: theme.radius.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...theme.shadowCard,
  },
  totalInfo: {
    flex: 1,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.mute,
    textTransform: 'uppercase',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.ink,
    marginTop: 4,
  },
  totalSub: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  transferBtn: {
    backgroundColor: theme.colors.brandLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
  },
  transferBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.brandDark,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginVertical: 10,
  },
  accountCard: {
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
  cardMainClick: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accLeft: {
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
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarIcon: {
    fontSize: 22,
  },
  accName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  accSub: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  accRight: {
    alignItems: 'flex-end',
  },
  accBalance: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  negativeBalance: {
    color: theme.colors.bad,
  },
  accFreeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.mute,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  accStashedSub: {
    fontSize: 11,
    color: theme.colors.mute,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lineLight,
  },
  actionPill: {
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.sm,
  },
  actionPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.ink,
  },
});
