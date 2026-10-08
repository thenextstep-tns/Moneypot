import type { Account, Occurrence, Payment, Plan, Stash, Transfer } from './types';
import { convert } from './fx';
import { addDays, monthRange, occurrences, shiftMonth, today } from './schedule';

/** Calculate live balance of an account considering payments and transfers */
export function calcAccountBalance(
  a: Account,
  payments: Payment[],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  stashes: Stash[] = []
): number {
  let b = a.startBalance;
  for (const p of payments) {
    if (p.status !== 'confirmed') continue;
    const plan = plans.find(x => x.id === p.planId);
    const kind = p.kind ?? plan?.kind ?? 'expense';
    const stashId = p.stashId ?? plan?.stashId;
    const amt = p.currency && p.currency !== a.currency ? convert(p.amount, p.currency, a.currency) : p.amount;
    if (p.accountId === a.id) b += kind === 'income' ? amt : -amt;
  }
  for (const t of transfers) {
    if (t.status === 'cancelled') continue;
    if (t.date && t.date > today()) continue;
    if (t.fromAccountId === a.id) b -= t.fromAmount;
    if (t.toAccountId === a.id) b += t.toAmount;
  }
  return b;
}

/** Map of all account balances keyed by account ID */
export function calcAllAccountBalances(
  accounts: Account[],
  payments: Payment[],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  stashes: Stash[] = []
): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of accounts) {
    map.set(a.id, calcAccountBalance(a, payments, transfers, plans, stashes));
  }
  return map;
}

export interface ProjectedBalanceResult {
  current: number;
  projected: number;
  isFuture: boolean;
  targetDate: string;
}

/**
 * Calculates both the current live balance and the projected balance of an account
 * as of a given target date (YYYY-MM-DD), taking into account pending plan occurrences
 * and future transfers.
 */
export function calcProjectedAccountBalance(
  account: Account,
  targetDate: string,
  payments: Payment[],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  stashes: Stash[] = [],
  todayDate: string = today()
): ProjectedBalanceResult {
  const current = calcAccountBalance(account, payments, transfers, plans, stashes);
  if (!targetDate || targetDate <= todayDate) {
    return {
      current,
      projected: current,
      isFuture: false,
      targetDate: targetDate || todayDate,
    };
  }

  // Future date: take today's live balance and apply all pending transactions
  // scheduled between tomorrow and targetDate.
  const tomorrow = addDays(todayDate, 1);
  const futurePending = occurrences(plans, payments, tomorrow, targetDate).filter(o => o.status === 'pending');

  let projected = current;

  // 1. Pending occurrences for this account
  for (const o of futurePending) {
    const amtInAcc = convert(o.amount, o.currency, account.currency);
    if (o.accountId === account.id) {
      if (o.kind === 'income') {
        projected += amtInAcc;
      } else {
        projected -= amtInAcc;
      }
    }
  }

  // 2. Future transfers between tomorrow and targetDate
  for (const tr of transfers) {
    if (tr.status === 'cancelled') continue;
    if (tr.date > todayDate && tr.date <= targetDate) {
      if (tr.fromAccountId === account.id) {
        projected -= tr.fromAmount;
      }
      if (tr.toAccountId === account.id) {
        projected += tr.toAmount;
      }
    }
  }

  return {
    current,
    projected,
    isFuture: true,
    targetDate,
  };
}

/**
 * Returns a Map of accountId -> { current: number, projected: number }
 * as of targetDate.
 */
export function calcAllProjectedAccountBalances(
  accounts: Account[],
  targetDate: string,
  payments: Payment[],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  stashes: Stash[] = [],
  todayDate: string = today()
): Map<string, { current: number; projected: number }> {
  const map = new Map<string, { current: number; projected: number }>();
  for (const a of accounts) {
    const res = calcProjectedAccountBalance(a, targetDate, payments, transfers, plans, stashes, todayDate);
    map.set(a.id, { current: res.current, projected: res.projected });
  }
  return map;
}

/** Total liquid balance across all accounts converted into the target currency */
export function calcTotalLiquidBalance(
  accounts: Account[],
  payments: Payment[],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  stashes: Stash[] = [],
  targetCurrency = 'EUR'
): number {
  let sum = 0;
  for (const a of accounts) {
    const bal = calcAccountBalance(a, payments, transfers, plans, stashes);
    sum += convert(bal, a.currency, targetCurrency);
  }
  return sum;
}

/** Check if an account has sufficient balance for a specific payment/expense */
export function checkAccountFunds(
  accountId: string | undefined,
  amount: number,
  currency: string,
  accounts: Account[],
  balances: Map<string, number>
): { hasAccount: boolean; accountName?: string; balance?: number; accountCurrency?: string; neededInAccCur: number; isShort: boolean; shortBy: number } {
  if (!accountId) {
    return { hasAccount: false, neededInAccCur: amount, isShort: false, shortBy: 0 };
  }
  const acc = accounts.find(a => a.id === accountId);
  if (!acc) {
    return { hasAccount: false, neededInAccCur: amount, isShort: false, shortBy: 0 };
  }
  const bal = balances.get(acc.id) ?? 0;
  const neededInAccCur = convert(amount, currency, acc.currency);
  const isShort = bal < neededInAccCur;
  const shortBy = Math.max(0, neededInAccCur - bal);

  return {
    hasAccount: true,
    accountName: acc.name,
    balance: bal,
    accountCurrency: acc.currency,
    neededInAccCur,
    isShort,
    shortBy,
  };
}

export interface AccountShortfallWarning {
  accountId: string;
  accountName: string;
  accountCurrency: string;
  currentBalance: number;
  scheduledOutgoing: number;
  scheduledIncoming: number;
  projectedBalance: number;
  shortBy: number;
}

/** Check which accounts don't have enough money for their scheduled pending items in a given period */
export function findAccountShortfalls(
  accounts: Account[],
  occurrences: Occurrence[],
  balances: Map<string, number>
): AccountShortfallWarning[] {
  const warnings: AccountShortfallWarning[] = [];
  const pending = occurrences.filter(o => o.status === 'pending');

  for (const a of accounts) {
    const bal = balances.get(a.id) ?? 0;
    const aPending = pending.filter(o => o.accountId === a.id);
    let outSum = 0;
    let inSum = 0;

    for (const o of aPending) {
      const amtInAcc = convert(o.amount, o.currency, a.currency);
      if (o.kind === 'income') {
        inSum += amtInAcc;
      } else {
        outSum += amtInAcc;
      }
    }

    const projected = bal + inSum - outSum;
    if (projected < 0 || (bal < outSum && outSum > 0)) {
      warnings.push({
        accountId: a.id,
        accountName: a.name,
        accountCurrency: a.currency,
        currentBalance: bal,
        scheduledOutgoing: outSum,
        scheduledIncoming: inSum,
        projectedBalance: projected,
        shortBy: Math.max(0, outSum - (bal + inSum)),
      });
    }
  }

  return warnings;
}

export interface MonthBalanceProjection {
  accountBalances: Map<string, number>;
  totalLiquid: number;
}

/**
 * Calculates the projected starting balances for each account and total liquid balance
 * at the start of a given month (targetYm), taking into account pending scheduled transactions.
 * - For current month: returns live balances today.
 * - For future months: adjusts today's live balance by all pending items scheduled before the 1st of targetYm.
 * - For past months: unwinds confirmed transactions that occurred on or after the 1st of targetYm.
 */
export function calcMonthStartingBalances(
  accounts: Account[],
  payments: Payment[],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  stashes: Stash[] = [],
  targetYm: string,
  targetCurrency = 'EUR',
  todayDate = today()
): MonthBalanceProjection {
  const curYm = todayDate.slice(0, 7);
  const liveBalances = calcAllAccountBalances(accounts, payments, transfers, plans, stashes);

  if (targetYm === curYm) {
    return {
      accountBalances: liveBalances,
      totalLiquid: calcTotalLiquidBalance(accounts, payments, transfers, plans, stashes, targetCurrency),
    };
  }

  if (targetYm > curYm) {
    // Future month: Starting balance at targetYm-01 = live balance today
    // + all pending transactions between today and the end of the previous month.
    const fromDate = addDays(todayDate, -60);
    const toDate = monthRange(shiftMonth(targetYm, -1))[1];
    const priorPending = occurrences(plans, payments, fromDate, toDate).filter(o => o.status === 'pending');

    const accBals = new Map<string, number>(liveBalances);
    let unassignedNet = 0;

    for (const o of priorPending) {
      if (o.accountId) {
        const acc = accounts.find(a => a.id === o.accountId);
        if (acc) {
          const amtInAcc = convert(o.amount, o.currency, acc.currency);
          const curr = accBals.get(acc.id) ?? 0;
          if (o.kind === 'income') {
            accBals.set(acc.id, curr + amtInAcc);
          } else {
            accBals.set(acc.id, curr - amtInAcc);
          }
        }
      } else {
        // Pending item without a designated account still impacts total liquid funds
        const amtInTarget = convert(o.amount, o.currency, targetCurrency);
        if (o.kind === 'income') unassignedNet += amtInTarget;
        else unassignedNet -= amtInTarget;
      }
    }

    let projectedTotal = 0;
    for (const a of accounts) {
      const bal = accBals.get(a.id) ?? 0;
      projectedTotal += convert(bal, a.currency, targetCurrency);
    }
    projectedTotal += unassignedNet;

    return {
      accountBalances: accBals,
      totalLiquid: projectedTotal,
    };
  }

  // Past month: Unwind confirmed payments & transfers that happened since targetYm-01
  const startOfPastMonth = `${targetYm}-01`;
  const accBals = new Map<string, number>(liveBalances);

  for (const p of payments) {
    if (p.status !== 'confirmed') continue;
    if (p.date < startOfPastMonth) continue;
    const plan = plans.find(x => x.id === p.planId);
    const kind = p.kind ?? plan?.kind;
    const stashId = p.stashId ?? plan?.stashId;
    if (!kind) continue;

    if (p.accountId) {
      const acc = accounts.find(a => a.id === p.accountId);
      if (acc) {
        const curr = accBals.get(acc.id) ?? 0;
        if (kind === 'income') {
          accBals.set(acc.id, curr - p.amount);
        } else {
          accBals.set(acc.id, curr + p.amount);
        }
      }
    }
  }

  for (const t of transfers) {
    if (t.status === 'cancelled') continue;
    if (t.date < startOfPastMonth) continue;
    if (t.fromAccountId) {
      const curr = accBals.get(t.fromAccountId) ?? 0;
      accBals.set(t.fromAccountId, curr + t.fromAmount);
    }
    if (t.toAccountId) {
      const curr = accBals.get(t.toAccountId) ?? 0;
      accBals.set(t.toAccountId, curr - t.toAmount);
    }
  }

  let histTotal = 0;
  for (const a of accounts) {
    const bal = accBals.get(a.id) ?? 0;
    histTotal += convert(bal, a.currency, targetCurrency);
  }

  return {
    accountBalances: accBals,
    totalLiquid: histTotal,
  };
}
