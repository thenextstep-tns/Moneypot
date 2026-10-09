import type { Account, Category, Plan, QuickTemplate, Stash, Transfer } from './types';
import { shiftMonth, thisMonth } from './schedule';

export const DEFAULT_TEMPLATES: QuickTemplate[] = [
  { id: 't_coffee', name: 'Coffee & Treat', emoji: '☕', amount: 3.5, currency: 'EUR', categoryId: 'food', subcategory: 'Boredom treats' },
  { id: 't_lunch', name: 'Lunch', emoji: '🥗', amount: 12, currency: 'EUR', categoryId: 'food', subcategory: 'Food at work' },
  { id: 't_groceries', name: 'Supermarket', emoji: '🛒', amount: 35, currency: 'EUR', categoryId: 'food', subcategory: 'Groceries' },
  { id: 't_metro', name: 'Public Transport', emoji: '🚇', amount: 2.4, currency: 'EUR', categoryId: 'transport', subcategory: 'Public transport' },
];

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'home', name: 'Life & Bills', emoji: '🏠', color: '#6C8EF5', kind: 'expense', subcategories: ['Flat rent', 'Mobile phone', 'Household chemicals', 'Clothes', 'Pharmacy', 'Mental & physical health', 'Work expenses', 'Treat myself', 'Insurance'] },
  { id: 'food', name: 'Food', emoji: '🍎', color: '#F2885B', kind: 'expense', subcategories: ['Groceries', 'Food at work', 'Eating out', 'Deliveries', 'Boredom treats', 'Pet food'] },
  { id: 'transport', name: 'Travel & Transport', emoji: '✈️', color: '#3FB5A6', kind: 'expense', subcategories: ['Public transport', 'Fuel & taxi', 'Tickets', 'Travel cash', 'Travel equipment'] },
  { id: 'health', name: 'Health & Care', emoji: '💊', color: '#E5739A', kind: 'expense', subcategories: ['Pharmacy', 'Doctor', 'Sport & gym', 'Self care'] },
  { id: 'subs', name: 'Subscriptions', emoji: '📺', color: '#9B7BEA', kind: 'expense', subcategories: ['ChatGPT Plus', 'Hosting & servers', 'Music', 'Cloud storage', 'Streaming services'] },
  { id: 'fun', name: 'Fun & Treats', emoji: '🎉', color: '#EDB536', kind: 'expense', subcategories: ['Going out', 'Hobbies', 'Clothes', 'Gifts', 'Treats'] },
  { id: 'investments', name: 'Investments', emoji: '📈', color: '#4FA3E0', kind: 'saving', subcategories: ['Portfolio / shares', 'Next Step', 'Courses', 'Safety Stash', 'Crypto'] },
  { id: 'savings', name: 'Savings & Stashes', emoji: '🌱', color: '#2FA36B', kind: 'saving', subcategories: ['Safety cushion', 'Vacation', 'Big purchase', 'Stash top-up'] },
  { id: 'salary', name: 'Salary & Work', emoji: '💼', color: '#2E9E6B', kind: 'income', subcategories: ['Primary paycheck', 'Bonuses', 'Freelance / contract'] },
  { id: 'extra', name: 'Extra income', emoji: '🧩', color: '#43B581', kind: 'income', subcategories: ['BuyMeaCoffee', 'Dividends / interest', 'Gifts', 'Rent received', 'Corrections'] },
  { id: 'other', name: 'Other', emoji: '📦', color: '#9AA0A6', kind: 'expense', subcategories: ['Miscellaneous', 'Unplanned'] },
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
    { id: 'alipay', name: 'Alipay / WeChat', type: 'wallet', institution: 'Alipay', currency: 'CNY', startBalance: 3500, color: '#00A3FF' },
    { id: 'rub', name: 'Tinkoff / Sber', type: 'bank', institution: 'Tinkoff', currency: 'RUB', startBalance: 45000, color: '#EDB536' },
    { id: 'gbp', name: 'UK Account', type: 'bank', institution: 'Barclays', currency: 'GBP', startBalance: 250, color: '#9B7BEA' },
    { id: 'savings', name: 'Savings account', type: 'savings', institution: 'Raiffeisen', currency: 'EUR', startBalance: 500, color: '#2FA36B' },
  ] as Account[],
  stashes: [
    { id: 'cushion', name: 'Safety cushion', emoji: '🛟', target: 3000, currency: 'EUR', accountId: 'savings', startAmount: 500, isInstantAccess: true },
    { id: 'holiday', name: 'Summer holiday', emoji: '🏖️', target: 1200, currency: 'EUR', accountId: 'savings', startAmount: 0, isInstantAccess: true },
  ] as Stash[],
  transfers: [
    {
      id: 'demo_tr_1',
      date: `${m}-10`,
      fromAccountId: 'card',
      toAccountId: 'payoneer',
      fromAmount: 100,
      fromCurrency: 'EUR',
      toAmount: 108,
      toCurrency: 'USD',
      note: 'Converted EUR to USD for online subscriptions',
      status: 'confirmed',
    },
  ] as Transfer[],
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
  templates: DEFAULT_TEMPLATES,
};
