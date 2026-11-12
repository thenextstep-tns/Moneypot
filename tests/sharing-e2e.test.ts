// End-to-end: an "Online Purchases" stash shared with the old (≤ v0.9.6) model migrates on its own,
// against the real security rules in the Firestore emulator.  Run with: npm run test:rules
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, query, setDoc, where, type Firestore } from 'firebase/firestore';
import type { Payment, SharedItem, Stash, Transfer } from '../src/types';
import { mergeSharedState, migrateLegacyShares, SHARED_ITEMS, type Me } from '../src/sharedSync';
import { calcAccountStashedBalance, calcStashBalance, calcStashContributions, normalizeStash, sharedMemberCount } from '../src/balances';
import { addDays, today } from '../src/schedule';

let env: RulesTestEnvironment;
const NICK: Me = { uid: 'nick', email: 'nick@example.com', displayName: 'Nick' };
const ANNA: Me = { uid: 'anna', email: 'anna@example.com', displayName: 'Anna Samsonova' };
const day = addDays(today(), -3);

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-moneypot-e2e', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  // What v0.9.6 left behind
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore() as unknown as Firestore;
    const legacyStash = (accountId: string): Stash => ({
      id: 'online', name: 'Online Purchases', emoji: '🎉', target: 300, currency: 'EUR', startAmount: 0, accountId,
      ownerId: 'nick', ownerEmail: 'nick@example.com', isShared: true, isInstantAccess: false,
      sharedWith: ['anna@example.com', 'nick@example.com', 'Anna@Example.com'], // the "3" for two people
    });
    const t = (id: string, from: string, amount: number, by: Me): Transfer => ({
      id, date: day, fromAccountId: from, toAccountId: 'stash_online', fromAmount: amount, fromCurrency: 'EUR',
      toAmount: amount, toCurrency: 'EUR', status: 'confirmed', contributorEmail: by.email!, contributorName: by.displayName!,
    });
    await setDoc(doc(db, 'users/nick'), { currency: 'EUR' });
    await setDoc(doc(db, 'users/nick/accounts/cash'), { id: 'cash', name: 'Cash', type: 'cash', currency: 'EUR', startBalance: 1000, color: '#000' });
    await setDoc(doc(db, 'users/nick/stashes/online'), legacyStash('cash'));
    await setDoc(doc(db, 'users/nick/transfers/n60'), t('n60', 'cash', 60, NICK));
    await setDoc(doc(db, 'users/nick/transfers/a100'), { ...t('a100', 'annaCard', 100, ANNA), isShared: true }); // old cross-user copy
    await setDoc(doc(db, 'users/anna'), { currency: 'EUR' });
    await setDoc(doc(db, 'users/anna/accounts/annaCard'), { id: 'annaCard', name: 'Card', type: 'card', currency: 'EUR', startBalance: 500, color: '#000' });
    await setDoc(doc(db, 'users/anna/stashes/online'), legacyStash('annaCard'));
    await setDoc(doc(db, 'users/anna/transfers/a100'), t('a100', 'annaCard', 100, ANNA));
  });
});
after(async () => { await env.cleanup(); });

const dbFor = (me: Me) => env.authenticatedContext(me.uid, { email: me.email!, email_verified: true }).firestore() as unknown as Firestore;

async function load(me: Me) {
  const db = dbFor(me);
  const own = async <T,>(c: string) => (await getDocs(collection(db, 'users', me.uid, c))).docs.map(d => d.data() as T);
  const raw = { stashes: await own<Stash>('stashes'), categories: [], payments: await own<Payment>('payments'), transfers: await own<Transfer>('transfers') };
  const accounts = await own<{ id: string; name: string; type: 'cash'; currency: string; startBalance: number; color: string }>('accounts');
  const items = (await getDocs(query(collection(db, SHARED_ITEMS), where('memberIds', 'array-contains', me.uid)))).docs.map(d => d.data() as SharedItem);
  const invited = (await getDocs(query(collection(db, SHARED_ITEMS), where('invitedEmails', 'array-contains', me.email!)))).docs
    .map(d => d.data() as SharedItem).filter(i => !i.memberIds.includes(me.uid));
  const pays = new Map<string, Payment[]>();
  const trs = new Map<string, Transfer[]>();
  for (const it of items) {
    pays.set(it.id, (await getDocs(collection(db, SHARED_ITEMS, it.id, 'payments'))).docs.map(d => d.data() as Payment));
    trs.set(it.id, (await getDocs(collection(db, SHARED_ITEMS, it.id, 'transfers'))).docs.map(d => d.data() as Transfer));
  }
  return { db, raw, accounts, items, invited, merged: mergeSharedState(raw, items, pays, trs, me, true) };
}

test('Nick opens the new app, then Anna does: both see 160, two people, individual contributions', async () => {
  // Nick first: his old share becomes a secure shared item listing Anna's email
  let n = await load(NICK);
  await migrateLegacyShares(n.db, NICK, n.raw, n.invited, new Set());
  // Anna: her phone finds the share that lists her email, joins, links her old copy, uploads her 100
  let a = await load(ANNA);
  assert.equal(a.invited.length, 1, 'Anna is invited by email');
  await migrateLegacyShares(a.db, ANNA, a.raw, a.invited, new Set());

  // Fresh loads, as each phone would see it
  n = await load(NICK);
  a = await load(ANNA);
  for (const [who, view, me] of [['Nick', n, NICK], ['Anna', a, ANNA]] as const) {
    const stashes = view.merged.stashes.map(s => normalizeStash(s, me.uid));
    assert.equal(stashes.length, 1, `${who}: one stash, no duplicate`);
    const s = stashes[0];
    assert.equal(calcStashBalance(s, view.merged.payments, view.merged.transfers), 160, `${who} sees 160 in the stash`);
    assert.equal(sharedMemberCount(s), 2, `${who} sees 2 people`);
    const contribs = calcStashContributions(s, view.merged.payments, view.merged.transfers);
    const byLabel = Object.fromEntries(contribs.map(c => [c.isMe ? 'me' : c.label, c.amount]));
    if (who === 'Nick') assert.deepEqual(byLabel, { me: 60, 'Anna Samsonova': 100 });
    else assert.deepEqual(byLabel, { me: 100, Nick: 60 });
    const reservedInMyAccount = calcAccountStashedBalance(view.accounts[0], [s], view.merged.payments, view.merged.transfers, [], view.accounts);
    assert.equal(reservedInMyAccount, who === 'Nick' ? 60 : 100, `${who}: only own money is reserved`);
  }
});
