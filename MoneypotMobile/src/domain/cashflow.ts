import type { Account, Category, Occurrence, Payment, Plan, Stash, Transfer } from './types';
import { convert } from './fx';
import { addDays, occurrences, parse, today } from './schedule';
import { calcProjectedStashBalance, calcStashBalance } from './balances';

export interface CashflowItem {
  id: string;
  name: string;
  amount: number;
  currency: string;
  amountInMain: number;
  kind: 'income' | 'expense' | 'saving' | 'transfer';
  status: 'confirmed' | 'pending';
  date: string;
  accountId?: string;
  accountName?: string;
  accountColor?: string;
  category?: string;
  subcategory?: string;
  emoji?: string;
  isShared?: boolean;
  isCorrection?: boolean;
}

export interface AccountDayBalance {
  accountId: string;
  accountName: string;
  accountColor: string;
  currency: string;
  balanceOriginal: number; // Available liquid balance
  balanceInMain: number;
  stashedOriginal: number; // Stashed / reserved funds associated with this account
  stashedInMain: number;
  y0: number; // Bottom of stacked area in main currency
  y1: number; // Top of stacked area in main currency
}

export interface StashDayBalance {
  stashId: string;
  stashName: string;
  stashEmoji: string;
  currency: string;
  target?: number;
  balanceOriginal: number;
  balanceInMain: number;
  accountId?: string;
  accountName?: string;
}

export interface DayCashflow {
  date: string; // YYYY-MM-DD
  dayLabel: string; // e.g. "08.10"
  fullLabel: string; // e.g. "Wed, 8 Oct"
  dayOfMonth: number;
  weekdayIndex: number; // 0=Sun, 1=Mon, ..., 6=Sat
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  incomeTotal: number;
  expenseTotal: number;
  savingTotal: number;
  netChange: number;
  items: CashflowItem[];
  accounts: AccountDayBalance[];
  stashes: StashDayBalance[];
  totalBalance: number; // Available liquid balance
  totalStashed: number; // Total stashed / reserved funds
  stashedY0: number;
  stashedY1: number;
}

/** Generate a continuous array of YYYY-MM-DD strings from `from` to `to` */
export function generateDateList(from: string, to: string): string[] {
  const dates: string[] = [];
  let cur = from;
  while (cur <= to) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

/**
 * Compute daily cashflows and stacked account balances across [fromDate, toDate]
 */
export function calculateCashflowRange(
  fromDate: string,
  toDate: string,
  accounts: Account[],
  payments: Payment[],
  transfers: Transfer[],
  plans: Plan[],
  stashes: Stash[],
  categories: Category[] = [],
  mainCurrency = 'EUR'
): DayCashflow[] {
  const t = today();
  const dateList = generateDateList(fromDate, toDate);

  // Compute future pending occurrences from tomorrow up to toDate
  const futureStart = addDays(t, 1);
  const futureOccurrences: Occurrence[] =
    toDate >= futureStart
      ? occurrences(plans, payments, futureStart, toDate).filter(o => o.status === 'pending')
      : [];

  // Map occurrences by date
  const futureOccurrencesByDate = new Map<string, Occurrence[]>();
  for (const o of futureOccurrences) {
    const arr = futureOccurrencesByDate.get(o.dueDate) ?? [];
    arr.push(o);
    futureOccurrencesByDate.set(o.dueDate, arr);
  }

  // Pre-filter confirmed payments and non-cancelled transfers
  const confirmedPayments = payments.filter(p => p.status === 'confirmed');
  const activeTransfers = transfers.filter(tr => tr.status !== 'cancelled');

  // Helper: compute delta for an account from a payment
  const getPaymentDelta = (p: Payment, a: Account): number => {
    const plan = plans.find(x => x.id === p.planId);
    const kind = p.kind ?? plan?.kind ?? 'expense';
    if (kind === 'transfer') return 0; // Handled in activeTransfers
    const stashId = p.stashId ?? plan?.stashId;
    const s = stashId ? stashes.find(x => x.id === stashId) : undefined;
    const sourceAccId = p.accountId || plan?.accountId || s?.accountId;
    const amt = p.currency && p.currency !== a.currency ? convert(p.amount, p.currency, a.currency) : p.amount;
    let d = 0;
    if (sourceAccId === a.id) d += kind === 'income' ? amt : -amt;
    return d;
  };

  // Helper: compute delta for an account from a transfer
  const getTransferDelta = (tr: Transfer, a: Account): number => {
    let d = 0;
    if (tr.fromAccountId === a.id) {
      const amt = tr.fromCurrency && tr.fromCurrency !== a.currency ? convert(tr.fromAmount, tr.fromCurrency, a.currency) : tr.fromAmount;
      d -= amt;
    }
    if (tr.toAccountId === a.id) {
      const amt = tr.toCurrency && tr.toCurrency !== a.currency ? convert(tr.toAmount, tr.toCurrency, a.currency) : tr.toAmount;
      d += amt;
    }
    return d;
  };

  // Helper: compute delta for an account from a future occurrence
  const getOccurrenceDelta = (o: Occurrence, a: Account): number => {
    const kind = o.kind ?? o.plan.kind ?? 'expense';
    if (kind === 'transfer') {
      let d = 0;
      if (o.accountId === a.id) {
        const amt = o.currency && o.currency !== a.currency ? convert(o.amount, o.currency, a.currency) : o.amount;
        d -= amt;
      }
      if (o.toAccountId === a.id) {
        const toAmt = o.toAmount ?? o.amount;
        const toCur = o.toCurrency ?? o.currency;
        const amt = toCur !== a.currency ? convert(toAmt, toCur, a.currency) : toAmt;
        d += amt;
      }
      return d;
    }
    const s = o.stashId ? stashes.find(x => x.id === o.stashId) : (o.plan.stashId ? stashes.find(x => x.id === o.plan.stashId) : undefined);
    const sourceAccId = o.accountId || o.plan.accountId || s?.accountId;
    const amt = o.currency && o.currency !== a.currency ? convert(o.amount, o.currency, a.currency) : o.amount;
    let d = 0;
    if (sourceAccId === a.id) d += kind === 'income' ? amt : -amt;
    return d;
  };

  // Calculate live balances as of today
  const liveBalancesToday = new Map<string, number>();
  for (const a of accounts) {
    let b = a.startBalance;
    for (const p of confirmedPayments) b += getPaymentDelta(p, a);
    for (const tr of activeTransfers) b += getTransferDelta(tr, a);
    liveBalancesToday.set(a.id, b);
  }

  const result: DayCashflow[] = [];

  for (const date of dateList) {
    const isToday = date === t;
    const isPast = date < t;
    const isFuture = date > t;
    const dObj = parse(date);
    const dayOfMonth = dObj.getDate();
    const weekdayIndex = dObj.getDay();
    const dayLabel = `${String(dObj.getDate()).padStart(2, '0')}.${String(dObj.getMonth() + 1).padStart(2, '0')}`;
    const fullLabel = dObj.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

    // Collect daily transactions / cashflow items
    const items: CashflowItem[] = [];

    // 1. Confirmed payments on this date
    for (const p of confirmedPayments) {
      if (p.date === date) {
        const plan = plans.find(x => x.id === p.planId);
        const kind = p.kind ?? plan?.kind ?? 'expense';
        if (kind === 'transfer') continue; // Handled in activeTransfers
        if (p.accountId && !accounts.some(a => a.id === p.accountId)) continue;
        const cat = plan?.categoryId ? categories.find(c => c.id === plan.categoryId) : undefined;
        const acc = accounts.find(a => a.id === p.accountId);
        const isCorrection = p.name === 'Balance correction' || p.planId?.startsWith('adj_');
        items.push({
          id: p.id,
          name: p.name || plan?.name || (kind === 'income' ? 'Income' : 'Expense'),
          amount: p.amount,
          currency: p.currency,
          amountInMain: convert(p.amount, p.currency, mainCurrency),
          kind,
          status: 'confirmed',
          date,
          accountId: p.accountId,
          accountName: acc?.name,
          accountColor: acc?.color,
          category: cat?.name,
          subcategory: p.subcategory || plan?.subcategory,
          emoji: isCorrection ? '⚖️' : (kind === 'saving' ? (stashes.find(s => s.id === (p.stashId ?? plan?.stashId))?.emoji ?? '🌱') : cat?.emoji ?? (kind === 'income' ? '💰' : '💸')),
          isShared: plan?.isShared,
          isCorrection,
        });
      }
    }

    // 2. Transfers on this date
    for (const tr of activeTransfers) {
      if (tr.date === date) {
        if (!accounts.some(a => a.id === tr.fromAccountId || a.id === tr.toAccountId)) continue;
        const fromAcc = accounts.find(a => a.id === tr.fromAccountId);
        const toAcc = accounts.find(a => a.id === tr.toAccountId);
        items.push({
          id: tr.id,
          name: `Transfer (${fromAcc?.name ?? 'Account'} → ${toAcc?.name ?? 'Account'})`,
          amount: tr.fromAmount,
          currency: tr.fromCurrency,
          amountInMain: convert(tr.fromAmount, tr.fromCurrency, mainCurrency),
          kind: 'transfer',
          status: 'confirmed',
          date,
          accountId: tr.fromAccountId,
          accountName: fromAcc?.name,
          accountColor: fromAcc?.color,
          emoji: '⇄',
        });
      }
    }

    // 3. If future, include pending scheduled occurrences on this date
    if (isFuture) {
      const dayOccurrences = futureOccurrencesByDate.get(date) ?? [];
      for (const o of dayOccurrences) {
        const kind = o.kind ?? o.plan.kind ?? 'expense';
        if (kind === 'transfer') {
          if (!accounts.some(a => a.id === o.accountId || a.id === o.toAccountId)) continue;
          const fromAcc = accounts.find(a => a.id === o.accountId);
          const toAcc = accounts.find(a => a.id === o.toAccountId);
          items.push({
            id: o.key,
            name: o.name || `Transfer (${fromAcc?.name ?? 'Account'} → ${toAcc?.name ?? 'Account'})`,
            amount: o.amount,
            currency: o.currency,
            amountInMain: convert(o.amount, o.currency, mainCurrency),
            kind: 'transfer',
            status: 'pending',
            date,
            accountId: o.accountId,
            accountName: fromAcc?.name,
            accountColor: fromAcc?.color,
            emoji: '⇄',
          });
          continue;
        }
        if (o.accountId && !accounts.some(a => a.id === o.accountId)) continue;
        const acc = accounts.find(a => a.id === o.accountId);
        const cat = o.plan.categoryId ? categories.find(c => c.id === o.plan.categoryId) : undefined;
        items.push({
          id: o.key,
          name: o.plan.name,
          amount: o.amount,
          currency: o.currency,
          amountInMain: convert(o.amount, o.currency, mainCurrency),
          kind,
          status: 'pending',
          date,
          accountId: o.accountId,
          accountName: acc?.name,
          accountColor: acc?.color,
          category: cat?.name,
          subcategory: o.plan.subcategory,
          emoji: o.plan.kind === 'saving' ? (stashes.find(s => s.id === o.plan.stashId)?.emoji ?? '🌱') : cat?.emoji ?? (o.plan.kind === 'income' ? '💰' : '💸'),
          isShared: o.plan.isShared,
        });
      }
    }

    // Calculate income total, expense total, and saving total for this day
    let incomeTotal = 0;
    let expenseTotal = 0;
    let savingTotal = 0;
    for (const it of items) {
      if (it.kind === 'income') incomeTotal += it.amountInMain;
      else if (it.kind === 'expense') expenseTotal += it.amountInMain;
      else if (it.kind === 'saving') savingTotal += it.amountInMain;
    }
    const netChange = incomeTotal - (expenseTotal + savingTotal);

    // Calculate individual stash balances on this date
    const stashDayBals: StashDayBalance[] = [];
    const stashAmountByAcc = new Map<string, number>();

    for (const s of stashes) {
      let bStash = 0;
      if (date > t) {
        const proj = calcProjectedStashBalance(s, date, payments, transfers, plans, t);
        bStash = proj.projected;
      } else {
        const pastPays = confirmedPayments.filter(p => p.date <= date);
        const pastTrans = activeTransfers.filter(tr => tr.date <= date);
        bStash = calcStashBalance(s, pastPays, pastTrans, plans);
      }

      // Track stashed amounts mapped to parent account (for stacked chart & account-level reserve tracking)
      const parentAccId = s.accountId || accounts[0]?.id;
      if (parentAccId) {
        const parentAcc = accounts.find(a => a.id === parentAccId);
        if (parentAcc) {
          const amtInParent = s.currency === parentAcc.currency ? bStash : convert(bStash, s.currency, parentAcc.currency);
          stashAmountByAcc.set(parentAccId, (stashAmountByAcc.get(parentAccId) ?? 0) + amtInParent);
        }
      }

      // If accounts filter is active, only include stash in breakdown if its parent account is visible
      if (s.accountId && !accounts.some(a => a.id === s.accountId)) {
        continue;
      }

      const balInMain = convert(bStash, s.currency, mainCurrency);
      const acc = s.accountId ? accounts.find(a => a.id === s.accountId) : undefined;

      stashDayBals.push({
        stashId: s.id,
        stashName: s.name,
        stashEmoji: s.emoji || '🌱',
        currency: s.currency,
        target: s.target,
        balanceOriginal: bStash,
        balanceInMain: balInMain,
        accountId: s.accountId,
        accountName: acc?.name,
      });
    }

    // Calculate account balances at the end of this day
    const accountDayBals: AccountDayBalance[] = [];
    let cumulativeY = 0;

    for (const a of accounts) {
      let b = 0;
      if (date <= t) {
        // Historical / today: starter balance + confirmed payments & transfers up to this date
        b = a.startBalance;
        for (const p of confirmedPayments) {
          if (p.date <= date) b += getPaymentDelta(p, a);
        }
        for (const tr of activeTransfers) {
          if (tr.date <= date) b += getTransferDelta(tr, a);
        }
      } else {
        // Future date: today's live balance + all pending occurrences between tomorrow and this date
        b = liveBalancesToday.get(a.id) ?? a.startBalance;
        for (const o of futureOccurrences) {
          if (o.dueDate <= date) {
            b += getOccurrenceDelta(o, a);
          }
        }
      }

      const stashedForAcc = stashAmountByAcc.get(a.id) ?? 0;

      const balInMain = convert(b, a.currency, mainCurrency);
      const positiveVal = Math.max(0, balInMain);
      const y0 = cumulativeY;
      const y1 = cumulativeY + positiveVal;
      cumulativeY += positiveVal;

      const stashedInMain = convert(stashedForAcc, a.currency, mainCurrency);

      accountDayBals.push({
        accountId: a.id,
        accountName: a.name,
        accountColor: a.color || '#3B82F6',
        currency: a.currency,
        balanceOriginal: b,
        balanceInMain: balInMain,
        stashedOriginal: stashedForAcc,
        stashedInMain,
        y0,
        y1,
      });
    }

    const totalBalance = accountDayBals.reduce((sum, ab) => sum + ab.balanceInMain, 0);
    const totalStashed = accountDayBals.reduce((sum, ab) => sum + ab.stashedInMain, 0);
    const stashedY0 = cumulativeY;
    const stashedY1 = cumulativeY + totalStashed;

    result.push({
      date,
      dayLabel,
      fullLabel,
      dayOfMonth,
      weekdayIndex,
      isToday,
      isPast,
      isFuture,
      incomeTotal,
      expenseTotal,
      savingTotal,
      netChange,
      items,
      accounts: accountDayBals,
      stashes: stashDayBals,
      totalBalance,
      totalStashed,
      stashedY0,
      stashedY1,
    });
  }

  return result;
}
