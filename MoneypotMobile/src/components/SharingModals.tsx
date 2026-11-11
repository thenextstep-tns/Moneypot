import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useData } from '../context/DataContext';
import { isEmail } from '../domain/sharing';
import type { Category, Stash } from '../domain/types';
import { useStyles, useTheme, type Theme } from '../theme';
import { triggerHaptic } from '../utils/haptics';

const APP_URL = 'https://thenextstep-tns.github.io/Moneypot/';

/** Invite someone to a pot or stash by email (one-time, email-bound code) */
export function ShareItemModal({ visible, type, item, onClose }: { visible: boolean; type: 'pot' | 'stash'; item: Category | Stash | null; onClose: () => void }) {
  const { user, canShare, inviteToShared, remove } = useData();
  const { colors } = useTheme();
  const styles = useStyles(getStyles);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (visible) { setEmail(''); setCode(null); setErr(''); }
  }, [visible]);

  if (!item) return null;
  const isMember = Boolean(item.isForeignOwned);

  const createCode = async () => {
    setErr('');
    const clean = email.trim().toLowerCase();
    if (!isEmail(clean)) return setErr('Enter the email address of the person you want to invite.');
    if (user?.email && clean === user.email.toLowerCase()) return setErr("You can't invite yourself.");
    setBusy(true);
    try {
      const res = await inviteToShared(type, item, clean);
      setCode(res.code);
      triggerHaptic('success');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the invite.');
    } finally {
      setBusy(false);
    }
  };

  const shareCode = () => {
    if (!code) return;
    Share.share({
      message:
        `Join my Moneypot ${type} "${item.emoji} ${item.name}".\n` +
        `Invite code (one-time, valid 7 days, for ${email.trim().toLowerCase()}): ${code}\n` +
        `Open moneypot://invite?code=${encodeURIComponent(code)} on Android or ${APP_URL}?code=${encodeURIComponent(code)}`,
    }).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">Share {item.emoji} {item.name}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          {!canShare ? (
            <Text style={styles.body}>Sign in with Google (not demo mode) to share — only the people you invite can see a shared {type}.</Text>
          ) : isMember ? (
            <>
              <Text style={styles.body}>Only the owner ({item.ownerEmail ?? 'the creator'}) can invite people. You can leave this {type}.</Text>
              <TouchableOpacity
                style={[styles.btn, styles.btnDanger]}
                accessibilityRole="button"
                onPress={() =>
                  Alert.alert(`Leave "${item.name}"?`, 'It will disappear from your Moneypot. The other members keep it.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Leave', style: 'destructive', onPress: () => { void remove(type === 'pot' ? 'categories' : 'stashes', item.id); onClose(); } },
                  ])
                }
              >
                <Text style={styles.btnDangerText}>Leave shared {type}</Text>
              </TouchableOpacity>
            </>
          ) : code ? (
            <>
              <Text style={styles.body}>Send this code to {email.trim().toLowerCase()}. It works once, only for that email, and expires in 7 days.</Text>
              <Text selectable style={styles.code} accessibilityLabel={`Invite code ${code.split('').join(' ')}`}>{code}</Text>
              <TouchableOpacity style={styles.btn} onPress={shareCode} accessibilityRole="button">
                <Text style={styles.btnText}>Send invite…</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnGhost} onPress={onClose} accessibilityRole="button">
                <Text style={styles.btnGhostText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {(item.sharedWith?.length ?? 0) > 0 && (
                <Text style={styles.members}>Members: {item.sharedWith!.join(', ')}</Text>
              )}
              <Text style={styles.label}>Invite by email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="partner@example.com"
                placeholderTextColor={colors.mute}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Email address to invite"
              />
              {err ? <Text style={styles.error} accessibilityLiveRegion="polite">{err}</Text> : null}
              <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={createCode} accessibilityRole="button">
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create invite code</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Join a shared pot or stash with an invite code */
export function JoinSharedModal({ visible, initialCode, onClose }: { visible: boolean; initialCode?: string | null; onClose: () => void }) {
  const { user, canShare, accounts, acceptShareCode } = useData();
  const { colors } = useTheme();
  const styles = useStyles(getStyles);
  const [code, setCode] = useState(initialCode ?? '');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setCode(initialCode ?? ''); setErr(''); setDone(null); setAccountId(accounts[0]?.id ?? ''); }
  }, [visible, initialCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async () => {
    setErr('');
    if (!code.trim()) return setErr('Enter the invite code.');
    setBusy(true);
    try {
      const item = await acceptShareCode(code, accountId || undefined);
      triggerHaptic('success');
      setDone(`You joined "${String(item.data.emoji ?? '')} ${String(item.data.name ?? '')}".`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not accept the invite.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">Join a shared pot or stash</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          {!canShare ? (
            <Text style={styles.body}>Sign in with Google using the email address the invite was sent to, then open the invite again.</Text>
          ) : done ? (
            <>
              <Text style={styles.body}>🎉 {done}</Text>
              <TouchableOpacity style={styles.btn} onPress={onClose} accessibilityRole="button">
                <Text style={styles.btnText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.body}>Signed in as {user?.email ?? 'you'}. Codes work once and only for the email they were sent to.</Text>
              <Text style={styles.label}>Invite code</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={setCode}
                placeholder="MP-XXXX-XXXX"
                placeholderTextColor={colors.mute}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel="Invite code"
              />
              {accounts.length > 0 && (
                <>
                  <Text style={styles.label}>If it's a stash, keep my share in</Text>
                  <View style={styles.chips}>
                    {accounts.map(a => (
                      <TouchableOpacity
                        key={a.id}
                        style={[styles.chip, accountId === a.id && styles.chipOn]}
                        onPress={() => setAccountId(a.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: accountId === a.id }}
                      >
                        <Text style={[styles.chipText, accountId === a.id && styles.chipTextOn]}>{a.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              {err ? <Text style={styles.error} accessibilityLiveRegion="polite">{err}</Text> : null}
              <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={join} accessibilityRole="button">
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>✓ Join</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.colors.card, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, padding: 20, paddingBottom: 32, gap: 12 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 18, fontWeight: '800', color: theme.colors.ink, flex: 1, marginRight: 12 },
    close: { fontSize: 18, color: theme.colors.mute },
    body: { fontSize: 14, color: theme.colors.inkSecondary, lineHeight: 20 },
    members: { fontSize: 13, color: theme.colors.mute },
    label: { fontSize: 12, fontWeight: '700', color: theme.colors.mute, textTransform: 'uppercase' },
    input: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: theme.radius.sm, padding: 12, fontSize: 16, color: theme.colors.ink, backgroundColor: theme.colors.cardMuted },
    codeInput: { fontFamily: 'monospace', letterSpacing: 1.5 },
    code: { fontFamily: 'monospace', fontSize: 24, fontWeight: '800', letterSpacing: 2, color: theme.colors.ink, textAlign: 'center', paddingVertical: 12, backgroundColor: theme.colors.brandLight, borderRadius: theme.radius.sm },
    error: { color: theme.colors.bad, fontSize: 13, fontWeight: '600' },
    btn: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.md, paddingVertical: 14, alignItems: 'center' },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    btnGhost: { borderRadius: theme.radius.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.line },
    btnGhostText: { color: theme.colors.ink, fontWeight: '600' },
    btnDanger: { backgroundColor: theme.colors.badLight },
    btnDangerText: { color: theme.colors.bad, fontWeight: '700', fontSize: 15 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.chipBorder, backgroundColor: theme.colors.chipBg },
    chipOn: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
    chipText: { color: theme.colors.ink, fontSize: 13 },
    chipTextOn: { color: '#fff', fontWeight: '700' },
  });
