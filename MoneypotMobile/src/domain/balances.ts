// GENERATED from src/balances.ts by scripts/sync-domain.mjs — do not edit here, edit src/balances.ts and re-run.
import type { Account, Occurrence, Payment, Plan, Stash, Transfer } from './types';
import { convert, getFxInfo, getRate } from './fx';
import { OVERDUE_WINDOW_DAYS, addDays, monthRange, money, occurrences, shiftMonth, today } from './schedule';

/*
 * Balance engine.
 *
 * Every money movement is turned into "deltas" by exactly two functions:
 *   - accountDeltas*  → how a record changes the PHYSICAL balance of real accounts
 *   - stashDelta*     → how a record changes the balance of a stash (savings envelope)
 * All balances, projections, the cashflow chart and the month planner are built on these,
 * so the same record can never be counted differently on two screens.
 *
 * Rules:
 *   - A stash lives inside the account in `stash.accountId` ("housed"). Moving money between an
 *     account and a stash housed in that same account does not change the account's physical balance.
 *   - A saving payment moves money from its source account into the stash's housing account.
 *   - A stash that has no (valid) housing account is "unhoused": its money is counted separately
 *     in the liquid totals.
 *   - A reference to a stash that no longer exists is ignored for accounts (deleting a stash releases
 *     its money back to where it came from) — it is never credited to some other account.
 *   - Records added by other members of a shared item (`foreign`) never touch this user's accounts;
 *     they only change the shared stash's balance and the shared pot's spending.
 *   - Confirmed records dated in the future only take effect on their date.
 */

export type FxSnapshot = Record<string, number>;

/**
 * Convert with the rates frozen on a record when available (so past records never re-price),
 * otherwise with today's rates.
 */
export function convAt(amount: number, from: string | undefined, to: string | undefined, fx?: FxSnapshot): number {
  if (!from || !to || from === to) return amount;
  const rf = fx?.[from];
  const rt = fx?.[to];
  if (rf && rt) return (amount / rf) * rt;
  return convert(amount, from, to);
}

export const conv = (amount: number, from: string | undefined, to: string | undefined): number => convAt(amount, from, to);

/**
 * Rates (units per 1 EUR) for the given currencies, to freeze on a new record.
 * Returns undefined while only the built-in fallback rates are known.
 */
export function fxSnapshot(currencies: (string | undefined)[]): FxSnapshot | undefined {
  if (!getFxInfo().isLive) return undefined;
  const out: FxSnapshot = {};
  for (const c of new Set(currencies.filter((x): x is string => Boolean(x)))) {
    const r = getRate('EUR', c);
    if (Number.isFinite(r) && r > 0) out[c] = +r.toPrecision(10);
  }
  return Object.keys(out).length > 1 ? out : undefined;
}

/** Is this stash shared with other people? */
export function isSharedStash(s?: Partial<Stash> | null): boolean {
  return Boolean(s && (s.sharedId || s.isShared || (s.sharedWith?.length ?? 0) > 0 || s.isForeignOwned));
}

/** Currencies a record touches (its own, the accounts/stashes involved, and the main currency) */
export function recordCurrencies(
  r: Partial<Payment & Transfer>,
  accounts: Account[],
  stashes: Stash[],
  mainCurrency: string
): string[] {
  const out = [r.currency, r.fromCurrency, r.toCurrency, mainCurrency];
  for (const id of [r.accountId, r.fromAccountId, r.toAccountId]) {
    if (!id) continue;
    const s = findStashByRef(id, stashes);
    if (s) out.push(s.currency, accounts.find(a => a.id === s.accountId)?.currency);
    else out.push(accounts.find(a => a.id === id)?.currency);
  }
  if (r.stashId) {
    const s = stashes.find(x => x.id === r.stashId);
    out.push(s?.currency, accounts.find(a => a.id === s?.accountId)?.currency);
  }
  return out.filter((c): c is string => Boolean(c));
}

/** Add frozen exchange rates to a record (keeps rates that were already frozen) */
export function withFrozenRates<T extends Partial<Payment & Transfer>>(r: T, accounts: Account[], stashes: Stash[], mainCurrency: string): T {
  if (r.foreign) return r;
  const snap = fxSnapshot(recordCurrencies(r, accounts, stashes, mainCurrency));
  if (!snap) return r;
  return { ...r, fx: { ...snap, ...(r.fx ?? {}) } };
}

/** Normalize shared / instant-access flags. Shared stashes can never be instant-access. */
export function normalizeStash(st: Stash, currentUserId?: string | null): Stash {
  const isForeignOwned = Boolean(st.ownerId && currentUserId && currentUserId !== 'local' && st.ownerId !== currentUserId);
  const isShared = Boolean(
    st.sharedId || st.isShared || (st.sharedWith?.length ?? 0) > 0 || (st.invitedEmails?.length ?? 0) > 0 || isForeignOwned
  );
  return {
    ...st,
    isShared,
    isForeignOwned: isForeignOwned || undefined,
    // Respect the user's choice for personal stashes; default to instant access.
    isInstantAccess: isShared ? false : st.isInstantAccess !== false,
  };
}

/** Find the stash an id refers to (`stash_<id>` or a bare stash id). */
export function findStashByRef(id: string | undefined, stashes: Stash[]): Stash | undefined {
  if (!id) return undefined;
  if (id.startsWith('stash_')) {
    const sid = id.slice(6);
    return stashes.find(s => s.id === sid);
  }
  return stashes.find(s => s.id === id);
}

export const refersToStash = (id: string | undefined, s: Stash): boolean => Boolean(id) && (id === `stash_${s.id}` || id === s.id);

const isDanglingStashRef = (id: string | undefined, stashes: Stash[]) =>
  Boolean(id && id.startsWith('stash_') && !findStashByRef(id, stashes));

/** Physical account behind an account id or stash reference (undefined = no real account). */
export function physicalAccountId(id: string | undefined, stashes: Stash[] = []): string | undefined {
  if (!id) return undefined;
  const s = findStashByRef(id, stashes);
  if (s) return s.accountId || undefined;
  if (id.startsWith('stash_') || id.startsWith('ext:')) return undefined;
  return id;
}

/** @deprecated kept for older call sites — use physicalAccountId */
export function getPhysicalAccountId(id?: string, stashes: Stash[] = []): string | undefined {
  return physicalAccountId(id, stashes);
}

/** Is the stash housed in one of these accounts? */
export const isHoused = (s: Stash, accounts: Account[]) => Boolean(s.accountId && accounts.some(a => a.id === s.accountId));

// ---------------------------------------------------------------------------------------------
// Deltas
// ---------------------------------------------------------------------------------------------

export interface AccountDelta { accountId: string; amount: number; currency: string; fx?: FxSnapshot }

type PaymentLike = Pick<Payment, 'amount' | 'currency' | 'accountId' | 'stashId' | 'kind' | 'foreign' | 'fx'>;
type TransferLike = Pick<Transfer, 'fromAccountId' | 'toAccountId' | 'fromAmount' | 'fromCurrency' | 'toAmount' | 'toCurrency' | 'foreign' | 'fx'> & { status?: Transfer['status'] };

/** How a (non-transfer) payment changes physical account balances */
export function paymentAccountDeltas(p: PaymentLike, plan: Plan | undefined, stashes: Stash[]): AccountDelta[] {
  if (p.foreign) return [];
  const kind = p.kind ?? plan?.kind ?? 'expense';
  if (kind === 'transfer') return [];
  const stashId = p.stashId ?? plan?.stashId;
  const stash = stashId ? stashes.find(x => x.id === stashId) : undefined;
  const rawSource = p.accountId || plan?.accountId || stash?.accountId;
  if (isDanglingStashRef(rawSource, stashes)) return [];
  const src = physicalAccountId(rawSource, stashes);
  const amount = p.amount || 0;
  if (kind === 'income') return src ? [{ accountId: src, amount, currency: p.currency, fx: p.fx }] : [];
  if (kind === 'expense') return src ? [{ accountId: src, amount: -amount, currency: p.currency, fx: p.fx }] : [];
  // saving: money moves from the source account into the stash's housing account
  if (stashId && !stash) return []; // stash deleted → saving released back to the source
  const dest = stash?.accountId || undefined;
  if (src === dest) return [];
  const out: AccountDelta[] = [];
  if (src) out.push({ accountId: src, amount: -amount, currency: p.currency, fx: p.fx });
  if (dest) out.push({ accountId: dest, amount, currency: p.currency, fx: p.fx });
  return out;
}

/** How a transfer changes physical account balances */
export function transferAccountDeltas(t: TransferLike, stashes: Stash[]): AccountDelta[] {
  if (t.foreign || t.status === 'cancelled') return [];
  if (isDanglingStashRef(t.fromAccountId, stashes) || isDanglingStashRef(t.toAccountId, stashes)) return [];
  const from = physicalAccountId(t.fromAccountId, stashes);
  const to = physicalAccountId(t.toAccountId, stashes);
  if (from && from === to) return [];
  const out: AccountDelta[] = [];
  if (from) out.push({ accountId: from, amount: -(t.fromAmount || 0), currency: t.fromCurrency, fx: t.fx });
  if (to) out.push({ accountId: to, amount: t.toAmount || 0, currency: t.toCurrency, fx: t.fx });
  return out;
}

/** Treat a transfer-kind occurrence as a transfer */
export function occurrenceAsTransfer(o: Occurrence): TransferLike {
  const toCurrency = o.toCurrency ?? o.currency;
  return {
    fromAccountId: o.accountId || o.plan?.accountId || '',
    toAccountId: o.toAccountId || o.plan?.toAccountId || '',
    fromAmount: o.amount,
    fromCurrency: o.currency,
    toAmount: o.toAmount ?? conv(o.amount, o.currency, toCurrency),
    toCurrency,
  };
}

/** How an occurrence (pending plan instance) changes physical account balances */
export function occurrenceAccountDeltas(o: Occurrence, stashes: Stash[]): AccountDelta[] {
  const kind = o.kind ?? o.plan?.kind ?? 'expense';
  if (kind === 'transfer') return transferAccountDeltas(occurrenceAsTransfer(o), stashes);
  return paymentAccountDeltas(
    { amount: o.amount, currency: o.currency, accountId: o.accountId, stashId: o.stashId, kind, fx: o.fx },
    o.plan,
    stashes
  );
}

/** Change of a stash balance (in the stash's currency) caused by a payment */
export function paymentStashDelta(p: PaymentLike, plan: Plan | undefined, s: Stash): number {
  const kind = p.kind ?? plan?.kind ?? 'expense';
  if (kind === 'transfer') return 0;
  const isSavingIntoThis = kind === 'saving' && (p.stashId ?? plan?.stashId) === s.id;
  const isPaidFromThis = refersToStash(p.accountId, s);
  const amt = convAt(p.amount || 0, p.currency, s.currency, p.fx);
  // (a saving "from the stash into itself" is how an opening balance is recorded → it adds)
  if (isSavingIntoThis) return amt;
  if (isPaidFromThis) return kind === 'income' ? amt : -amt;
  return 0;
}

/** Change of a stash balance (in the stash's currency) caused by a transfer */
export function transferStashDelta(t: TransferLike, s: Stash): number {
  if (t.status === 'cancelled') return 0;
  let d = 0;
  if (refersToStash(t.toAccountId, s)) d += convAt(t.toAmount || 0, t.toCurrency, s.currency, t.fx);
  if (refersToStash(t.fromAccountId, s)) d -= convAt(t.fromAmount || 0, t.fromCurrency, s.currency, t.fx);
  return d;
}

export function occurrenceStashDelta(o: Occurrence, s: Stash): number {
  const kind = o.kind ?? o.plan?.kind ?? 'expense';
  if (kind === 'transfer') return transferStashDelta(occurrenceAsTransfer(o), s);
  return paymentStashDelta({ amount: o.amount, currency: o.currency, accountId: o.accountId, stashId: o.stashId, kind, fx: o.fx }, o.plan, s);
}

const planIndex = (plans: Plan[]) => new Map(plans.map(p => [p.id, p]));
const effective = (date: string | undefined, asOf: string) => !date || date <= asOf;

// ---------------------------------------------------------------------------------------------
// Live balances
// ---------------------------------------------------------------------------------------------

/** Physical balance of an account as of `asOf` (default: today) */
export function calcAccountBalance(
  a: Account,
  payments: Payment[],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  stashes: Stash[] = [],
  asOf: string = today()
): number {
  let b = a.startBalance || 0;
  const byId = planIndex(plans);
  for (const p of payments) {
    if (p.status !== 'confirmed' || !effective(p.date, asOf)) continue;
    for (const d of paymentAccountDeltas(p, byId.get(p.planId), stashes)) {
      if (d.accountId === a.id) b += convAt(d.amount, d.currency, a.currency, d.fx);
    }
  }
  for (const t of transfers) {
    if (!effective(t.date, asOf)) continue;
    for (const d of transferAccountDeltas(t, stashes)) {
      if (d.accountId === a.id) b += convAt(d.amount, d.currency, a.currency, d.fx);
    }
  }
  return b;
}

function stashBalanceInternal(s: Stash, payments: Payment[], transfers: Transfer[], plans: Plan[], asOf: string, ownOnly: boolean): number {
  let b = ownOnly && s.isForeignOwned ? 0 : s.startAmount || 0;
  const byId = planIndex(plans);
  for (const p of payments) {
    if (p.status !== 'confirmed' || !effective(p.date, asOf)) continue;
    if (ownOnly && p.foreign) continue;
    b += paymentStashDelta(p, byId.get(p.planId), s);
  }
  for (const t of transfers) {
    if (!effective(t.date, asOf)) continue;
    if (ownOnly && t.foreign) continue;
    b += transferStashDelta(t, s);
  }
  return b;
}

/** Balance of a stash (all members' contributions for shared stashes) */
export function calcStashBalance(
  s: Stash,
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  asOf: string = today()
): number {
  return stashBalanceInternal(s, payments, transfers, plans, asOf, false);
}

/** This user's own share of a stash (equals the full balance for personal stashes) */
export function calcStashOwnBalance(
  s: Stash,
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  asOf: string = today()
): number {
  if (!isSharedStash(s)) return calcStashBalance(s, payments, transfers, plans, asOf);
  return stashBalanceInternal(s, payments, transfers, plans, asOf, true);
}

/**
 * Money reserved for a stash inside this user's accounts (in stash currency).
 * Personal stash: its balance. Shared stash: only this user's contributions, capped by the stash balance.
 */
export function calcStashReserved(
  s: Stash,
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  asOf: string = today()
): number {
  const total = calcStashBalance(s, payments, transfers, plans, asOf);
  if (!isSharedStash(s)) return Math.max(0, total);
  const own = stashBalanceInternal(s, payments, transfers, plans, asOf, true);
  return Math.max(0, Math.min(own, total));
}

export interface StashContribution {
  key: string;
  label: string;
  amount: number; // in stash currency
  isMe: boolean;
}

/**
 * Who put how much into a stash (net of withdrawals), one line per person.
 * The stash balance is everyone's money; each person's line is their own contribution.
 */
export function calcStashContributions(
  s: Stash,
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  asOf: string = today()
): StashContribution[] {
  const byKey = new Map<string, StashContribution>();
  const add = (key: string, label: string, isMe: boolean, amount: number) => {
    if (!amount) return;
    const cur = byKey.get(key) ?? { key, label, amount: 0, isMe };
    cur.amount += amount;
    byKey.set(key, cur);
  };
  const who = (r: Pick<Payment, 'foreign' | 'contributorUid' | 'contributorEmail' | 'contributorName'>) =>
    r.foreign
      ? {
          key: (r.contributorEmail?.trim().toLowerCase() || r.contributorUid || 'other'),
          label: r.contributorName || r.contributorEmail?.split('@')[0] || 'Partner',
          isMe: false,
        }
      : { key: 'me', label: 'You', isMe: true };

  if (s.startAmount) {
    if (s.isForeignOwned) {
      add(s.ownerEmail?.trim().toLowerCase() || s.ownerId || 'owner', s.ownerEmail?.split('@')[0] || 'Owner', false, s.startAmount);
    } else {
      add('me', 'You', true, s.startAmount);
    }
  }
  const byId = planIndex(plans);
  for (const p of payments) {
    if (p.status !== 'confirmed' || !effective(p.date, asOf)) continue;
    const d = paymentStashDelta(p, byId.get(p.planId), s);
    if (d) { const w = who(p); add(w.key, w.label, w.isMe, d); }
  }
  for (const t of transfers) {
    if (!effective(t.date, asOf)) continue;
    const d = transferStashDelta(t, s);
    if (d) { const w = who(t); add(w.key, w.label, w.isMe, d); }
  }
  return [...byKey.values()].filter(c => Math.abs(c.amount) > 0.005).sort((a, b) => Number(b.isMe) - Number(a.isMe) || b.amount - a.amount);
}

/** Number of people a pot/stash is shared with (you included); 0 if it isn't shared */
export function sharedMemberCount(item: { sharedWith?: string[]; isShared?: boolean; sharedId?: string }): number {
  const emails = new Set((item.sharedWith ?? []).map(e => e.trim().toLowerCase()).filter(Boolean));
  return emails.size;
}

/** Breakdown of stashed funds inside an account: personal vs shared (in account currency) */
export function calcAccountStashedBreakdown(
  a: Account,
  stashes: Stash[],
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  _allAccounts: Account[] = []
): { total: number; personal: number; shared: number } {
  let personal = 0;
  let shared = 0;
  for (const s of stashes) {
    if (s.accountId !== a.id) continue;
    const reserved = conv(calcStashReserved(s, payments, transfers, plans), s.currency, a.currency);
    if (isSharedStash(s)) shared += reserved;
    else personal += reserved;
  }
  return { total: personal + shared, personal, shared };
}

/** Total stashed / reserved funds sitting inside an account */
export function calcAccountStashedBalance(
  a: Account,
  stashes: Stash[],
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  allAccounts: Account[] = []
): number {
  return calcAccountStashedBreakdown(a, stashes, payments, transfers, plans, allAccounts).total;
}

/** Free / available spending balance of an account (may be negative when overdrawn) */
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
  return total - stashed;
}

export const reservedKey = (stashId: string) => `reserved:${stashId}`;

/**
 * Map of balances keyed by account id, stash id, `stash_<id>`, and `reserved:<stashId>`
 * (the part of a stash reserved inside this user's housing account, in stash currency).
 */
export function calcAllAccountBalances(
  accounts: Account[],
  payments: Payment[],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  stashes: Stash[] = [],
  asOf: string = today()
): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of accounts) map.set(a.id, calcAccountBalance(a, payments, transfers, plans, stashes, asOf));
  for (const s of stashes) {
    const sBal = calcStashBalance(s, payments, transfers, plans, asOf);
    map.set(s.id, sBal);
    map.set(`stash_${s.id}`, sBal);
    map.set(reservedKey(s.id), calcStashReserved(s, payments, transfers, plans, asOf));
  }
  return map;
}

// ---------------------------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------------------------

export interface ProjectedBalanceResult {
  current: number;
  projected: number;
  isFuture: boolean;
  targetDate: string;
}

/**
 * Pending plan occurrences that projections assume will still happen: everything unconfirmed from
 * OVERDUE_WINDOW_DAYS ago (overdue items are assumed to be paid next) up to `targetDate`.
 */
export function pendingForProjection(plans: Plan[], payments: Payment[], todayDate: string, targetDate: string): Occurrence[] {
  if (targetDate < todayDate) return [];
  return occurrences(plans, payments, addDays(todayDate, -OVERDUE_WINDOW_DAYS), targetDate).filter(o => o.status === 'pending');
}

/** Current and projected physical balance of an account on `targetDate` */
export function calcProjectedAccountBalance(
  account: Account,
  targetDate: string,
  payments: Payment[],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  stashes: Stash[] = [],
  todayDate: string = today()
): ProjectedBalanceResult {
  const current = calcAccountBalance(account, payments, transfers, plans, stashes, todayDate);
  if (!targetDate || targetDate <= todayDate) {
    return { current, projected: current, isFuture: false, targetDate: targetDate || todayDate };
  }
  let projected = current;
  const add = (ds: AccountDelta[]) => {
    for (const d of ds) if (d.accountId === account.id) projected += convAt(d.amount, d.currency, account.currency, d.fx);
  };
  for (const o of pendingForProjection(plans, payments, todayDate, targetDate)) add(occurrenceAccountDeltas(o, stashes));
  const byId = planIndex(plans);
  for (const p of payments) {
    if (p.status === 'confirmed' && p.date > todayDate && p.date <= targetDate) add(paymentAccountDeltas(p, byId.get(p.planId), stashes));
  }
  for (const t of transfers) {
    if (t.date && t.date > todayDate && t.date <= targetDate) add(transferAccountDeltas(t, stashes));
  }
  return { current, projected, isFuture: true, targetDate };
}

/** Current and projected balance of a stash on `targetDate` */
export function calcProjectedStashBalance(
  s: Stash,
  targetDate: string,
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  todayDate: string = today()
): ProjectedBalanceResult {
  const current = calcStashBalance(s, payments, transfers, plans, todayDate);
  if (!targetDate || targetDate <= todayDate) {
    return { current, projected: current, isFuture: false, targetDate: targetDate || todayDate };
  }
  let projected = current;
  for (const o of pendingForProjection(plans, payments, todayDate, targetDate)) projected += occurrenceStashDelta(o, s);
  const byId = planIndex(plans);
  for (const p of payments) {
    if (p.status === 'confirmed' && p.date > todayDate && p.date <= targetDate) projected += paymentStashDelta(p, byId.get(p.planId), s);
  }
  for (const t of transfers) {
    if (t.date && t.date > todayDate && t.date <= targetDate) projected += transferStashDelta(t, s);
  }
  return { current, projected, isFuture: true, targetDate };
}

/** Map of accountId (and stash id / stash_ id) → { current, projected } on targetDate */
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

// ---------------------------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------------------------

/** Total liquid money of this user: all accounts + this user's share of unhoused stashes */
export function calcTotalLiquidBalance(
  accounts: Account[],
  payments: Payment[],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  stashes: Stash[] = [],
  targetCurrency = 'EUR'
): number {
  let sum = 0;
  for (const a of accounts) sum += convert(calcAccountBalance(a, payments, transfers, plans, stashes), a.currency, targetCurrency);
  for (const s of stashes) {
    if (isHoused(s, accounts)) continue;
    sum += convert(calcStashReserved(s, payments, transfers, plans), s.currency || targetCurrency, targetCurrency);
  }
  return sum;
}

/** Breakdown of total stashed funds: total, personal, shared (in target currency) */
export function calcTotalStashedBreakdown(
  accounts: Account[],
  stashes: Stash[],
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  targetCurrency = 'EUR'
): { total: number; personal: number; shared: number } {
  let personal = 0;
  let shared = 0;
  for (const s of stashes) {
    const reserved = convert(calcStashReserved(s, payments, transfers, plans), s.currency || targetCurrency, targetCurrency);
    if (isSharedStash(s)) shared += reserved;
    else personal += reserved;
  }
  return { total: personal + shared, personal, shared };
}

/** Formats stashed breakdown: "50 € in stashes: 30 € in personal, 👥 20 € in shared" */
export function formatStashedBreakdown(
  totalStashed: number,
  personalStashed: number,
  sharedStashed: number,
  currency: string
): string {
  if (totalStashed <= 0) return '';
  if (sharedStashed > 0 && personalStashed > 0) {
    return `🔒 ${money(totalStashed, currency)} in stashes: ${money(personalStashed, currency)} in personal, 👥 ${money(sharedStashed, currency)} in shared`;
  }
  if (sharedStashed > 0) {
    return `🔒 ${money(totalStashed, currency)} in stashes: 👥 ${money(sharedStashed, currency)} in shared`;
  }
  return `🔒 ${money(totalStashed, currency)} in stashes`;
}

export function calcTotalStashedBalance(
  accounts: Account[],
  stashes: Stash[],
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  targetCurrency = 'EUR'
): number {
  return calcTotalStashedBreakdown(accounts, stashes, payments, transfers, plans, targetCurrency).total;
}

/** Free money across all accounts (may be negative) */
export function calcTotalAvailableBalance(
  accounts: Account[],
  stashes: Stash[],
  payments: Payment[] = [],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  targetCurrency = 'EUR'
): number {
  return (
    calcTotalLiquidBalance(accounts, payments, transfers, plans, stashes, targetCurrency) -
    calcTotalStashedBalance(accounts, stashes, payments, transfers, plans, targetCurrency)
  );
}

// ---------------------------------------------------------------------------------------------
// Funds checks
// ---------------------------------------------------------------------------------------------

export interface CheckAccountFundsResult {
  hasAccount: boolean;
  accountName?: string;
  balance?: number; // Free spending balance if account, stash balance if stash
  totalBalance?: number;
  stashedBalance?: number;
  stashesInAccount?: Stash[];
  accountCurrency?: string;
  neededInAccCur: number;
  isShort: boolean;
  shortBy: number;
}

/** Reserved amount of stash `s` (in stash currency), read from a calcAllAccountBalances map */
function reservedFromMap(s: Stash, balances: Map<string, number>): number {
  return Math.max(0, balances.get(reservedKey(s.id)) ?? balances.get(`stash_${s.id}`) ?? balances.get(s.id) ?? 0);
}

/**
 * Money reserved in stashes inside account `a` (in the account's currency), from a calcAllAccountBalances map.
 * Every screen that shows "free" vs "reserved" must use this so they always agree. For shared stashes only
 * this user's own share is reserved.
 */
export function calcAccountReservedFromMap(a: Account, stashes: Stash[], balances: Map<string, number>): number {
  let reserved = 0;
  for (const s of stashes) {
    if (s.accountId === a.id) reserved += conv(reservedFromMap(s, balances), s.currency, a.currency);
  }
  return reserved;
}

/** Check if an account or stash has enough free money for a payment */
export function checkAccountFunds(
  accountId: string | undefined,
  amount: number,
  currency: string,
  accounts: Account[],
  balances: Map<string, number>,
  stashes: Stash[] = []
): CheckAccountFundsResult {
  if (!accountId) return { hasAccount: false, neededInAccCur: amount, isShort: false, shortBy: 0 };

  const stash = findStashByRef(accountId, stashes);
  if (stash) {
    const bal = balances.get(`stash_${stash.id}`) ?? balances.get(stash.id) ?? stash.startAmount ?? 0;
    const neededInAccCur = conv(amount, currency, stash.currency);
    return {
      hasAccount: true,
      accountName: `${stash.emoji} ${stash.name} (Stash)`,
      balance: bal,
      totalBalance: bal,
      stashedBalance: 0,
      accountCurrency: stash.currency,
      neededInAccCur,
      isShort: bal < neededInAccCur,
      shortBy: Math.max(0, neededInAccCur - bal),
    };
  }

  const acc = accounts.find(a => a.id === accountId);
  if (!acc) return { hasAccount: false, neededInAccCur: amount, isShort: false, shortBy: 0 };
  const totalBal = balances.get(acc.id) ?? 0;
  const stashedBal = calcAccountReservedFromMap(acc, stashes, balances);
  const stashesInAcc = stashes.filter(s => s.accountId === acc.id && reservedFromMap(s, balances) > 0);
  const freeBal = totalBal - stashedBal;
  const neededInAccCur = conv(amount, currency, acc.currency);
  return {
    hasAccount: true,
    accountName: acc.name,
    balance: freeBal,
    totalBalance: totalBal,
    stashedBalance: stashedBal,
    stashesInAccount: stashesInAcc,
    accountCurrency: acc.currency,
    neededInAccCur,
    isShort: freeBal < neededInAccCur,
    shortBy: Math.max(0, neededInAccCur - freeBal),
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

/** Accounts whose free balance dips below zero while paying the given pending items */
export function findAccountShortfalls(
  accounts: Account[],
  occs: Occurrence[],
  balances: Map<string, number>,
  stashes: Stash[] = [],
  transfers: Transfer[] = [],
  ym?: string
): AccountShortfallWarning[] {
  const warnings: AccountShortfallWarning[] = [];
  const pending = occs.filter(o => o.status === 'pending');
  const todayStr = today();

  for (const a of accounts) {
    const totalBal = balances.get(a.id) ?? 0;
    const stashedInAcc = calcAccountReservedFromMap(a, stashes, balances);
    // Not clamped: an already-overdrawn account must report the full shortfall.
    const bal = totalBal - stashedInAcc;
    let outSum = 0;
    let inSum = 0;
    const deltaByDate = new Map<string, number>();
    const addDelta = (date: string, d: number) => deltaByDate.set(date, (deltaByDate.get(date) ?? 0) + d);

    for (const o of pending) {
      // Overdue items are assumed to be paid now
      const effDate = (o.date || o.dueDate) < todayStr ? todayStr : o.date || o.dueDate;
      const source = o.accountId || o.plan?.accountId;
      const isSource = source === a.id;
      const isTransferTarget = o.kind === 'transfer' && (o.toAccountId || o.plan?.toAccountId) === a.id;
      if (isSource && isTransferTarget) continue;
      if (isSource) {
        const amt = conv(o.amount, o.currency, a.currency);
        if (o.kind === 'income') { inSum += amt; addDelta(effDate, amt); }
        else { outSum += amt; addDelta(effDate, -amt); }
      } else if (isTransferTarget) {
        const t = occurrenceAsTransfer(o);
        const amt = conv(t.toAmount, t.toCurrency, a.currency);
        inSum += amt;
        addDelta(effDate, amt);
      }
    }

    for (const tr of transfers) {
      if (tr.status === 'cancelled' || tr.foreign) continue;
      if (!tr.date || tr.date <= todayStr) continue;
      if (ym && !tr.date.startsWith(ym)) continue;
      const isSource = tr.fromAccountId === a.id;
      const isTarget = tr.toAccountId === a.id;
      if (isSource && isTarget) continue;
      if (isSource) {
        const amt = convAt(tr.fromAmount, tr.fromCurrency, a.currency, tr.fx);
        outSum += amt;
        addDelta(tr.date, -amt);
      } else if (isTarget) {
        const amt = convAt(tr.toAmount, tr.toCurrency, a.currency, tr.fx);
        inSum += amt;
        addDelta(tr.date, amt);
      }
    }

    let running = bal;
    let lowest = bal;
    for (const date of [...deltaByDate.keys()].sort()) {
      running += deltaByDate.get(date) ?? 0;
      if (running < lowest) lowest = running;
    }

    if (lowest < -0.005) {
      warnings.push({
        accountId: a.id,
        accountName: a.name,
        accountCurrency: a.currency,
        currentBalance: bal,
        scheduledOutgoing: outSum,
        scheduledIncoming: inSum,
        projectedBalance: bal + inSum - outSum,
        shortBy: -lowest,
      });
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------------------------
// Month planner
// ---------------------------------------------------------------------------------------------

export interface MonthBalanceProjection {
  accountBalances: Map<string, number>;
  totalLiquid: number;
  totalStashed: number;
  totalAvailable: number;
}

/**
 * Balances at the start of month `targetYm`:
 * - current month: live balances today
 * - future months: today's balances + everything expected before the 1st (pending items within the
 *   overdue window, future-dated confirmed records)
 * - past months: balances at the end of the previous month
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

  if (targetYm < curYm) {
    const asOf = addDays(`${targetYm}-01`, -1);
    const accountBalances = calcAllAccountBalances(accounts, payments, transfers, plans, stashes, asOf);
    return summarize(accounts, stashes, accountBalances, targetCurrency);
  }

  const live = calcAllAccountBalances(accounts, payments, transfers, plans, stashes, todayDate);
  if (targetYm === curYm) return summarize(accounts, stashes, live, targetCurrency);

  // Future month
  const toDate = monthRange(shiftMonth(targetYm, -1))[1];
  const bals = new Map(live);
  const applyAcc = (ds: AccountDelta[]) => {
    for (const d of ds) {
      const acc = accounts.find(a => a.id === d.accountId);
      if (acc) bals.set(acc.id, (bals.get(acc.id) ?? 0) + convAt(d.amount, d.currency, acc.currency, d.fx));
    }
  };
  // Pending items are always this user's own plans, so they also change the user's own share.
  const applyStash = (delta: (s: Stash) => number) => {
    for (const s of stashes) {
      const d = delta(s);
      if (!d) continue;
      bals.set(s.id, (bals.get(s.id) ?? 0) + d);
      bals.set(`stash_${s.id}`, bals.get(s.id)!);
      bals.set(reservedKey(s.id), Math.max(0, (bals.get(reservedKey(s.id)) ?? 0) + d));
    }
  };

  for (const o of pendingForProjection(plans, payments, todayDate, toDate)) {
    applyAcc(occurrenceAccountDeltas(o, stashes));
    applyStash(s => occurrenceStashDelta(o, s));
  }
  const byId = planIndex(plans);
  for (const p of payments) {
    if (p.status !== 'confirmed' || !(p.date > todayDate && p.date <= toDate)) continue;
    applyAcc(paymentAccountDeltas(p, byId.get(p.planId), stashes));
    applyStash(s => paymentStashDelta(p, byId.get(p.planId), s));
  }
  for (const t of transfers) {
    if (!t.date || !(t.date > todayDate && t.date <= toDate)) continue;
    applyAcc(transferAccountDeltas(t, stashes));
    applyStash(s => transferStashDelta(t, s));
  }
  // Keep reserved within the stash balance
  for (const s of stashes) {
    bals.set(reservedKey(s.id), Math.max(0, Math.min(bals.get(reservedKey(s.id)) ?? 0, Math.max(0, bals.get(s.id) ?? 0))));
  }
  return summarize(accounts, stashes, bals, targetCurrency);
}

function summarize(accounts: Account[], stashes: Stash[], bals: Map<string, number>, targetCurrency: string): MonthBalanceProjection {
  let totalLiquid = 0;
  let totalStashed = 0;
  for (const a of accounts) totalLiquid += convert(bals.get(a.id) ?? 0, a.currency, targetCurrency);
  for (const s of stashes) {
    const reserved = convert(bals.get(reservedKey(s.id)) ?? 0, s.currency || targetCurrency, targetCurrency);
    totalStashed += reserved;
    if (!isHoused(s, accounts)) totalLiquid += reserved;
  }
  return { accountBalances: bals, totalLiquid, totalStashed, totalAvailable: totalLiquid - totalStashed };
}
