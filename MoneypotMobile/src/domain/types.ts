// GENERATED from src/types.ts by scripts/sync-domain.mjs — do not edit here, edit src/types.ts and re-run.
// ---- Data model (Firestore: users/{uid}/{collection}/{id}) ----
// Personal documents live under users/{uid} and are readable/writable only by that user.
// Shared pots/stashes live in shared_items/{sharedId} (members only); records that touch a shared
// item are mirrored into shared_items/{sharedId}/payments|transfers. See sharedSync.ts.

export type Kind = 'income' | 'expense' | 'saving' | 'transfer';
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
  order?: number;
}

/** A "pot": a bucket of spending (or income / saving) */
export interface Category extends Owned {
  name: string;
  emoji: string;
  color: string;
  kind: Kind;
  hints?: string[];             // example sub-items shown to the user
  subcategories?: string[];     // user-defined subcategories for this pot
  sharedWith?: string[];        // emails of confirmed members (derived from the shared item)
  ownerEmail?: string;          // email of the creator
  sharedId?: string;            // id of shared_items/{sharedId} when this pot is shared
  isForeignOwned?: boolean;     // computed: shared by someone else (never stored)
  order?: number;
}

/** A recurring (or one-off) money movement the user expects */
export interface Plan extends Owned {
  name: string;                 // "Rent", "Salary", "Netflix", "Card Top-up"
  kind: Kind;
  categoryId?: string;          // optional for kind === 'transfer'
  subcategory?: string;         // e.g. "Groceries", "Flat rent"
  stashId?: string;             // for kind === 'saving'
  amount: number;
  currency: string;
  accountId?: string;           // source account ("From")
  toAccountId?: string;         // destination account ("To") for kind === 'transfer'
  toAmount?: number;            // destination amount (if multi-currency)
  toCurrency?: string;          // destination currency
  note?: string;                // what it entails, e.g. "electricity + water"
  isShared?: boolean;           // part of a shared pot or stash
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
  sharedWith?: string[];        // emails of confirmed members
  invitedEmails?: string[];     // pending invited emails
  ownerEmail?: string;          // email of the creator
  categoryId?: string;          // default pot for this stash (e.g. 'savings')
  subcategory?: string;         // default subcategory (e.g. stash name)
  isInstantAccess?: boolean;    // true = allows paying directly from this stash (default true for personal stashes)
  isShared?: boolean;           // part of a shared stash
  sharedId?: string;            // id of shared_items/{sharedId} when this stash is shared
  isForeignOwned?: boolean;     // computed: shared by someone else (never stored)
  order?: number;
}

/**
 * Invitation to join a shared pot or stash. Stored at invites/{sha256(code)} so it can only be
 * fetched by someone who knows the code. The plaintext code is never stored.
 */
export interface ShareInvite {
  id: string;                  // sha256 of the normalized code
  ownerId: string;             // uid of the inviter
  sharedId: string;            // shared_items/{sharedId}
  targetType: 'pot' | 'stash';
  targetName: string;
  targetEmoji: string;
  inviterEmail: string;
  inviterName?: string;
  inviteeEmail: string;        // lower-cased; '' = anyone holding the code
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: number;
  expiresAt: number;
  acceptedByEmail?: string;
  acceptedByUid?: string;
  acceptedAt?: number;
}

/** A member-visible shared pot or stash: shared_items/{id} */
export interface SharedItem {
  id: string;
  type: 'pot' | 'stash';
  ownerId: string;
  ownerEmail?: string;
  memberIds: string[];
  members: Record<string, { email?: string | null; name?: string | null }>;
  data: Record<string, unknown>;
  updatedAt?: number;
  joinInviteId?: string;
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
  toAccountId?: string;
  toAmount?: number;
  toCurrency?: string;
  name?: string;
  kind?: Kind;
  categoryId?: string;
  subcategory?: string;
  stashId?: string;
  note?: string;                // comment added when confirming / postponing
  isShared?: boolean;
  isCorrection?: boolean;
  contributorEmail?: string;
  contributorName?: string;
  contributorUid?: string;
  /** Exchange rates (units per 1 EUR) frozen when the record was made, so history never re-prices */
  fx?: Record<string, number>;
  foreign?: boolean;            // computed: recorded by another member of a shared item (never stored)
}

/** Money movement between two accounts (with currency exchange support) */
export interface Transfer extends Owned {
  date: string;               // YYYY-MM-DD
  fromAccountId: string;
  toAccountId: string;
  fromAmount: number;         // deducted from source account
  fromCurrency: string;
  toAmount: number;           // added to destination account
  toCurrency: string;
  note?: string;
  status: 'confirmed' | 'cancelled';
  createdAt?: number;
  planId?: string;
  dueDate?: string;
  isShared?: boolean;
  contributorEmail?: string;
  contributorName?: string;
  contributorUid?: string;
  /** Exchange rates (units per 1 EUR) frozen when the transfer was made */
  fx?: Record<string, number>;
  foreign?: boolean;          // computed: recorded by another member of a shared item (never stored)
}

export interface Settings {
  currency: string;
  theme?: 'light' | 'dark' | 'system';
}

/** A quick one-off payment template with pre-filled category, subcategory, account, amount and individual icon */
export interface QuickTemplate extends Owned {
  name: string;
  emoji: string;
  amount: number;
  currency: string;
  categoryId: string;
  subcategory?: string;
  accountId?: string;
  note?: string;
  kind?: Kind;
}

/** Computed, never stored */

export interface Occurrence {
  key: string;
  plan: Plan;
  dueDate: string;
  date: string;
  amount: number;
  currency: string;
  accountId?: string;
  toAccountId?: string;
  toAmount?: number;
  toCurrency?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  postponed: boolean;
  name: string;
  kind: Kind;
  categoryId: string;
  subcategory?: string;
  stashId?: string;
  note?: string;
  planNote?: string;
  isShared?: boolean;
  contributorEmail?: string;
  contributorName?: string;
  fx?: Record<string, number>;  // rates frozen on the confirmed payment, if any
}

