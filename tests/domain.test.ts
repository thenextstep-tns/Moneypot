import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Account, Category, Payment, Plan, SharedItem, Stash, Transfer } from '../src/types';
import { addDays, today, thisMonth, shiftMonth, monthRange, OVERDUE_WINDOW_DAYS } from '../src/schedule';
import {
  calcAccountAvailableBalance,
  calcAccountBalance,
  calcAllAccountBalances,
  calcMonthStartingBalances,
  calcProjectedAccountBalance,
  calcStashBalance,
  calcTotalLiquidBalance,
  calcTotalStashedBalance,
  checkAccountFunds,
  findAccountShortfalls,
  normalizeStash,
} from '../src/balances';
import { calculateCashflowRange } from '../src/cashflow';
import { generateInviteCode, normalizeInviteCode, sha256Hex, sha256HexJs } from '../src/sharing';
import { mergeSharedState, sharedTargets, toCanonical } from '../src/sharedSync';

const T = today();
const yesterday = addDays(T, -1);
const acc = (id: string, startBalance: number): Account => ({ id, name: id, type: 'bank', currency: 'EUR', startBalance, color: '#000' });
const stash = (id: string, accountId?: string, extra: Partial<Stash> = {}): Stash => ({ id, name: id, emoji: '🐷', target: 1000, currency: 'EUR', startAmount: 0, accountId, ...extra });
const pay = (id: string, extra: Partial<Payment>): Payment => ({ id, planId: id, dueDate: yesterday, date: yesterday, amount: 0, currency: 'EUR', status: 'confirmed', ...extra });
const tr = (id: string, from: string, to: string, amount: number, date = yesterday): Transfer => ({
  id, date, fromAccountId: from, toAccountId: to, fromAmount: amount, fromCurrency: 'EUR', toAmount: amount, toCurrency: 'EUR', status: 'confirmed',
});
const plan = (id: string, extra: Partial<Plan>): Plan => ({ id, name: id, kind: 'expense', amount: 0, currency: 'EUR', freq: 'once', every: 1, startDate: T, ...extra });

const card = acc('card', 1000);
const cash = acc('cash', 50);
const savings = acc('sav', 0);
const accounts = [card, cash, savings];

test('a transfer into a deleted stash never credits other accounts', () => {
  const transfers = [tr('t1', 'card', 'stash_gone', 300)];
  assert.equal(calcAccountBalance(card, [], transfers, [], []), 1000, 'money is released back to the source');
  assert.equal(calcAccountBalance(cash, [], transfers, [], []), 50);
  assert.equal(calcAccountBalance(savings, [], transfers, [], []), 0);
  assert.equal(calcTotalLiquidBalance(accounts, [], transfers, [], [], 'EUR'), 1050);
});

test('saving from one account into a stash housed in another moves the money', () => {
  const stashes = [stash('cushion', 'sav')];
  const payments = [pay('p1', { amount: 200, accountId: 'card', kind: 'saving', stashId: 'cushion' })];
  assert.equal(calcAccountBalance(card, payments, [], [], stashes), 800);
  assert.equal(calcAccountBalance(savings, payments, [], [], stashes), 200);
  assert.equal(calcAccountAvailableBalance(savings, stashes, payments, [], [], accounts), 0, 'all of it is reserved');
  assert.equal(calcStashBalance(stashes[0], payments), 200);
  assert.equal(calcTotalLiquidBalance(accounts, payments, [], [], stashes, 'EUR'), 1050, 'money is conserved');
});

test('saving into a stash in the same account only reserves it', () => {
  const stashes = [stash('holiday', 'card')];
  const payments = [pay('p1', { amount: 100, accountId: 'card', kind: 'saving', stashId: 'holiday' })];
  assert.equal(calcAccountBalance(card, payments, [], [], stashes), 1000);
  assert.equal(calcAccountAvailableBalance(card, stashes, payments, [], [], accounts), 900);
});

test('unhoused stashes are counted once in the liquid total', () => {
  const stashes = [stash('loose')];
  const transfers = [tr('t1', 'card', 'stash_loose', 100)];
  assert.equal(calcAccountBalance(card, [], transfers, [], stashes), 900);
  assert.equal(calcTotalLiquidBalance(accounts, [], transfers, [], stashes, 'EUR'), 1050);
  assert.equal(calcTotalStashedBalance(accounts, stashes, [], transfers, [], 'EUR'), 100);
});

test('overdrawn accounts report a negative available balance', () => {
  const payments = [pay('p1', { amount: 1500, accountId: 'card', kind: 'expense' })];
  assert.equal(calcAccountAvailableBalance(card, [], payments, [], [], accounts), -500);
  const balances = calcAllAccountBalances(accounts, payments, [], [], []);
  const f = checkAccountFunds('card', 10, 'EUR', accounts, balances, []);
  assert.equal(f.balance, -500);
  assert.equal(f.shortBy, 510);
});

test('shortfall warnings include the existing overdraft', () => {
  const payments = [pay('p1', { amount: 1100, accountId: 'card', kind: 'expense' })];
  const balances = calcAllAccountBalances(accounts, payments, [], [], []);
  const plans = [plan('rent', { amount: 50, accountId: 'card', startDate: addDays(T, 2) })];
  const occ = [{ key: 'k', plan: plans[0], dueDate: addDays(T, 2), date: addDays(T, 2), amount: 50, currency: 'EUR', accountId: 'card', status: 'pending' as const, postponed: false, name: 'rent', kind: 'expense' as const, categoryId: 'home' }];
  const w = findAccountShortfalls(accounts, occ, balances, [], []);
  assert.equal(w.length, 1);
  assert.equal(Math.round(w[0].shortBy), 150);
});

test('future-dated confirmed records only count from their date', () => {
  const tomorrow = addDays(T, 1);
  const payments = [pay('p1', { amount: 100, accountId: 'card', kind: 'expense', date: tomorrow, dueDate: tomorrow })];
  assert.equal(calcAccountBalance(card, payments, [], [], []), 1000);
  assert.equal(calcProjectedAccountBalance(card, addDays(T, 2), payments, [], [], []).projected, 900);
});

test('overdue unconfirmed items are included in projections (within the overdue window)', () => {
  const plans = [
    plan('late', { amount: 40, accountId: 'card', startDate: addDays(T, -5) }),
    plan('ancient', { amount: 999, accountId: 'card', startDate: addDays(T, -(OVERDUE_WINDOW_DAYS + 5)) }),
  ];
  assert.equal(calcProjectedAccountBalance(card, addDays(T, 3), [], [], plans, []).projected, 960);
});

test('cashflow chart agrees with account balances and projections', () => {
  const stashes = [stash('cushion', 'sav')];
  const payments = [pay('p1', { amount: 200, accountId: 'card', kind: 'saving', stashId: 'cushion' })];
  const transfers = [tr('t1', 'card', 'stash_gone', 300)];
  const plans = [plan('rent', { amount: 120, accountId: 'card', startDate: addDays(T, 3) }), plan('late', { amount: 10, accountId: 'cash', startDate: addDays(T, -2) })];
  const days = calculateCashflowRange(addDays(T, -2), addDays(T, 5), accounts, payments, transfers, plans, stashes, [], 'EUR');
  const todayRow = days.find(d => d.date === T)!;
  for (const a of accounts) {
    assert.equal(todayRow.accounts.find(x => x.accountId === a.id)!.balanceOriginal, calcAccountBalance(a, payments, transfers, plans, stashes), `today ${a.id}`);
  }
  const last = days[days.length - 1];
  for (const a of accounts) {
    assert.equal(
      last.accounts.find(x => x.accountId === a.id)!.balanceOriginal,
      calcProjectedAccountBalance(a, last.date, payments, transfers, plans, stashes).projected,
      `projected ${a.id}`
    );
  }
  assert.equal(last.accounts.find(x => x.accountId === 'cash')!.balanceOriginal, 40, 'overdue item lands in the projection');
});

test('month planner starting balance for next month matches the projection', () => {
  const next = shiftMonth(thisMonth(), 1);
  const endOfThis = monthRange(thisMonth())[1];
  const plans = [plan('rent', { amount: 300, accountId: 'card', startDate: endOfThis })];
  const res = calcMonthStartingBalances(accounts, [], [], plans, [], next, 'EUR');
  assert.equal(res.accountBalances.get('card'), 700, 'rent due on the last day of this month is expected before the 1st');
  // also when it is already overdue
  const overdue = [plan('late', { amount: 25, accountId: 'card', startDate: addDays(T, -3) })];
  assert.equal(calcMonthStartingBalances(accounts, [], [], overdue, [], next, 'EUR').accountBalances.get('card'), 975);
});

test("a personal stash's instant-access choice is respected; shared stashes never are instant", () => {
  assert.equal(normalizeStash(stash('a', 'card', { isInstantAccess: false }), 'me').isInstantAccess, false);
  assert.equal(normalizeStash(stash('a', 'card'), 'me').isInstantAccess, true);
  assert.equal(normalizeStash(stash('a', 'card', { sharedId: 'sh_x', isInstantAccess: true }), 'me').isInstantAccess, false);
});

// ---------------- sharing ----------------

test('pure-JS SHA-256 matches node crypto', () => {
  for (const s of ['', 'abc', 'MP7KQ2XH9D', 'x'.repeat(200)]) {
    assert.equal(sha256HexJs(s), createHash('sha256').update(s).digest('hex'));
  }
});

test('invite codes are well-formed and normalize consistently', async () => {
  const code = generateInviteCode();
  assert.match(code, /^MP-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  assert.equal(normalizeInviteCode(code.toLowerCase().replace(/-/g, ' ')), code.replace(/-/g, ''));
  assert.equal(await sha256Hex(normalizeInviteCode(code)), createHash('sha256').update(code.replace(/-/g, '')).digest('hex'));
});

const ME = { uid: 'me', email: 'me@example.com' };
const PARTNER = 'partner';
const sharedPot: SharedItem = {
  id: 'sh_pot', type: 'pot', ownerId: 'me', memberIds: ['me', PARTNER],
  members: { me: { email: 'me@example.com' }, [PARTNER]: { email: 'p@example.com' } }, data: { name: 'Groceries' },
};
const sharedStash: SharedItem = {
  id: 'sh_stash', type: 'stash', ownerId: PARTNER, memberIds: ['me', PARTNER],
  members: { me: { email: 'me@example.com' }, [PARTNER]: { email: 'p@example.com' } }, data: { name: 'Trip', target: 2000, startAmount: 100 },
};

test('records are mirrored with tokens, never with private ids', () => {
  const categories: Category[] = [{ id: 'food', name: 'Food', emoji: '🍎', color: '#000', kind: 'expense', sharedId: 'sh_pot' }];
  const stashes: Stash[] = [stash('trip', 'card', { sharedId: 'sh_stash' })];
  const p = pay('p1', { amount: 20, accountId: 'card', kind: 'expense', categoryId: 'food' });
  assert.deepEqual(sharedTargets('payments', p, { stashes, categories }), ['sh_pot']);
  const c = toCanonical('payments', p, { stashes, categories }, ME);
  assert.equal(c.categoryId, '@sh:sh_pot');
  assert.equal(c.accountId, 'ext:account');
  assert.equal(c.contributorUid, 'me');
  const t = tr('t1', 'card', 'stash_trip', 50);
  const ct = toCanonical('transfers', t, { stashes, categories }, ME);
  assert.equal(ct.toAccountId, 'stash_@sh:sh_stash');
  assert.equal(ct.fromAccountId, 'ext:account');
});

test("other members' records map onto local copies and never touch my accounts", () => {
  const raw = {
    stashes: [stash('trip_local', 'card', { sharedId: 'sh_stash', categoryId: 'fun' })],
    categories: [{ id: 'food', name: 'Food', emoji: '🍎', color: '#000', kind: 'expense' as const, sharedId: 'sh_pot' }],
    payments: [] as Payment[],
    transfers: [] as Transfer[],
  };
  const theirPayment = { ...pay('x1', { amount: 30, accountId: 'ext:account', kind: 'expense', categoryId: '@sh:sh_pot' }), contributorUid: PARTNER };
  const ownMirror = { ...pay('mine', { amount: 5, kind: 'expense', categoryId: '@sh:sh_pot' }), contributorUid: 'me' };
  const theirTransfer = { ...tr('x2', 'ext:account', 'stash_@sh:sh_stash', 400), contributorUid: PARTNER };
  const merged = mergeSharedState(
    raw,
    [sharedPot, sharedStash],
    new Map([['sh_pot', [theirPayment, ownMirror]]]),
    new Map([['sh_stash', [theirTransfer]]]),
    ME,
    true
  );
  assert.equal(merged.payments.length, 1, 'my own mirrored record is not duplicated');
  assert.equal(merged.payments[0].categoryId, 'food');
  assert.equal(merged.payments[0].accountId, `ext:${PARTNER}`);
  assert.equal(merged.transfers[0].toAccountId, 'stash_trip_local');
  const s = normalizeStash(merged.stashes[0], 'me');
  assert.equal(s.name, 'Trip');
  assert.equal(s.isForeignOwned, true);
  // partner's transfer and expense don't change my card, but do grow the shared stash
  assert.equal(calcAccountBalance(card, merged.payments, merged.transfers, [], merged.stashes), 1000);
  assert.equal(calcStashBalance(s, merged.payments, merged.transfers), 500);
  // my reserved share excludes the owner's start amount and the partner's money
  assert.equal(calcAccountAvailableBalance(card, [s], merged.payments, merged.transfers, [], accounts), 1000);
});

test('a share that disappears turns the local copy back into a personal item', () => {
  const raw = { stashes: [stash('trip_local', 'card', { sharedId: 'sh_gone' })], categories: [], payments: [], transfers: [] };
  const merged = mergeSharedState(raw, [], new Map(), new Map(), ME, true);
  assert.equal(merged.stashes[0].isShared, false);
});

test('past records keep the exchange rate frozen when they were made', () => {
  // 20 USD paid from a EUR account when 1 EUR = 2 USD → exactly 10 EUR, whatever today's rate is
  const p = pay('usd', { amount: 20, currency: 'USD', accountId: 'card', kind: 'expense', fx: { EUR: 1, USD: 2 } });
  assert.equal(calcAccountBalance(card, [p], [], [], []), 990);
  const days = calculateCashflowRange(yesterday, yesterday, accounts, [p], [], [], [], [], 'EUR');
  assert.equal(days[0].items[0].amountInMain, 10);
  // records without frozen rates still convert at today's rate
  const live = pay('usd2', { amount: 20, currency: 'USD', accountId: 'card', kind: 'expense' });
  assert.notEqual(calcAccountBalance(card, [live], [], [], []), 1000);
});

test('the account picker and the Accounts screen reserve the same amount (shared stash = own share only)', async () => {
  const { calcAccountReservedFromMap, calcAccountStashedBalance } = await import('../src/balances');
  const shared = normalizeStash(stash('trip', 'cash', { sharedId: 'sh_trip' }), 'me');
  const mine = tr('t1', 'cash', 'stash_trip', 60);
  const partners = { ...tr('t2', 'ext:partner', 'stash_trip', 100), foreign: true, contributorUid: 'partner' };
  const personal = stash('cushion', 'cash', { startAmount: 500 });
  const stashes = [shared, personal];
  const transfers = [mine, partners];
  const balances = calcAllAccountBalances(accounts, [], transfers, [], stashes);
  const picker = calcAccountReservedFromMap(cash, stashes, balances);
  const accountsScreen = calcAccountStashedBalance(cash, stashes, [], transfers, [], accounts);
  assert.equal(accountsScreen, 560);
  assert.equal(picker, accountsScreen);
  assert.equal(checkAccountFunds('cash', 1, 'EUR', accounts, balances, stashes).stashedBalance, 560);
});

test("a partner's contribution copied into my data by v0.9.6 is treated as theirs", () => {
  const sharedStash = stash('online', 'cash', { sharedId: 'sh_online' });
  // what the old app wrote into the owner's own transfers: partner's own account id as the source
  const legacy = { ...tr('legacy', 'partnerCardId', 'stash_online', 100), isShared: true, contributorEmail: 'partner@example.com' };
  const mine = { ...tr('mine', 'cash', 'stash_online', 60), contributorEmail: 'me@example.com' };
  const raw = { stashes: [sharedStash], categories: [], payments: [], transfers: [legacy, mine] };
  const merged = mergeSharedState(raw, [], new Map(), new Map(), ME, false);
  const s = normalizeStash(merged.stashes[0], 'me');
  assert.equal(merged.transfers.find(t => t.id === 'legacy')!.foreign, true);
  assert.equal(merged.transfers.find(t => t.id === 'mine')!.foreign, undefined);
  assert.equal(calcAccountBalance(cash, [], merged.transfers, [], [s]), 50, 'neither transfer changes Cash (mine is internal, theirs is not mine)');
  assert.equal(calcStashBalance(s, [], merged.transfers), 160, 'the stash shows everyone’s money');
  assert.equal(calcAccountAvailableBalance(cash, [s], [], merged.transfers, [], accounts), -10, 'only my 60 is reserved in my Cash');
});
