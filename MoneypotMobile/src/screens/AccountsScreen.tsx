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
import { calcAccountBalance, calcTotalLiquidBalance } from '../domain/balances';
import { money } from '../domain/schedule';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import { TopHeader } from '../components/TopHeader';
import { AccountEditModal } from '../components/AccountEditModal';
import { BalanceCorrectionModal } from '../components/BalanceCorrectionModal';
import { QuickTransferModal } from '../components/QuickTransferModal';
import type { Account } from '../domain/types';

export function AccountsScreen() {
  const { accounts, payments, transfers, plans, stashes, settings } = useData();

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
          <Text style={styles.totalLabel}>Total Available Liquid Cash</Text>
          <Text style={styles.totalValue}>{money(totalLiquid, settings.currency)}</Text>
          <Text style={styles.totalSub}>Across {accounts.length} connected accounts</Text>
        </View>

        <TouchableOpacity style={styles.transferBtn} onPress={() => handleOpenTransfer()}>
          <Text style={styles.transferBtnText}>⇄ Move Money</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionHeading}>Your Accounts ({accounts.length})</Text>

        {accounts.map(acc => {
          const liveBal = calcAccountBalance(acc, payments, transfers, plans, stashes);
          const typeIcons: Record<Account['type'], string> = {
            card: '💳',
            bank: '🏦',
            cash: '💵',
            wallet: '👛',
            savings: '🐷',
          };

          return (
            <View key={acc.id} style={styles.accountCard}>
              <TouchableOpacity
                style={styles.cardMainClick}
                onPress={() => handleAccountPress(acc)}
              >
                <View style={styles.accLeft}>
                  <View style={[styles.avatarCircle, { backgroundColor: acc.color || theme.colors.brand }]}>
                    <Text style={styles.avatarIcon}>{typeIcons[acc.type] || '💳'}</Text>
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
                  <Text style={[styles.accBalance, liveBal < 0 && styles.negativeBalance]}>
                    {money(liveBal, acc.currency)}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Action shortcuts */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionPill}
                  onPress={() => {
                    triggerHaptic('light');
                    setCorrectionTarget({
                      type: 'account',
                      item: acc,
                      currentBalance: liveBal,
                    });
                  }}
                >
                  <Text style={styles.actionPillText}>⚖️ Balance Correction</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionPill}
                  onPress={() => handleOpenTransfer(acc.id)}
                >
                  <Text style={styles.actionPillText}>⇄ Transfer</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

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
  cardMainClick: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
