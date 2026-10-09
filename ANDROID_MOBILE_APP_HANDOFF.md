# 📱 Moneypot — Android Mobile App Handoff Specification

> **Version**: 1.0.0  
> **Target Platform**: Android (Phone & Tablet)  
> **Source Web Codebase**: `c:\Users\Lenovo\Documents\Budget` (React 18, TypeScript, Firebase Firestore, Vite)  
> **Primary Purpose**: Complete guide and technical blueprint for the next engineering session to build the native Android application for **Moneypot**.

---

## 1. Executive Summary & Vision

**Moneypot** is an intuitive, stress-free personal and shared budgeting app designed for people who don't want to deal with spreadsheets, accounting jargon, or complex double-entry bookkeeping.

### Core Philosophy:
1. **Zero Jargon**:
   - Categories = **Pots** 🫙
   - Savings Goals = **Stashes** 🐷
   - Recurring Incomes & Bills = **Plans** 🗓️
   - Financial Institutions & Wallets = **Accounts** 💳
   - Action Queue = **Today** ✅
   - History & Audit Trail = **Logbook** 📜
   - Trajectory & Projections = **Cashflow** 📈
2. **Virtual Schedule Engine (Zero Phantom Bloat)**:
   - Future occurrences are **never stored** in the database. They are dynamically projected in-memory on demand from recurrence rules.
   - A transaction record in `payments` is only created when the user explicitly acts on an occurrence (confirms, pays, or modifies it).
3. **Instant Access vs. Shared Stashes**:
   - **Personal Stashes**: Default to "Instant Access" (`isInstantAccess: true`), meaning they function as dedicated sub-accounts you can pay directly from without needing an assigned pot.
   - **Shared Stashes**: Dedicated partner/group savings goals (`isInstantAccess: false`). They require an associated pot, track individual contributor balances, and prevent direct spending so money is reserved.
4. **Net Wealth Neutrality for Transfers**:
   - Transfers between accounts move money between source and destination accounts without reducing net worth or creating false budget shortfalls.

---

## 2. Recommended Tech Stack for Android

### Recommended: **React Native with Expo (SDK 51+)**
- **Why**:
  1. **95% Code Reuse**: The existing core domain logic in this repository (`src/schedule.ts`, `src/balances.ts`, `src/cashflow.ts`, `src/types.ts`, `src/fx.ts`, `src/sharing.ts`, `src/defaults.ts`) is written in pure, dependency-free TypeScript. It can be copied directly into the mobile project with zero modifications.
  2. **Firebase Compatibility**: `@react-native-firebase` or the official Firebase JS SDK works seamlessly with Firestore real-time listeners (`onSnapshot`).
  3. **High-Performance UI**: React Native with React Navigation provides native 60/120fps bottom tabs, fluid bottom sheets (`@gorhom/bottom-sheet`), native SVG charts (`react-native-svg`), and haptic feedback.
  4. **Fast Prototyping & Builds**: Expo Application Services (EAS) generates Android APK/AAB builds in minutes without complex Gradle debugging.

*(Alternative: Flutter or Native Kotlin + Jetpack Compose. If chosen, the TypeScript models and math functions in section 4 must be translated into Dart or Kotlin).*

---

## 3. Core Domain Files Ready for Direct Porting

The following files in `src/` contain pure business logic with **no DOM dependencies**:

| File | Portability | Purpose |
|---|---|---|
| [`src/types.ts`](file:///c:/Users/Lenovo/Documents/Budget/src/types.ts) | **100% Direct Copy** | All TypeScript interfaces (`Account`, `Category`, `Plan`, `Stash`, `Payment`, `Transfer`, `ShareInvite`, `QuickTemplate`) |
| [`src/schedule.ts`](file:///c:/Users/Lenovo/Documents/Budget/src/schedule.ts) | **100% Direct Copy** | In-memory recurrence engine (`occurrences()`), date arithmetic (`addDays`, `shiftMonth`, `monthRange`), date formatting |
| [`src/balances.ts`](file:///c:/Users/Lenovo/Documents/Budget/src/balances.ts) | **100% Direct Copy** | Balance calculations (`calcAccountBalance`, `calcStashBalance`), future projections, shortfall warnings (`findAccountShortfalls`) |
| [`src/cashflow.ts`](file:///c:/Users/Lenovo/Documents/Budget/src/cashflow.ts) | **100% Direct Copy** | Day-by-day cashflow simulation, stacked chart series generation, stash day balances (`calculateCashflowRange`) |
| [`src/fx.ts`](file:///c:/Users/Lenovo/Documents/Budget/src/fx.ts) | **100% Direct Copy** | Live currency exchange rates caching and conversion engine |
| [`src/sharing.ts`](file:///c:/Users/Lenovo/Documents/Budget/src/sharing.ts) | **100% Direct Copy** | Masked code generator (`MP-XXXX-XX`), SHA-256 code hashing, email share draft builder |
| [`src/defaults.ts`](file:///c:/Users/Lenovo/Documents/Budget/src/defaults.ts) | **100% Direct Copy** | Initial seed data (default pots, default cash account, default quick templates, demo data) |
| [`src/emojis.tsx`](file:///c:/Users/Lenovo/Documents/Budget/src/emojis.tsx) | **95% Portable** | Curated emoji lists grouped by categories for pots and stashes |

---

## 4. Firestore Database Architecture

Every user's profile is isolated under `users/{uid}`.

### Collections Overview:

```text
users/{uid}/
  ├── accounts/        # Bank cards, cash, wallets, checking, savings
  ├── categories/      # Pots (budget categories)
  ├── plans/           # Scheduled and recurring plans (income, expense, saving, transfer)
  ├── stashes/         # Savings goals
  ├── payments/        # Confirmed transactions, adjustments, and overrides
  ├── transfers/       # Confirmed and scheduled transfers
  ├── invites/         # Share invitations created or received
  └── templates/       # Quick payment shortcut templates
```

### Root Collections (Cross-User):
1. **`shared_payments/{paymentId}`**:
   - Real-time bridge collection for joint pots and shared stashes.
   - When a payment has `isShared: true` (or links to a shared stash/category), it is written here.
   - Both collaborators listen to this collection to see real-time updates and logbook entries from each other.
2. **`invites/{codeKey}`**:
   - Look-up document keyed by normalized invite code (e.g. `MP849231`) so the invitee can claim it without knowing the inviter's user ID beforehand.

### Data Model Reference:

#### `Account`
```typescript
interface Account {
  id: string;
  name: string;               // e.g. "Revolut card", "Cash"
  type: 'card' | 'bank' | 'cash' | 'wallet' | 'savings';
  institution?: string;
  currency: string;           // ISO 4217, e.g. "EUR"
  startBalance: number;       // Balance at the moment of account creation
  color: string;              // Hex color code, e.g. "#3B82F6"
  ownerId?: string;
}
```

#### `Category` (Pots)
```typescript
interface Category {
  id: string;
  name: string;               // e.g. "Food", "Home & Bills"
  emoji: string;              // e.g. "🍏", "🏠"
  color: string;
  kind: 'income' | 'expense' | 'saving' | 'transfer';
  hints?: string[];           // Examples shown to user, e.g. ["Groceries", "Dining"]
  subcategories?: string[];
  sharedWith?: string[];      // Emails of confirmed collaborators
  ownerEmail?: string;
  ownerId?: string;
}
```

#### `Plan` (Recurring / One-Off Rules)
```typescript
interface Plan {
  id: string;
  name: string;               // e.g. "Rent", "Salary", "Netflix"
  kind: 'income' | 'expense' | 'saving' | 'transfer';
  categoryId?: string;        // Omitted for transfers
  subcategory?: string;
  stashId?: string;           // For kind === 'saving'
  amount: number;
  currency: string;
  accountId?: string;         // Source account ("From")
  toAccountId?: string;       // Destination account ("To") for transfers
  toAmount?: number;          // Multi-currency destination amount
  toCurrency?: string;
  note?: string;
  isShared?: boolean;
  freq: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  every: number;              // Repeat interval (every N days/weeks/months/years)
  startDate: string;          // YYYY-MM-DD
  endDate?: string;
  weekdays?: number[];        // Weekly: 0=Sun..6=Sat
  monthMode?: 'dates' | 'weekday';
  monthDays?: number[];       // Monthly: 1..31, -1 = last day
  nth?: number;               // Monthly/weekday: 1..4, -1 = last
  nthWeekday?: number;        // Monthly/weekday: 0..6
  ownerId?: string;
}
```

#### `Stash` (Savings Goals)
```typescript
interface Stash {
  id: string;
  name: string;               // e.g. "Emergency Fund", "New Laptop"
  emoji: string;              // e.g. "🌱", "💻"
  target: number;             // Goal amount (0 if no target)
  currency: string;
  accountId?: string;         // Where money physically sits on this device
  startAmount: number;        // Starter balance
  deadline?: string;          // Target completion date (YYYY-MM-DD)
  sharedWith?: string[];      // Emails of collaborators
  invitedEmails?: string[];
  ownerEmail?: string;
  ownerId?: string;
  categoryId?: string;        // Default pot for this stash (required for shared stashes)
  subcategory?: string;
  isInstantAccess?: boolean;  // true for personal stashes, false for shared stashes
}
```

#### `Payment` (Transaction Records & Overrides)
```typescript
interface Payment {
  id: string;                 // Often `${planId}_${dueDate}` or `p_${Date.now()}`
  planId?: string;
  name: string;
  amount: number;
  currency: string;
  date: string;               // YYYY-MM-DD
  status: 'confirmed' | 'pending' | 'cancelled';
  kind: 'income' | 'expense' | 'saving' | 'transfer';
  accountId?: string;         // Or "stash_{stashId}" if paid from instant access stash
  categoryId?: string;
  subcategory?: string;
  stashId?: string;
  note?: string;
  isShared?: boolean;
  contributorEmail?: string;
  contributorName?: string;
  ownerId?: string;
}
```

#### `Transfer` (One-off transfers between accounts)
```typescript
interface Transfer {
  id: string;
  fromAccountId: string;      // Can be account id or `stash_{id}`
  toAccountId: string;
  fromAmount: number;
  toAmount: number;
  fromCurrency: string;
  toCurrency: string;
  date: string;               // YYYY-MM-DD
  note?: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  planId?: string;
  ownerId?: string;
}
```

---

## 5. Key Business Logic Rules (Must Preserve)

### 1. Stash Balance Calculation & Initial Amount
- When creating a stash with a starter balance (`initialAmount > 0`), the app logs an initial confirmed payment `init_stash_${s.id}` with `kind: 'saving'`.
- `s.startAmount` on the stash document is stored as `0` to prevent double-counting.
- **Balance Corrections**: Editing an existing stash does not show a "Starter Balance" field. Instead, it features a **⚖️ Balance Correction** tool:
  - Takes the user's manual balance input.
  - Computes the delta (+ or -).
  - Logs an adjustment payment `adj_stash_${stash.id}_${Date.now()}` with category `"Balance correction"`.

### 2. Instant Access vs. Shared Stashes
- **Personal Stashes**: Always have `isInstantAccess: true`. Users can select the stash in the "From Account" dropdown (`accountId: "stash_${stash.id}"`) to pay for expenses directly.
- **Shared Stashes**: Always have `isInstantAccess: false`. They cannot be selected as a paying account. Instead, expenses are deducted from the stash by assigning the expense to the stash's associated pot (`categoryId: s.categoryId`).

### 3. Contributor Breakdown on Stashes
- Tracks net contributions per user:
  $$\text{Contribution} = \sum (\text{saving payments}) - \sum (\text{expenses paid out})$$
- If a stash has a live balance of `0 €` or if a contributor has net `0 €`, the breakdown pill is suppressed to avoid phantom contributor chips.

### 4. Transfer Logic & Net Wealth
- When calculating monthly starting balances (`calcMonthStartingBalances`) or checking shortfalls (`findAccountShortfalls`):
  - Planned transfers debit the source account (`accountId`) and credit the destination account (`toAccountId`).
  - Total liquid funds across all accounts remain unchanged.
  - In Pots summary, transfers are strictly excluded from "Going out" spending.

### 5. Shortfall Detection Simulation
- An account is only flagged with a **Low Balance Alert** if its simulated day-by-day running balance drops below `0 €` at any point during the month.
- Incoming transfers and scheduled incomes scheduled *before* a bill is due count toward covering it.

---

## 6. Mobile UX & Navigation Structure

On Android, use a **Bottom Navigation Bar** with the 7 core screens:

```text
[ ✅ Today ]  [ 🗓️ Plan ]  [ 🫙 Pots ]  [ 🐷 Stashes ]  [ 💳 Accounts ]  [ 📜 Logbook ]  [ 📈 Cashflow ]
```

*(Note: On smaller screens, consider placing the primary 4 or 5 tabs on the bar with a "More" drawer, or a horizontally scrolling compact bottom bar with active indicator).*

### Screen Specifications:

### 1. `Today` (Action Queue)
- **Top Bar**: Summary of items due today / overdue.
- **Queue Cards**: Each pending item shows emoji, name, account, due date, and amount.
- **Actions**:
  - Primary: **"Paid"** / Confirm button (opens confirmation bottom sheet).
  - Secondary: **"Later"** (postpone to tomorrow, next week, or custom date).
  - Tertiary: **"Skip"** (cancels this occurrence).
- **Quick Payment Floating Action Button / Template Bar**: 1-tap buttons to log frequent expenses (e.g., Coffee, Groceries).
- **Low Balance Warning**: If the paying account doesn't have enough liquid funds for this payment, display an inline amber warning card with a one-tap **"Move money"** transfer shortcut.

### 2. `Plan` (Recurring & Scheduled Movements)
- Filter chips: **All**, **Incomes**, **Bills & Expenses**, **Savings**, **Transfers**.
- Grouped list of active plans showing cadence (e.g. "Every month on the 1st", "Weekly on Mondays").
- Floating Action Button (+): Add new plan (income, expense, saving, or transfer).
- Plan editor bottom sheet includes recurrence frequency selector.

### 3. `Pots` (Monthly Budget Envelopes)
- Month selector header (`‹ October 2026 ›`, "Back to now").
- **Top KPI Cards Grid (4 cards)**:
  1. **In accounts now** / Projected starting balance
  2. **Coming in** (Received + Planned income)
  3. **Going out** (Paid + Left to pay, excluding internal transfers)
  4. **Month-end Outlook** ("Left over at end" or "Covered by balance" or "Projected shortfall")
- **Consecutive Projection Banner**: When browsing future months, alerts that starting balance factors in prior months' pending plans.
- **Pots Cards Grid**: Progress bar per pot showing paid amount, remaining budget, and share tags.

### 4. `Stashes` (Savings Goals)
- Header with Total Stashed balance.
- Stash cards displaying:
  - Emoji, name, target progress bar, saved amount, target, deadline.
  - Contributor chips (`👤 You: 150 €`, `👥 Partner: 100 €`).
  - Tags: `Instant Access` (for personal) or `Shared` (for joint).
- Actions per stash: Add money (+), Withdraw money (−), Edit / ⚖️ Balance Correction, Share.

### 5. `Accounts` (Liquid Wallets & Cards)
- List of connected accounts with colored avatars and live balances.
- Net liquid total banner.
- Actions per account:
  - Edit account details.
  - **⚖️ Balance Correction**: Enter actual bank balance -> calculates adjustment -> writes `adj_` payment.
- **"⇄ Transfer Money"** button: Opens quick transfer bottom sheet between any two accounts or instant access stashes.

### 6. `Logbook` (Audit Stream)
- Continuous historical feed of confirmed payments, transfers, and balance adjustments grouped by month and date.
- Search bar & filter pills (by Account, by Pot, by Stash).
- Inline badges for shared partner payments and balance corrections.

### 7. `Cashflow` (Trajectory & Interactive Calendar)
- Range toggle: **Month**, **Week**, **Date Range**.
- **Interactive SVG Chart**:
  - Stacked colored areas for liquid accounts.
  - Greyed-out hatched/striped layer for stashed reserved funds.
  - Scrubber/scrub cursor to pin or inspect any date.
- **Active Day Card**:
  - `Available Cash`, `Day Net Change`, `🔒 Stashed (Reserved)`.
  - **Account chips**: `🔵 Card: 102 €`, `🟢 Cash: 3 775 €`.
  - **Stash chips**: `🌱 Emergency Fund: 3 000 €`.
  - Transactions on this day.
- **Details Bottom Sheet**: Comprehensive breakdown of balances and transactions for the selected day.

---

## 7. Android Implementation Roadmap for Next Session

### Phase 1: Expo Project Setup & Core Logic Import (≈ 15 min)
1. Initialize Expo TypeScript template:
   ```bash
   npx create-expo-app@latest MoneypotMobile --template blank-typescript
   ```
2. Install dependencies:
   ```bash
   npx expo install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack
   npx expo install react-native-screens react-native-safe-area-context react-native-svg
   npx expo install firebase @react-native-async-storage/async-storage expo-haptics
   ```
3. Copy the domain logic directory from web:
   ```text
   src/types.ts       ->  MoneypotMobile/src/domain/types.ts
   src/schedule.ts    ->  MoneypotMobile/src/domain/schedule.ts
   src/balances.ts    ->  MoneypotMobile/src/domain/balances.ts
   src/cashflow.ts    ->  MoneypotMobile/src/domain/cashflow.ts
   src/fx.ts          ->  MoneypotMobile/src/domain/fx.ts
   src/sharing.ts     ->  MoneypotMobile/src/domain/sharing.ts
   src/defaults.ts    ->  MoneypotMobile/src/domain/defaults.ts
   ```

### Phase 2: Firebase Client & Data Context (≈ 20 min)
1. Configure Firebase in `src/services/firebase.ts` matching existing Firebase project credentials.
2. Port `src/store.tsx` into a React Context `DataProvider` or Zustand store:
   - Synchronize collections using Firestore `onSnapshot`.
   - Maintain `AsyncStorage` fallback for demo / offline mode.
   - Maintain the `shared_payments` listener for real-time partner sync.

### Phase 3: Navigation Shell & Screens (≈ 45 min)
1. Setup Bottom Tab Navigator with Android edge-to-edge styling and custom tab icons.
2. Build screens in order:
   - **TodayScreen** (queue cards, action sheet for pay/postpone/cancel).
   - **PotsScreen** (KPI strip, progress bars, category sheet).
   - **StashesScreen** (goals, balance correction modal, contributor breakdown).
   - **AccountsScreen** (cards, balance correction, quick transfer modal).
   - **PlansScreen** (scheduled recurring movements).
   - **LogbookScreen** (search, filters, historical flatlist).
   - **CashflowScreen** (touch-interactive chart with `react-native-svg`, day inspection sheet).

### Phase 4: Android Polish & Native Features (≈ 20 min)
1. Add `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` on button clicks ("Paid", "Confirm").
2. Support Android Back Button and Bottom Sheet dismissals.
3. Test Deep Links for invite codes (`moneypot://invite?code=MP-XXXX-XX`).
4. Generate release APK via `eas build -p android --profile preview`.

---

## 8. Verification & Test Checklist for the Android App

- [ ] **Offline / Demo Mode**: Can open app, toggle demo mode, and test all 7 tabs without logging in.
- [ ] **Google Sign-In**: Authenticates cleanly on Android and loads user's existing Firestore data.
- [ ] **Transfer Neutrality**: Planning a 400 € transfer between Payoneer and Cash updates account balances without decreasing total wealth or triggering a false 400 € shortfall in Pots.
- [ ] **Stash Instant Access**: Personal stashes appear in "From Account" dropdowns; shared stashes do not.
- [ ] **Stash Balance Correction**: Updating a stash's balance records an `adj_` payment in the Logbook and updates the live balance.
- [ ] **Cashflow Stash Layer**: The cashflow chart shows stashed funds stacked above liquid cash with distinct styling, and the day card displays stash chips alongside accounts.
- [ ] **Consecutive Month Projections**: Browsing into future months accurately rolls over end-of-month balances and pending items.

---
*Created on 2026-10-09 for Moneypot Android Engineering Handoff.*
