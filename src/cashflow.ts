import type { Account, Category, Occurrence, Payment, Plan, Stash, Transfer } from './types';
import { convert } from './fx';
import { addDays, isBalanceCorrectionPayment, parse, today } from './schedule';
import {
  conv,
  convAt,
  findStashByRef,
  isSharedStash,
  occurrenceAccountDeltas,
  occurrenceStashDelta,
  paymentAccountDeltas,
  paymentStashDelta,
  pendingForProjection,
  physicalAccountId,
  transferAccountDeltas,
  transferStashDelta,
  type AccountDelta,
} from './balances';

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

interface BalanceEvent { date: string; key: string; amount: number } // amount in the key's own currency

const pushTo = <T,>(map: Map<string, T[]>, key: string, v: T) => {
  const arr = map.get(key);
  if (arr) arr.push(v);
  else map.set(key, [v]);
};

/**
 * Daily cashflows and stacked account balances across [fromDate, toDate].
 * `accounts` may be a filtered subset (account filter). All balance rules come from balances.ts,
 * so this chart always agrees with the Accounts and Today screens.
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
  const futureStart = addDays(t, 1);
  const dateList = generateDateList(fromDate, toDate);
  const planById = new Map(plans.map(p => [p.id, p]));
  const accById = new Map(accounts.map(a => [a.id, a]));

  // Pending occurrences the projection assumes will happen. Overdue and today's unconfirmed items
  // are assumed to happen on the first projected day, so they are never silently dropped.
  const pending: Occurrence[] = toDate >= futureStart ? pendingForProjection(plans, payments, t, toDate) : [];
  const pendingEff = (o: Occurrence) => {
    const d = o.date || o.dueDate;
    return d < futureStart ? futureStart : d;
  };
  const pendingByDate = new Map<string, Occurrence[]>();
  for (const o of pending) pushTo(pendingByDate, pendingEff(o), o);

  const confirmedPayments = payments.filter(p => p.status === 'confirmed');
  const activeTransfers = transfers.filter(tr => tr.status !== 'cancelled');

  // ---- Balance events: account keys = account id, stash = `s:<id>`, own share = `r:<id>` ----
  const events: BalanceEvent[] = [];
  const pushAccount = (date: string, ds: AccountDelta[]) => {
    for (const d of ds) {
      const a = accById.get(d.accountId);
      if (a) events.push({ date, key: a.id, amount: convAt(d.amount, d.currency, a.currency, d.fx) });
    }
  };
  const pushStash = (date: string, delta: (s: Stash) => number, own: boolean) => {
    for (const s of stashes) {
      const d = delta(s);
      if (!d) continue;
      events.push({ date, key: `s:${s.id}`, amount: d });
      if (own) events.push({ date, key: `r:${s.id}`, amount: d });
    }
  };
  const EPOCH = '0000-00-00';
  for (const p of confirmedPayments) {
    const plan = planById.get(p.planId);
    const date = p.date || EPOCH;
    pushAccount(date, paymentAccountDeltas(p, plan, stashes));
    pushStash(date, s => paymentStashDelta(p, plan, s), !p.foreign);
  }
  for (const tr of activeTransfers) {
    const date = tr.date || EPOCH;
    pushAccount(date, transferAccountDeltas(tr, stashes));
    pushStash(date, s => transferStashDelta(tr, s), !tr.foreign);
  }
  for (const o of pending) {
    const date = pendingEff(o);
    pushAccount(date, occurrenceAccountDeltas(o, stashes));
    pushStash(date, s => occurrenceStashDelta(o, s), true);
  }
  events.sort((a, b) => a.date.localeCompare(b.date));

  const running = new Map<string, number>();
  for (const a of accounts) running.set(a.id, a.startBalance || 0);
  for (const s of stashes) {
    running.set(`s:${s.id}`, s.startAmount || 0);
    running.set(`r:${s.id}`, s.isForeignOwned ? 0 : s.startAmount || 0);
  }
  let ev = 0;
  const advanceTo = (date: string) => {
    while (ev < events.length && events[ev].date <= date) {
      const e = events[ev++];
      running.set(e.key, (running.get(e.key) ?? 0) + e.amount);
    }
  };

  const findParty = (id?: string) => {
    if (!id) return undefined;
    const acc = accById.get(id);
    if (acc) return { name: acc.name, color: acc.color };
    const st = findStashByRef(id, stashes);
    if (st) return { name: `${st.emoji} ${st.name}`, color: undefined };
    return undefined;
  };
  const touchesVisibleAccount = (...ids: (string | undefined)[]) =>
    ids.some(id => Boolean(id) && (accById.has(id!) || accById.has(physicalAccountId(id, stashes) ?? '')));

  const confirmedByDate = new Map<string, Payment[]>();
  for (const p of confirmedPayments) pushTo(confirmedByDate, p.date, p);
  const transfersByDate = new Map<string, Transfer[]>();
  for (const tr of activeTransfers) if (tr.date) pushTo(transfersByDate, tr.date, tr);

  const result: DayCashflow[] = [];

  for (const date of dateList) {
    advanceTo(date);
    const isToday = date === t;
    const isPast = date < t;
    const isFuture = date > t;
    const dObj = parse(date);
    const dayLabel = `${String(dObj.getDate()).padStart(2, '0')}.${String(dObj.getMonth() + 1).padStart(2, '0')}`;
    const fullLabel = dObj.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

    const items: CashflowItem[] = [];

    // 1. Confirmed payments on this date (only this user's own; other members' are not cashflow)
    for (const p of confirmedByDate.get(date) ?? []) {
      const plan = planById.get(p.planId);
      const kind = p.kind ?? plan?.kind ?? 'expense';
      if (kind === 'transfer' || p.foreign) continue;
      const rawAcc = p.accountId || plan?.accountId;
      if (rawAcc && !touchesVisibleAccount(rawAcc)) continue;
      const catId = p.categoryId ?? plan?.categoryId;
      const cat = catId ? categories.find(c => c.id === catId) : undefined;
      const acc = accById.get(rawAcc ?? '') ?? accById.get(physicalAccountId(rawAcc, stashes) ?? '');
      const isCorrection = isBalanceCorrectionPayment(p);
      items.push({
        id: p.id,
        name: p.name || plan?.name || (kind === 'income' ? 'Income' : 'Expense'),
        amount: p.amount,
        currency: p.currency,
        amountInMain: convAt(p.amount, p.currency, mainCurrency, p.fx),
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

    // 2. Transfers on this date
    for (const tr of transfersByDate.get(date) ?? []) {
      if (tr.foreign || !touchesVisibleAccount(tr.fromAccountId, tr.toAccountId)) continue;
      const fromParty = findParty(tr.fromAccountId);
      const toParty = findParty(tr.toAccountId);
      items.push({
        id: tr.id,
        name: `Transfer (${fromParty?.name ?? 'Account'} → ${toParty?.name ?? 'Account'})`,
        amount: tr.fromAmount,
        currency: tr.fromCurrency,
        amountInMain: convAt(tr.fromAmount, tr.fromCurrency, mainCurrency, tr.fx),
        kind: 'transfer',
        status: 'confirmed',
        date,
        accountId: tr.fromAccountId,
        accountName: fromParty?.name,
        accountColor: fromParty?.color,
        emoji: '⇄',
      });
    }

    // 3. Pending scheduled occurrences expected on this (future) date
    if (isFuture) {
      for (const o of pendingByDate.get(date) ?? []) {
        const kind = o.kind ?? o.plan.kind ?? 'expense';
        if (kind === 'transfer') {
          if (!touchesVisibleAccount(o.accountId, o.toAccountId)) continue;
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
        const rawAcc = o.accountId || o.plan.accountId;
        if (rawAcc && !touchesVisibleAccount(rawAcc)) continue;
        const acc = accById.get(rawAcc ?? '') ?? accById.get(physicalAccountId(rawAcc, stashes) ?? '');
        const catId = o.categoryId || o.plan.categoryId;
        const cat = catId ? categories.find(c => c.id === catId) : undefined;
        const stashId = o.stashId ?? o.plan.stashId;
        items.push({
          id: o.key,
          name: o.name || o.plan.name,
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
          subcategory: o.subcategory ?? o.plan.subcategory,
          emoji: kind === 'saving' ? (stashes.find(s => s.id === stashId)?.emoji ?? '🌱') : cat?.emoji ?? (kind === 'income' ? '💰' : '💸'),
          isShared: o.isShared ?? o.plan.isShared,
        });
      }
    }

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

    // Stash balances and the amount each one reserves inside its housing account
    const stashDayBals: StashDayBalance[] = [];
    const stashAmountByAcc = new Map<string, number>();
    for (const s of stashes) {
      const bStash = running.get(`s:${s.id}`) ?? 0;
      const own = running.get(`r:${s.id}`) ?? 0;
      const reserved = isSharedStash(s) ? Math.max(0, Math.min(own, bStash)) : Math.max(0, bStash);
      const parentAcc = s.accountId ? accById.get(s.accountId) : undefined;
      if (parentAcc) {
        stashAmountByAcc.set(parentAcc.id, (stashAmountByAcc.get(parentAcc.id) ?? 0) + conv(reserved, s.currency, parentAcc.currency));
      }
      // With an account filter active, hide stashes housed in accounts that are filtered out
      if (s.accountId && !parentAcc) continue;
      stashDayBals.push({
        stashId: s.id,
        stashName: s.name,
        stashEmoji: s.emoji || '🌱',
        currency: s.currency,
        target: s.target,
        balanceOriginal: bStash,
        balanceInMain: convert(bStash, s.currency, mainCurrency),
        accountId: s.accountId,
        accountName: parentAcc?.name,
      });
    }

    const accountDayBals: AccountDayBalance[] = [];
    let cumulativePosY = 0;
    let cumulativeNegY = 0;
    for (const a of accounts) {
      const b = running.get(a.id) ?? 0;
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
      accountDayBals.push({
        accountId: a.id,
        accountName: a.name,
        accountColor: a.color || '#3B82F6',
        currency: a.currency,
        balanceOriginal: b,
        balanceInMain: balInMain,
        availableOriginal: b - stashedForAcc,
        availableInMain: balInMain - stashedInMain,
        stashedOriginal: stashedForAcc,
        stashedInMain,
        y0,
        y1,
      });
    }

    const totalBalance = accountDayBals.reduce((sum, ab) => sum + ab.balanceInMain, 0);
    const totalStashed = accountDayBals.reduce((sum, ab) => sum + ab.stashedInMain, 0);
    const lowestAccountBalance = accountDayBals.length > 0 ? Math.min(...accountDayBals.map(ab => ab.balanceInMain)) : 0;
    const lowestAvailableBalance = accountDayBals.length > 0 ? Math.min(...accountDayBals.map(ab => ab.availableInMain)) : 0;

    result.push({
      date,
      dayLabel,
      fullLabel,
      dayOfMonth: dObj.getDate(),
      weekdayIndex: dObj.getDay(),
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
      totalAvailable: totalBalance - totalStashed,
      totalStashed,
      stashedY0: Math.max(0, cumulativePosY - totalStashed),
      stashedY1: cumulativePosY,
      positiveTotalInMain: cumulativePosY,
      negativeTotalInMain: cumulativeNegY,
      lowestAccountBalance,
      lowestAvailableBalance,
    });
  }

  return result;
}
