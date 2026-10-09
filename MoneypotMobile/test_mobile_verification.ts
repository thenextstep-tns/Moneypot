import {
  calcAccountBalance,
  calcStashBalance,
  calcTotalLiquidBalance,
  calcMonthStartingBalances,
} from './src/domain/balances';
import { calculateCashflowRange } from './src/domain/cashflow';
import { normalizeStash } from './src/context/DataContext';
import { today, addDays, thisMonth, shiftMonth, monthRange, occurrences } from './src/domain/schedule';
import { DEMO, DEFAULT_CATEGORIES } from './src/domain/defaults';
import type { Account, Stash, Transfer, Payment, Plan } from './src/domain/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

console.log('--- Starting Moneypot Android Mobile Verification Suite ---');

// Test 1: Transfer Net Wealth Neutrality
{
  const accounts: Account[] = [
    { id: 'acc1', name: 'Card', type: 'card', currency: 'EUR', startBalance: 1000, color: '#333' },
    { id: 'acc2', name: 'Cash', type: 'cash', currency: 'EUR', startBalance: 200, color: '#444' },
  ];
  const initialTotal = calcTotalLiquidBalance(accounts, [], [], [], [], 'EUR');
  assert(initialTotal === 1200, `Initial liquid wealth is 1200 EUR (got ${initialTotal})`);

  // Plan a 400 EUR transfer
  const transfers: Transfer[] = [
    {
      id: 'tr_1',
      date: today(),
      fromAccountId: 'acc1',
      toAccountId: 'acc2',
      fromAmount: 400,
      fromCurrency: 'EUR',
      toAmount: 400,
      toCurrency: 'EUR',
      status: 'confirmed',
    },
  ];

  const bal1 = calcAccountBalance(accounts[0], [], transfers);
  const bal2 = calcAccountBalance(accounts[1], [], transfers);
  assert(bal1 === 600, `Source account debited: 600 EUR (got ${bal1})`);
  assert(bal2 === 600, `Destination account credited: 600 EUR (got ${bal2})`);

  const afterTotal = calcTotalLiquidBalance(accounts, [], transfers, [], [], 'EUR');
  assert(afterTotal === 1200, `Net wealth remains strictly neutral at 1200 EUR (got ${afterTotal})`);
}

// Test 2: Instant Access vs Shared Stash
{
  const personalStash: Stash = {
    id: 's_personal',
    name: 'Emergency Fund',
    emoji: '🛟',
    target: 3000,
    currency: 'EUR',
    startAmount: 500,
  };
  const normPersonal = normalizeStash(personalStash, 'user_1');
  assert(normPersonal.isInstantAccess === true, 'Personal stash defaults to isInstantAccess: true');

  const sharedStash: Stash = {
    id: 's_shared',
    name: 'Joint Vacation',
    emoji: '🏖️',
    target: 2000,
    currency: 'EUR',
    startAmount: 200,
    sharedWith: ['partner@example.com'],
  };
  const normShared = normalizeStash(sharedStash, 'user_1');
  assert(normShared.isInstantAccess === false, 'Shared stash is normalized to isInstantAccess: false');
}

// Test 3: Stash Balance Correction
{
  const stash: Stash = {
    id: 's_trip',
    name: 'Trip to Tokyo',
    emoji: '✈️',
    target: 4000,
    currency: 'EUR',
    startAmount: 0,
    isInstantAccess: true,
  };

  const initialPayments: Payment[] = [
    {
      id: 'init_s_trip',
      planId: 'init_s_trip',
      dueDate: today(),
      date: today(),
      amount: 1000,
      currency: 'EUR',
      kind: 'saving',
      status: 'confirmed',
      accountId: 'stash_s_trip',
      stashId: 's_trip',
    },
  ];

  const balInitial = calcStashBalance(stash, initialPayments);
  assert(balInitial === 1000, `Initial stash balance is 1000 EUR (got ${balInitial})`);

  // Target balance is 1450 EUR -> delta = +450 EUR
  const adjPayment: Payment = {
    id: `adj_stash_s_trip_${Date.now()}`,
    planId: `adj_stash_s_trip_${Date.now()}`,
    dueDate: today(),
    date: today(),
    amount: 450,
    currency: 'EUR',
    kind: 'saving',
    status: 'confirmed',
    accountId: 'stash_s_trip',
    stashId: 's_trip',
    note: 'Adjusted balance from 1000 to 1450',
  };

  const balAfterAdj = calcStashBalance(stash, [...initialPayments, adjPayment]);
  assert(balAfterAdj === 1450, `Balance correction updates live balance to 1450 EUR (got ${balAfterAdj})`);
}

// Test 4: Cashflow Stash Layer
{
  const testAccs = DEMO.accounts;
  const testStashes = DEMO.stashes;
  const t = today();
  const range = calculateCashflowRange(
    t,
    addDays(t, 7),
    testAccs,
    [],
    DEMO.transfers,
    DEMO.plans,
    testStashes,
    DEFAULT_CATEGORIES,
    'EUR'
  );

  assert(range.length === 8, `Calculated cashflow range contains 8 days (got ${range.length})`);
  const todayFlow = range[0];
  assert(todayFlow.totalBalance > 0, `Liquid balance is positive: ${todayFlow.totalBalance.toFixed(2)} EUR`);
  assert(todayFlow.stashedY1 <= todayFlow.totalBalance, 'Stashed layer is an envelope inside liquid cash layer');
}

// Test 5: Consecutive Month Projections
{
  const nextYm = shiftMonth(thisMonth(), 1);
  const futureStarting = calcMonthStartingBalances(
    DEMO.accounts,
    [],
    DEMO.transfers,
    DEMO.plans,
    DEMO.stashes,
    nextYm,
    'EUR'
  );

  assert(futureStarting.totalLiquid > 0, `Next month projected starting balance computed: ${futureStarting.totalLiquid.toFixed(2)} EUR`);
}

console.log('--- All 5 Domain Verification Checks Passed Successfully! ---');
