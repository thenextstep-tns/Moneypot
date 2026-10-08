import type { Account, Occurrence, Payment, Plan, Stash, Transfer } from './types';
import { convert } from './fx';

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
    const kind = p.kind ?? plan?.kind;
    const stashId = p.stashId ?? plan?.stashId;
    if (!kind) continue;
    if (p.accountId === a.id) b += kind === 'income' ? p.amount : -p.amount;
    if (kind === 'saving' && stashes.find(s => s.id === stashId)?.accountId === a.id) b += p.amount;
  }
  for (const t of transfers) {
    if (t.status === 'cancelled') continue;
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
