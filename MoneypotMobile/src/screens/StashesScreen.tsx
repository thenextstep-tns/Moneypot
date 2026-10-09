import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Share,
} from 'react-native';
import { useData, uid } from '../context/DataContext';
import { calcStashBalance } from '../domain/balances';
import { convert } from '../domain/fx';
import { money, today } from '../domain/schedule';
import { generateMaskedCode, hashAccessCode } from '../domain/sharing';
import { theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import { TopHeader } from '../components/TopHeader';
import { StashEditModal } from '../components/StashEditModal';
import { BalanceCorrectionModal } from '../components/BalanceCorrectionModal';
import { OneOffPaymentModal } from '../components/OneOffPaymentModal';
import type { Stash } from '../domain/types';

export function StashesScreen() {
  const { stashes, payments, transfers, plans, accounts, settings, save, user } = useData();

  const [activeStash, setActiveStash] = useState<Stash | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [topUpStash, setTopUpStash] = useState<Stash | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<{
    type: 'stash';
    item: Stash;
    currentBalance: number;
  } | null>(null);

  // Total stashed amount converted to main currency
  const totalStashedMain = stashes.reduce((sum, s) => {
    const bal = calcStashBalance(s, payments, transfers, plans);
    return sum + convert(bal, s.currency, settings.currency);
  }, 0);

  const handleOpenAdd = () => {
    triggerHaptic('light');
    setActiveStash(null);
    setModalVisible(true);
  };

  const handleStashPress = (s: Stash) => {
    triggerHaptic('light');
    setActiveStash(s);
    setModalVisible(true);
  };

  const handleShareStash = async (s: Stash) => {
    triggerHaptic('light');
    const code = generateMaskedCode();
    const codeHash = await hashAccessCode(code);
    const inviteId = `inv_${uid()}`;

    await save('invites', {
      id: inviteId,
      targetType: 'stash',
      targetId: s.id,
      targetName: s.name,
      targetEmoji: s.emoji,
      inviterEmail: user?.email || 'user@moneypot.app',
      inviterName: user?.displayName || 'Partner',
      inviteeEmail: '',
      maskedCode: code,
      codeHash,
      status: 'pending',
      createdAt: Date.now(),
    });

    try {
      await Share.share({
        message: `Join my Moneypot stash "${s.emoji} ${s.name}"! Use code: ${code}\nOpen Moneypot: moneypot://invite?code=${code}`,
      });
    } catch {}
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopHeader
        title="Stashes"
        subtitle="Savings Goals & Cushions"
        rightAction={
          <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
            <Text style={styles.addBtnText}>+ Add Stash</Text>
          </TouchableOpacity>
        }
      />

      {/* Total Stashed Banner */}
      <View style={styles.totalBanner}>
        <View style={styles.totalBannerInfo}>
          <Text style={styles.totalBannerLabel}>Total Reserved in Stashes</Text>
          <Text style={styles.totalBannerVal}>{money(totalStashedMain, settings.currency)}</Text>
        </View>
        <Text style={styles.totalBannerEmoji}>🐷</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {stashes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🌱</Text>
            <Text style={styles.emptyTitle}>No Savings Stashes Yet</Text>
            <Text style={styles.emptySub}>
              Create a stash for an Emergency Cushion, Summer Vacation, or New Gadget!
            </Text>
          </View>
        ) : (
          stashes.map(s => {
            const currentBal = calcStashBalance(s, payments, transfers, plans);
            const parentAcc = accounts.find(a => a.id === s.accountId);
            const target = s.target || 0;
            const progress = target > 0 ? Math.min(100, Math.round((currentBal / target) * 100)) : 0;

            // Contributor Breakdown
            const contributors = new Map<string, number>();
            const ownerLabel = s.ownerEmail
              ? (s.ownerEmail === user?.email ? 'You (Creator)' : s.ownerEmail.split('@')[0])
              : 'Initial balance';
            if (s.startAmount > 0 && !payments.some(p => p.id === `init_stash_${s.id}` && p.status === 'confirmed')) {
              contributors.set(ownerLabel, (contributors.get(ownerLabel) || 0) + s.startAmount);
            }
            for (const p of payments) {
              if (p.status !== 'confirmed') continue;
              const isThisStash = p.stashId === s.id || p.accountId === `stash_${s.id}`;
              if (!isThisStash) continue;
              const cName = p.contributorName || (p.contributorEmail ? (p.contributorEmail === user?.email ? 'You' : p.contributorEmail.split('@')[0]) : 'You');
              const cur = contributors.get(cName) || 0;
              if (p.kind === 'saving' || p.kind === 'income') {
                contributors.set(cName, cur + p.amount);
              } else if (p.kind === 'expense') {
                contributors.set(cName, cur - p.amount);
              }
            }

            const activeContributors = Array.from(contributors.entries()).filter(
              ([_, amt]) => amt > 0.01 && currentBal > 0.01
            );

            return (
              <View key={s.id} style={styles.stashCard}>
                <TouchableOpacity onPress={() => handleStashPress(s)}>
                  <View style={styles.stashHeader}>
                    <View style={styles.stashTitleRow}>
                      <Text style={styles.stashEmoji}>{s.emoji}</Text>
                      <View>
                        <Text style={styles.stashName}>{s.name}</Text>
                        <Text style={styles.stashMeta}>
                          {parentAcc ? `In ${parentAcc.name}` : 'Reserved funds'}
                          {s.deadline ? ` • Target: ${s.deadline}` : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.stashAmountCol}>
                      <Text style={styles.stashCurrentBal}>{money(currentBal, s.currency)}</Text>
                      {target > 0 && (
                        <Text style={styles.stashTargetSub}>of {money(target, s.currency)}</Text>
                      )}
                    </View>
                  </View>

                  {/* Progress Bar */}
                  {target > 0 && (
                    <View style={styles.progressContainer}>
                      <View style={styles.progressBarTrack}>
                        <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                      </View>
                      <Text style={styles.progressText}>{progress}% achieved</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Tags Row */}
                <View style={styles.tagsRow}>
                  <View style={[styles.tagBadge, s.isInstantAccess ? styles.tagInstant : styles.tagShared]}>
                    <Text style={[styles.tagText, s.isInstantAccess ? styles.tagTextInstant : styles.tagTextShared]}>
                      {s.isInstantAccess ? '⚡ Instant Access' : '🔒 Dedicated Goal'}
                    </Text>
                  </View>

                  {s.sharedWith && s.sharedWith.length > 0 && (
                    <View style={[styles.tagBadge, styles.tagShared]}>
                      <Text style={[styles.tagText, styles.tagTextShared]}>
                        👥 Shared ({s.sharedWith.length})
                      </Text>
                    </View>
                  )}

                  {/* Contributor chips */}
                  {activeContributors.map(([cName, amt]) => (
                    <View key={cName} style={styles.contributorChip}>
                      <Text style={styles.contributorText}>
                        👤 {cName}: {money(amt, s.currency)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Stash Action Buttons */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.actionBtnPrimary}
                    onPress={() => {
                      triggerHaptic('light');
                      setTopUpStash(s);
                    }}
                  >
                    <Text style={styles.actionBtnPrimaryText}>+ Top up</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnSecondary}
                    onPress={() => {
                      triggerHaptic('light');
                      setCorrectionTarget({
                        type: 'stash',
                        item: s,
                        currentBalance: currentBal,
                      });
                    }}
                  >
                    <Text style={styles.actionBtnSecondaryText}>⚖️ Correct</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnSecondary}
                    onPress={() => handleShareStash(s)}
                  >
                    <Text style={styles.actionBtnSecondaryText}>🔗 Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Edit Stash Modal */}
      <StashEditModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        stashToEdit={activeStash}
        onOpenCorrection={st => {
          const bal = calcStashBalance(st, payments, transfers, plans);
          setCorrectionTarget({ type: 'stash', item: st, currentBalance: bal });
        }}
      />

      {/* Balance Correction Modal */}
      <BalanceCorrectionModal
        visible={!!correctionTarget}
        onClose={() => setCorrectionTarget(null)}
        target={correctionTarget}
      />

      {/* Top up Record Modal */}
      {topUpStash && (
        <OneOffPaymentModal
          visible={!!topUpStash}
          initialType="transfer"
          initialFromId={topUpStash.accountId || accounts[0]?.id}
          initialToId={`stash_${topUpStash.id}`}
          onClose={() => setTopUpStash(null)}
        />
      )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    marginHorizontal: 16,
    marginVertical: 10,
    padding: 16,
    borderRadius: theme.radius.lg,
    ...theme.shadowCard,
  },
  totalBannerInfo: {
    flex: 1,
  },
  totalBannerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.mute,
    textTransform: 'uppercase',
  },
  totalBannerVal: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.ink,
    marginTop: 4,
  },
  totalBannerEmoji: {
    fontSize: 34,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  stashCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 12,
    ...theme.shadowCard,
  },
  stashHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stashTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stashEmoji: {
    fontSize: 30,
  },
  stashName: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  stashMeta: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  stashAmountCol: {
    alignItems: 'flex-end',
  },
  stashCurrentBal: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.brandDark,
  },
  stashTargetSub: {
    fontSize: 12,
    color: theme.colors.mute,
    marginTop: 2,
  },
  progressContainer: {
    marginTop: 12,
  },
  progressBarTrack: {
    height: 7,
    backgroundColor: theme.colors.bg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 7,
    backgroundColor: theme.colors.brand,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 11,
    color: theme.colors.mute,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'right',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.xs,
  },
  tagInstant: {
    backgroundColor: theme.colors.brandLight,
  },
  tagShared: {
    backgroundColor: theme.colors.purpleLight,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tagTextInstant: {
    color: theme.colors.brandDark,
  },
  tagTextShared: {
    color: theme.colors.purple,
  },
  contributorChip: {
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.xs,
  },
  contributorText: {
    fontSize: 11,
    color: theme.colors.inkSecondary,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lineLight,
  },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: theme.colors.brandLight,
    paddingVertical: 9,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  actionBtnPrimaryText: {
    color: theme.colors.brandDark,
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnSecondary: {
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  actionBtnSecondaryText: {
    color: theme.colors.ink,
    fontSize: 13,
    fontWeight: '600',
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
