import type { Account, Category, Occurrence, Payment, Plan, Stash, Transfer } from './types';
import { convert } from './fx';
import { addDays, occurrences, parse, today } from './schedule';
import { calcProjectedStashBalance, calcStashBalance, getPhysicalAccountId } from './balances';

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
  balanceOriginal: number; // Total physical balance
  balanceInMain: number;
  availableOriginal: number; // Free spending balance (balanceOriginal - stashedOriginal)
  availableInMain: number;
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
  totalBalance: number; // Total physical liquid balance
  totalAvailable: number; // Available free cash to spend (totalBalance - totalStashed)
  totalStashed: number; // Total stashed / reserved funds
  stashedY0: number;
  stashedY1: number;
  positiveTotalInMain: number; // Top of stacked positive accounts (>= 0)
  negativeTotalInMain: number; // Bottom of stacked negative accounts (<= 0)
  lowestAccountBalance: number; // Lowest single-account balanceInMain on this day
  lowestAvailableBalance: number; // Lowest single-account availableInMain on this day
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

  // Map occurrences by effective date (respecting postponed dates)
  const futureOccurrencesByDate = new Map<string, Occurrence[]>();
  for (const o of futureOccurrences) {
    const effDate = o.date || o.dueDate;
    const arr = futureOccurrencesByDate.get(effDate) ?? [];
    arr.push(o);
    futureOccurrencesByDate.set(effDate, arr);
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
    const rawAccId = p.accountId || plan?.accountId || s?.accountId;
    const sourceAccId = getPhysicalAccountId(rawAccId, stashes, undefined, [a]);
    const amt = p.currency && p.currency !== a.currency ? convert(p.amount, p.currency, a.currency) : p.amount;
    let d = 0;
    if (sourceAccId === a.id) {
      if (kind === 'income') d += amt;
      else if (kind === 'expense') d -= amt;
      // Stash saving stays inside the physical account envelope
    }
    return d;
  };

  // Helper: compute delta for an account from a transfer
  const getTransferDelta = (tr: Transfer, a: Account): number => {
    const physFrom = getPhysicalAccountId(tr.fromAccountId, stashes, a.id, [a]);
    const physTo = getPhysicalAccountId(tr.toAccountId, stashes, a.id, [a]);
    if (physFrom === a.id && physTo === a.id) {
      return 0;
    }
    let d = 0;
    if (physFrom === a.id) {
      const amt = tr.fromCurrency && tr.fromCurrency !== a.currency ? convert(tr.fromAmount, tr.fromCurrency, a.currency) : tr.fromAmount;
      d -= amt;
    }
    if (physTo === a.id) {
      const amt = tr.toCurrency && tr.toCurrency !== a.currency ? convert(tr.toAmount, tr.toCurrency, a.currency) : tr.toAmount;
      d += amt;
    }
    return d;
  };

  // Helper: compute delta for an account from a future occurrence
  const getOccurrenceDelta = (o: Occurrence, a: Account): number => {
    const kind = o.kind ?? o.plan.kind ?? 'expense';
    if (kind === 'transfer') {
      const physFrom = getPhysicalAccountId(o.accountId, stashes, a.id, [a]);
      const physTo = getPhysicalAccountId(o.toAccountId, stashes, a.id, [a]);
      if (physFrom === a.id && physTo === a.id) {
        return 0;
      }
      let d = 0;
      if (physFrom === a.id) {
        const amt = o.currency && o.currency !== a.currency ? convert(o.amount, o.currency, a.currency) : o.amount;
        d -= amt;
      }
      if (physTo === a.id) {
        const toAmt = o.toAmount ?? o.amount;
        const toCur = o.toCurrency ?? o.currency;
        const amt = toCur !== a.currency ? convert(toAmt, toCur, a.currency) : toAmt;
        d += amt;
      }
      return d;
    }
    const s = o.stashId ? stashes.find(x => x.id === o.stashId) : (o.plan.stashId ? stashes.find(x => x.id === o.plan.stashId) : undefined);
    const rawAccId = o.accountId || o.plan.accountId || s?.accountId;
    const sourceAccId = getPhysicalAccountId(rawAccId, stashes, undefined, [a]);
    const amt = o.currency && o.currency !== a.currency ? convert(o.amount, o.currency, a.currency) : o.amount;
    let d = 0;
    if (sourceAccId === a.id) {
      if (kind === 'income') d += amt;
      else if (kind === 'expense') d -= amt;
    }
    return d;
  };

  // Calculate live balances as of today (excluding future-dated transfers/payments)
  const liveBalancesToday = new Map<string, number>();
  for (const a of accounts) {
    let b = a.startBalance;
    for (const p of confirmedPayments) {
      if (p.date <= t) b += getPaymentDelta(p, a);
    }
    for (const tr of activeTransfers) {
      if (!tr.date || tr.date <= t) b += getTransferDelta(tr, a);
    }
    liveBalancesToday.set(a.id, b);
  }

  const findParty = (id?: string) => {
    if (!id) return undefined;
    const acc = accounts.find(a => a.id === id);
    if (acc) return { name: acc.name, color: acc.color };
    const st = stashes.find(s => s.id === id || `stash_${s.id}` === id);
    if (st) return { name: `${st.emoji} ${st.name}`, color: undefined };
    return undefined;
  };

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
        const physAccId = getPhysicalAccountId(p.accountId || plan?.accountId, stashes, undefined, accounts);
        if (p.accountId && !accounts.some(a => a.id === p.accountId || a.id === physAccId)) continue;
        const catId = p.categoryId ?? plan?.categoryId;
        const cat = catId ? categories.find(c => c.id === catId) : undefined;
        const acc = accounts.find(a => a.id === p.accountId || a.id === physAccId);
        const isCorrection = Boolean(
          p.isCorrection ||
          p.name === 'Balance correction' ||
          p.name === 'Technical balance edit' ||
          p.name?.includes('Balance correction') ||
          p.id.startsWith('adj_') ||
          p.planId?.startsWith('adj_')
        );
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
          isShared: p.isShared ?? plan?.isShared,
          isCorrection,
        });
      }
    }

    // 2. Transfers on this date
    for (const tr of activeTransfers) {
      if (tr.date === date) {
        const physFrom = getPhysicalAccountId(tr.fromAccountId, stashes, undefined, accounts);
        const physTo = getPhysicalAccountId(tr.toAccountId, stashes, undefined, accounts);
        if (!accounts.some(a => a.id === tr.fromAccountId || a.id === tr.toAccountId || a.id === physFrom || a.id === physTo)) continue;
        const fromParty = findParty(tr.fromAccountId);
        const toParty = findParty(tr.toAccountId);
        items.push({
          id: tr.id,
          name: `Transfer (${fromParty?.name ?? 'Account'} → ${toParty?.name ?? 'Account'})`,
          amount: tr.fromAmount,
          currency: tr.fromCurrency,
          amountInMain: convert(tr.fromAmount, tr.fromCurrency, mainCurrency),
          kind: 'transfer',
          status: 'confirmed',
          date,
          accountId: tr.fromAccountId,
          accountName: fromParty?.name,
          accountColor: fromParty?.color,
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
          const physFrom = getPhysicalAccountId(o.accountId, stashes, undefined, accounts);
          const physTo = getPhysicalAccountId(o.toAccountId, stashes, undefined, accounts);
          if (!accounts.some(a => a.id === o.accountId || a.id === o.toAccountId || a.id === physFrom || a.id === physTo)) continue;
          const fromParty = findParty(o.accountId);
          const toParty = findParty(o.toAccountId);
          items.push({
            id: o.key,
            name: o.name || `Transfer (${fromParty?.name ?? 'Account'} → ${toParty?.name ?? 'Account'})`,
            amount: o.amount,
            currency: o.currency,
            amountInMain: convert(o.amount, o.currency, mainCurrency),
            kind: 'transfer',
            status: 'pending',
            date,
            accountId: o.accountId,
            accountName: fromParty?.name,
            accountColor: fromParty?.color,
            emoji: '⇄',
          });
          continue;
        }
        const physAccId = getPhysicalAccountId(o.accountId || o.plan.accountId, stashes, undefined, accounts);
        if (o.accountId && !accounts.some(a => a.id === o.accountId || a.id === physAccId)) continue;
        const acc = accounts.find(a => a.id === o.accountId || a.id === physAccId);
        const catId = o.categoryId ?? o.plan.categoryId;
        const cat = catId ? categories.find(c => c.id === catId) : undefined;
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
      if (it.isCorrection) continue;
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
        const pastTrans = activeTransfers.filter(tr => !tr.date || tr.date <= date);
        bStash = calcStashBalance(s, pastPays, pastTrans, plans);
      }

      // Track stashed amounts mapped to parent account (for stacked chart & account-level reserve tracking)
      const isShared = Boolean(
        s.isShared ||
        (s.sharedWith && s.sharedWith.length > 0) ||
        (s.ownerId && accounts.length > 0 && !accounts.some(acc => acc.id === s.accountId))
      );
      const hasValidAcc = s.accountId && accounts.some(acc => acc.id === s.accountId);
      const parentAccId = hasValidAcc ? s.accountId : (!isShared ? accounts[0]?.id : undefined);
      if (parentAccId) {
        const parentAcc = accounts.find(a => a.id === parentAccId);
        if (parentAcc) {
          const clampedStash = Math.max(0, bStash);
          const amtInParent = s.currency === parentAcc.currency ? clampedStash : convert(clampedStash, s.currency, parentAcc.currency);
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
    let cumulativePosY = 0;
    let cumulativeNegY = 0;

    for (const a of accounts) {
      let b = 0;
      if (date <= t) {
        // Historical / today: starter balance + confirmed payments & transfers up to this date
        b = a.startBalance;
        for (const p of confirmedPayments) {
          if (p.date <= date) b += getPaymentDelta(p, a);
        }
        for (const tr of activeTransfers) {
          if (!tr.date || tr.date <= date) b += getTransferDelta(tr, a);
        }
      } else {
        // Future date: today's live balance + all future payments, transfers, and pending occurrences up to this date
        b = liveBalancesToday.get(a.id) ?? a.startBalance;
        for (const p of confirmedPayments) {
          if (p.date > t && p.date <= date) b += getPaymentDelta(p, a);
        }
        for (const tr of activeTransfers) {
          if (tr.date && tr.date > t && tr.date <= date) b += getTransferDelta(tr, a);
        }
        for (const o of futureOccurrences) {
          const effDate = o.date || o.dueDate;
          if (effDate <= date) {
            b += getOccurrenceDelta(o, a);
          }
        }
      }

      const stashedForAcc = stashAmountByAcc.get(a.id) ?? 0;

      const balInMain = convert(b, a.currency, mainCurrency);
      let y0 = 0;
      let y1 = 0;
      if (balInMain >= 0) {
        y0 = cumulativePosY;
        y1 = cumulativePosY + balInMain;
        cumulativePosY += balInMain;
      } else {
        y0 = cumulativeNegY + balInMain;
        y1 = cumulativeNegY;
        cumulativeNegY += balInMain;
      }

      const stashedInMain = convert(stashedForAcc, a.currency, mainCurrency);
      const availableOriginal = b - stashedForAcc;
      const availableInMain = balInMain - stashedInMain;

      accountDayBals.push({
        accountId: a.id,
        accountName: a.name,
        accountColor: a.color || '#3B82F6',
        currency: a.currency,
        balanceOriginal: b,
        balanceInMain: balInMain,
        availableOriginal,
        availableInMain,
        stashedOriginal: stashedForAcc,
        stashedInMain,
        y0,
        y1,
      });
    }

    const totalBalance = accountDayBals.reduce((sum, ab) => sum + ab.balanceInMain, 0);
    const totalStashed = accountDayBals.reduce((sum, ab) => sum + ab.stashedInMain, 0);
    const totalAvailable = totalBalance - totalStashed;
    const lowestAccountBalance = accountDayBals.length > 0 ? Math.min(...accountDayBals.map(ab => ab.balanceInMain)) : 0;
    const lowestAvailableBalance = accountDayBals.length > 0 ? Math.min(...accountDayBals.map(ab => ab.availableInMain)) : 0;
    // Stashed area sits INSIDE the positive balance band at the top
    const stashedY1 = cumulativePosY;
    const stashedY0 = Math.max(0, cumulativePosY - totalStashed);

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
      totalAvailable,
      totalStashed,
      stashedY0,
      stashedY1,
      positiveTotalInMain: cumulativePosY,
      negativeTotalInMain: cumulativeNegY,
      lowestAccountBalance,
      lowestAvailableBalance,
    });
  }

  return result;
}
