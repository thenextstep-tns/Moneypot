// ---- Data model (Firestore: users/{uid}/{collection}/{id}) ----
// Every document carries `ownerId` (= uid, injected by the store and enforced by security rules).

export type Kind = 'income' | 'expense' | 'saving';
export type Freq = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface Owned { id: string; ownerId?: string }

/** A place money lives: a bank card, Payoneer, cash, a savings account… */
export interface Account extends Owned {
  name: string;                 // "Revolut card"
  type: 'card' | 'bank' | 'cash' | 'wallet' | 'savings';
  institution?: string;         // "Revolut", "Payoneer"
  currency: string;             // ISO code, "EUR"
  startBalance: number;         // balance when added; live balance = start + confirmed flows
  color: string;
}

/** A "pot": a bucket of spending (or income / saving) */
export interface Category extends Owned {
  name: string;
  emoji: string;
  color: string;
  kind: Kind;
  hints?: string[];             // example sub-items shown to the user
}

/** A recurring (or one-off) money movement the user expects */
export interface Plan extends Owned {
  name: string;                 // "Rent", "Salary", "Netflix"
  kind: Kind;
  categoryId: string;
  stashId?: string;             // for kind === 'saving'
  amount: number;
  currency: string;
  accountId?: string;
  note?: string;                // what it entails, e.g. "electricity + water"
  // recurrence
  freq: Freq;
  every: number;                // every N days/weeks/months/years
  startDate: string;            // YYYY-MM-DD, anchor + first possible date
  endDate?: string;
  weekdays?: number[];          // weekly: 0=Sun..6=Sat (default: weekday of startDate)
  monthMode?: 'dates' | 'weekday';
  monthDays?: number[];         // monthly/dates: 1..31, -1 = last day (default: day of startDate)
  nth?: number;                 // monthly/weekday: 1..4, -1 = last
  nthWeekday?: number;          // monthly/weekday: 0..6
}

/** A savings goal */
export interface Stash extends Owned {
  name: string;
  emoji: string;
  target: number;
  currency: string;
  accountId?: string;           // where the money physically sits
  startAmount: number;
  deadline?: string;
}

/**
 * What actually happened to one occurrence of a plan. id = `${planId}_${dueDate}`.
 * Self-contained: snapshots name/kind/pot/stash so later plan edits or deletions never rewrite history.
 */
export interface Payment extends Owned {
  planId: string;
  dueDate: string;              // original scheduled date
  status: 'confirmed' | 'postponed' | 'cancelled';
  date: string;                 // actual date (confirmed) or new date (postponed)
  amount: number;
  currency: string;
  accountId?: string;
  name?: string;
  kind?: Kind;
  categoryId?: string;
  stashId?: string;
  note?: string;                // comment added when confirming / postponing
}

export interface Settings { currency: string }

/** Computed, never stored */
export interface Occurrence {
  key: string;
  plan: Plan;
  dueDate: string;
  date: string;
  amount: number;
  currency: string;
  accountId?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  postponed: boolean;
  name: string;
  kind: Kind;
  categoryId: string;
  stashId?: string;
  note?: string;
  planNote?: string;
}
