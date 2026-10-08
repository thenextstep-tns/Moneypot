import type { Account, Category, Plan, Stash } from './types';
import { shiftMonth, thisMonth } from './schedule';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'home', name: 'Home & Bills', emoji: '🏠', color: '#6C8EF5', kind: 'expense', hints: ['Rent', 'Utilities', 'Phone & internet', 'Household stuff', 'Insurance'] },
  { id: 'food', name: 'Food', emoji: '🍎', color: '#F2885B', kind: 'expense', hints: ['Groceries', 'Eating out', 'Delivery', 'Snacks & treats', 'Pet food'] },
  { id: 'transport', name: 'Getting around', emoji: '🚌', color: '#3FB5A6', kind: 'expense', hints: ['Public transport', 'Fuel', 'Taxi', 'Car'] },
  { id: 'health', name: 'Health & Care', emoji: '💊', color: '#E5739A', kind: 'expense', hints: ['Pharmacy', 'Doctor', 'Sport', 'Personal care'] },
  { id: 'subs', name: 'Subscriptions', emoji: '📺', color: '#9B7BEA', kind: 'expense', hints: ['Streaming', 'Music', 'Cloud storage', 'Apps'] },
  { id: 'fun', name: 'Fun & Treats', emoji: '🎉', color: '#EDB536', kind: 'expense', hints: ['Hobbies', 'Going out', 'Clothes', 'Gifts'] },
  { id: 'travel', name: 'Travel', emoji: '✈️', color: '#4FA3E0', kind: 'expense', hints: ['Tickets', 'Stays', 'Travel cash'] },
  { id: 'learning', name: 'Learning', emoji: '📚', color: '#78B159', kind: 'expense', hints: ['Courses', 'Books'] },
  { id: 'other', name: 'Other', emoji: '📦', color: '#9AA0A6', kind: 'expense' },
  { id: 'savings', name: 'Savings', emoji: '🌱', color: '#2FA36B', kind: 'saving', hints: ['Safety cushion', 'Investing', 'Big purchase'] },
  { id: 'salary', name: 'Salary', emoji: '💼', color: '#2E9E6B', kind: 'income' },
  { id: 'extra', name: 'Extra income', emoji: '🧩', color: '#43B581', kind: 'income', hints: ['Freelance', 'Dividends', 'Gifts', 'Rent received'] },
];

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'cash', name: 'Cash', type: 'cash', currency: 'EUR', startBalance: 0, color: '#78B159' },
];

// ---- Demo data (local mode only) ----
const m = shiftMonth(thisMonth(), -1);
const P = (id: string, name: string, kind: Plan['kind'], categoryId: string, amount: number, freq: Plan['freq'], day: string, accountId = 'card', extra: Partial<Plan> = {}): Plan =>
  ({ id, name, kind, categoryId, amount, currency: 'EUR', freq, every: 1, startDate: `${m}-${day}`, accountId, ...extra });

export const DEMO = {
  accounts: [
    ...DEFAULT_ACCOUNTS,
    { id: 'card', name: 'Main card', type: 'card', institution: 'Revolut', currency: 'EUR', startBalance: 1200, color: '#6C8EF5' },
    { id: 'payoneer', name: 'Payoneer', type: 'wallet', institution: 'Payoneer', currency: 'USD', startBalance: 300, color: '#F2885B' },
    { id: 'savings', name: 'Savings account', type: 'savings', institution: 'Raiffeisen', currency: 'EUR', startBalance: 500, color: '#2FA36B' },
  ] as Account[],
  stashes: [
    { id: 'cushion', name: 'Safety cushion', emoji: '🛟', target: 3000, currency: 'EUR', accountId: 'savings', startAmount: 500 },
    { id: 'holiday', name: 'Summer holiday', emoji: '🏖️', target: 1200, currency: 'EUR', accountId: 'savings', startAmount: 0 },
  ] as Stash[],
  plans: [
    P('salary', 'Salary', 'income', 'salary', 2600, 'monthly', '01'),
    P('rent', 'Rent', 'expense', 'home', 850, 'monthly', '05', 'card', { note: 'Flat + building maintenance' }),
    P('phone', 'Phone', 'expense', 'home', 15, 'monthly', '12'),
    P('cleaner', 'Cleaner', 'expense', 'home', 40, 'monthly', '01', 'cash', { monthMode: 'weekday', nth: 1, nthWeekday: 1, note: 'First Monday of the month' }),
    P('groceries', 'Groceries', 'expense', 'food', 35, 'weekly', '01', 'card', { weekdays: [1, 4] }),
    P('lunch', 'Lunch at work', 'expense', 'food', 9, 'weekly', '01', 'card', { weekdays: [1, 2, 3, 4, 5] }),
    P('eatout', 'Eating out', 'expense', 'food', 30, 'weekly', '06'),
    P('bus', 'Bus pass', 'expense', 'transport', 40, 'monthly', '02'),
    P('pharmacy', 'Pharmacy', 'expense', 'health', 25, 'monthly', '15', 'cash'),
    P('netflix', 'Netflix', 'expense', 'subs', 13, 'monthly', '09'),
    P('chatgpt', 'ChatGPT Plus', 'expense', 'subs', 20, 'monthly', '12', 'payoneer', { currency: 'USD' }),
    P('fun', 'Going out', 'expense', 'fun', 60, 'monthly', '20'),
    P('cushion', 'Safety cushion', 'saving', 'savings', 200, 'monthly', '02', 'card', { stashId: 'cushion' }),
    P('holiday', 'Summer holiday', 'saving', 'savings', 100, 'monthly', '02', 'card', { stashId: 'holiday' }),
  ],
};
