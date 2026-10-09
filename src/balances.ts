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
    if (kind === 'transfer') continue; // Handled via transfers collection
    const stashId = p.stashId ?? plan?.stashId;
    const amt = p.currency && p.currency !== a.currency ? convert(p.amount, p.currency, a.currency) : p.amount;
    if (p.accountId === a.id) b += kind === 'income' ? amt : -amt;
  }
  for (const t of transfers) {
    if (t.status === 'cancelled') continue;
    if (t.date && t.date > today()) continue;
    if (t.fromAccountId === a.id) {
      const amt = t.fromCurrency && t.fromCurrency !== a.currency ? convert(t.fromAmount, t.fromCurrency, a.currency) : t.fromAmount;
      b -= amt;
    }
    if (t.toAccountId === a.id) {
      const amt = t.toCurrency && t.toCurrency !== a.currency ? convert(t.toAmount, t.toCurrency, a.currency) : t.toAmount;
      b += amt;
    }
  }
  return b;
}

/** Calculate live balance of a stash considering saving payments, withdrawals, transfers, and expenses */
export function calcStashBalance(
  s: Stash,
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = []
): number {
  let b = s.startAmount || 0;

  // 1. Confirmed payments
  for (const p of payments) {
    if (p.status !== 'confirmed') continue;
    const plan = plans.find(x => x.id === p.planId);
    const kind = p.kind ?? plan?.kind;
    if (kind === 'transfer') continue; // Handled via transfers collection
    const isThisStashSaving = kind === 'saving' && ((p.stashId && p.stashId === s.id) || (plan?.stashId && plan.stashId === s.id));
    const isThisStashPayment = p.accountId === `stash_${s.id}` || p.accountId === s.id;
    // Shared stash with associated pot: expenses in that pot
    const isSharedStashExpense = Boolean(
      s.sharedWith && s.sharedWith.length > 0 && s.categoryId && p.categoryId === s.categoryId && kind === 'expense'
    );

    if (!isThisStashSaving && !isThisStashPayment && !isSharedStashExpense) continue;

    const amt = p.currency && p.currency !== s.currency ? convert(p.amount, p.currency, s.currency) : p.amount;

    if (isThisStashSaving) {
      b += amt;
    } else if (isThisStashPayment) {
      if (kind === 'income') b += amt;
      else b -= amt;
    } else if (isSharedStashExpense) {
      b -= amt;
    }
  }

  // 2. Active confirmed transfers
  for (const t of transfers) {
    if (t.status === 'cancelled') continue;
    if (t.date && t.date > today()) continue;
    if (t.toAccountId === `stash_${s.id}` || t.toAccountId === s.id) {
      const amt = t.toCurrency && t.toCurrency !== s.currency ? convert(t.toAmount, t.toCurrency, s.currency) : t.toAmount;
      b += amt;
    }
    if (t.fromAccountId === `stash_${s.id}` || t.fromAccountId === s.id) {
      const amt = t.fromCurrency && t.fromCurrency !== s.currency ? convert(t.fromAmount, t.fromCurrency, s.currency) : t.fromAmount;
      b -= amt;
    }
  }

  return b;
}

/** Calculate total stashed / reserved funds sitting inside an account (envelopes within this account) */
export function calcAccountStashedBalance(
  a: Account,
  stashes: Stash[],
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  allAccounts: Account[] = []
): number {
  let sum = 0;
  const isFallbackPrimary = allAccounts.length > 0 && allAccounts[0].id === a.id;
  for (const s of stashes) {
    const parentAccId = s.accountId || (isFallbackPrimary ? a.id : undefined);
    if (parentAccId === a.id) {
      const sBal = Math.max(0, calcStashBalance(s, payments, transfers, plans));
      const inAccCur = s.currency && s.currency !== a.currency ? convert(sBal, s.currency, a.currency) : sBal;
      sum += inAccCur;
    }
  }
  return sum;
}

/** Calculate free / available spending balance of an account (Total balance minus reserved stashes) */
export function calcAccountAvailableBalance(
  a: Account,
  stashes: Stash[],
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  allAccounts: Account[] = []
): number {
  const total = calcAccountBalance(a, payments, transfers, plans, stashes);
  const stashed = calcAccountStashedBalance(a, stashes, payments, transfers, plans, allAccounts);
  return Math.max(0, total - stashed);
}

/** Map of all account balances keyed by account ID (and stash_ ID for stashes) */
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
  for (const s of stashes) {
    const sBal = calcStashBalance(s, payments, transfers, plans);
    map.set(s.id, sBal);
    map.set(`stash_${s.id}`, sBal);
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
    if (o.kind === 'transfer') {
      if (o.accountId === account.id) {
        const amtInAcc = convert(o.amount, o.currency, account.currency);
        projected -= amtInAcc;
      }
      if (o.toAccountId === account.id) {
        const toAmt = o.toAmount ?? o.amount;
        const toCur = o.toCurrency ?? o.currency;
        const amtInAcc = convert(toAmt, toCur, account.currency);
        projected += amtInAcc;
      }
      continue;
    }
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

/** Calculate projected balance of a stash on a future target date */
export function calcProjectedStashBalance(
  s: Stash,
  targetDate: string,
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  todayDate: string = today()
): ProjectedBalanceResult {
  const current = calcStashBalance(s, payments, transfers, plans);
  if (!targetDate || targetDate <= todayDate) {
    return {
      current,
      projected: current,
      isFuture: false,
      targetDate: targetDate || todayDate,
    };
  }

  const tomorrow = addDays(todayDate, 1);
  const futurePending = occurrences(plans, payments, tomorrow, targetDate).filter(o => o.status === 'pending');

  let projected = current;
  for (const o of futurePending) {
    if (o.kind === 'transfer') {
      if (o.accountId === `stash_${s.id}` || o.accountId === s.id) {
        const amtInStash = convert(o.amount, o.currency, s.currency);
        projected -= amtInStash;
      }
      if (o.toAccountId === `stash_${s.id}` || o.toAccountId === s.id) {
        const toAmt = o.toAmount ?? o.amount;
        const toCur = o.toCurrency ?? o.currency;
        const amtInStash = convert(toAmt, toCur, s.currency);
        projected += amtInStash;
      }
      continue;
    }
    const isThisStashSaving = o.kind === 'saving' && (o.stashId === s.id || o.plan?.stashId === s.id);
    const isThisStashPayment = o.accountId === `stash_${s.id}` || o.accountId === s.id;
    const isSharedStashExpense = Boolean(
      s.sharedWith && s.sharedWith.length > 0 && s.categoryId && o.categoryId === s.categoryId && o.kind === 'expense'
    );

    if (!isThisStashSaving && !isThisStashPayment && !isSharedStashExpense) continue;

    const amt = o.currency && o.currency !== s.currency ? convert(o.amount, o.currency, s.currency) : o.amount;
    if (isThisStashSaving) {
      projected += amt;
    } else if (isThisStashPayment) {
      if (o.kind === 'income') projected += amt;
      else projected -= amt;
    } else if (isSharedStashExpense) {
      projected -= amt;
    }
  }

  for (const tr of transfers) {
    if (tr.status === 'cancelled') continue;
    if (tr.date > todayDate && tr.date <= targetDate) {
      if (tr.toAccountId === `stash_${s.id}` || tr.toAccountId === s.id) {
        const amt = tr.toCurrency && tr.toCurrency !== s.currency ? convert(tr.toAmount, tr.toCurrency, s.currency) : tr.toAmount;
        projected += amt;
      }
      if (tr.fromAccountId === `stash_${s.id}` || tr.fromAccountId === s.id) {
        const amt = tr.fromCurrency && tr.fromCurrency !== s.currency ? convert(tr.fromAmount, tr.fromCurrency, s.currency) : tr.fromAmount;
        projected -= amt;
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
 * Returns a Map of accountId (and stash_ id) -> { current: number, projected: number }
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
  for (const s of stashes) {
    const res = calcProjectedStashBalance(s, targetDate, payments, transfers, plans, todayDate);
    map.set(s.id, { current: res.current, projected: res.projected });
    map.set(`stash_${s.id}`, { current: res.current, projected: res.projected });
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

/** Total stashed / reserved funds across all accounts converted into target currency */
export function calcTotalStashedBalance(
  accounts: Account[],
  stashes: Stash[],
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  targetCurrency = 'EUR'
): number {
  let sum = 0;
  for (const a of accounts) {
    const stashed = calcAccountStashedBalance(a, stashes, payments, transfers, plans, accounts);
    sum += convert(stashed, a.currency, targetCurrency);
  }
  return sum;
}

/** Total free / available spending cash across all accounts converted into target currency */
export function calcTotalAvailableBalance(
  accounts: Account[],
  stashes: Stash[],
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  targetCurrency = 'EUR'
): number {
  const total = calcTotalLiquidBalance(accounts, payments, transfers, plans, stashes, targetCurrency);
  const stashed = calcTotalStashedBalance(accounts, stashes, payments, transfers, plans, targetCurrency);
  return Math.max(0, total - stashed);
}

/** Check if an account or stash has sufficient balance for a specific payment/expense */
export function checkAccountFunds(
  accountId: string | undefined,
  amount: number,
  currency: string,
  accounts: Account[],
  balances: Map<string, number>,
  stashes: Stash[] = []
): { hasAccount: boolean; accountName?: string; balance?: number; accountCurrency?: string; neededInAccCur: number; isShort: boolean; shortBy: number } {
  if (!accountId) {
    return { hasAccount: false, neededInAccCur: amount, isShort: false, shortBy: 0 };
  }

  const isStash = accountId.startsWith('stash_') || stashes.some(s => s.id === accountId);
  if (isStash) {
    const sId = accountId.startsWith('stash_') ? accountId.replace('stash_', '') : accountId;
    const stash = stashes.find(s => s.id === sId);
    if (!stash) return { hasAccount: false, neededInAccCur: amount, isShort: false, shortBy: 0 };
    const bal = balances.get(accountId) ?? balances.get(stash.id) ?? stash.startAmount;
    const neededInAccCur = convert(amount, currency, stash.currency);
    const isShort = bal < neededInAccCur;
    const shortBy = Math.max(0, neededInAccCur - bal);
    return {
      hasAccount: true,
      accountName: `${stash.emoji} ${stash.name} (Stash)`,
      balance: bal,
      accountCurrency: stash.currency,
      neededInAccCur,
      isShort,
      shortBy,
    };
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
    let outSum = 0;
    let inSum = 0;

    // Net balance change per due date (incoming transfers count as money in)
    const deltaByDate = new Map<string, number>();
    const addDelta = (date: string, d: number) => deltaByDate.set(date, (deltaByDate.get(date) ?? 0) + d);

    for (const o of pending) {
      const isSource = o.accountId === a.id;
      const isTransferTarget = o.kind === 'transfer' && o.toAccountId === a.id;
      if (isSource && isTransferTarget) continue; // transfer to itself: no effect

      if (isSource) {
        const amtInAcc = convert(o.amount, o.currency, a.currency);
        if (o.kind === 'income') {
          inSum += amtInAcc;
          addDelta(o.dueDate, amtInAcc);
        } else {
          outSum += amtInAcc;
          addDelta(o.dueDate, -amtInAcc);
        }
      } else if (isTransferTarget) {
        const toAmt = o.toAmount ?? o.amount;
        const toCur = o.toCurrency ?? o.currency;
        const amtInAcc = convert(toAmt, toCur, a.currency);
        inSum += amtInAcc;
        addDelta(o.dueDate, amtInAcc);
      }
    }

    // Walk through the period day by day and find the lowest balance
    let running = bal;
    let lowest = bal;
    for (const date of [...deltaByDate.keys()].sort()) {
      running += deltaByDate.get(date) ?? 0;
      if (running < lowest) lowest = running;
    }

    const projected = bal + inSum - outSum;
    if (lowest < -0.005) {
      warnings.push({
        accountId: a.id,
        accountName: a.name,
        accountCurrency: a.currency,
        currentBalance: bal,
        scheduledOutgoing: outSum,
        scheduledIncoming: inSum,
        projectedBalance: projected,
        shortBy: -lowest,
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
      if (o.kind === 'transfer') {
        if (o.accountId) {
          const fromAcc = accounts.find(a => a.id === o.accountId);
          if (fromAcc) {
            const amtInFrom = convert(o.amount, o.currency, fromAcc.currency);
            const curr = accBals.get(fromAcc.id) ?? 0;
            accBals.set(fromAcc.id, curr - amtInFrom);
          }
        }
        if (o.toAccountId) {
          const toAcc = accounts.find(a => a.id === o.toAccountId);
          if (toAcc) {
            const toAmt = o.toAmount ?? o.amount;
            const toCur = o.toCurrency ?? o.currency;
            const amtInTo = convert(toAmt, toCur, toAcc.currency);
            const curr = accBals.get(toAcc.id) ?? 0;
            accBals.set(toAcc.id, curr + amtInTo);
          }
        }
        continue;
      }

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

    for (const tr of transfers) {
      if (tr.status === 'cancelled') continue;
      if (tr.date && tr.date > todayDate && tr.date <= toDate) {
        if (tr.fromAccountId) {
          const fromAcc = accounts.find(a => a.id === tr.fromAccountId);
          if (fromAcc) {
            const amt = tr.fromCurrency && tr.fromCurrency !== fromAcc.currency ? convert(tr.fromAmount, tr.fromCurrency, fromAcc.currency) : tr.fromAmount;
            accBals.set(fromAcc.id, (accBals.get(fromAcc.id) ?? 0) - amt);
          }
        }
        if (tr.toAccountId) {
          const toAcc = accounts.find(a => a.id === tr.toAccountId);
          if (toAcc) {
            const amt = tr.toCurrency && tr.toCurrency !== toAcc.currency ? convert(tr.toAmount, tr.toCurrency, toAcc.currency) : tr.toAmount;
            accBals.set(toAcc.id, (accBals.get(toAcc.id) ?? 0) + amt);
          }
        }
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
