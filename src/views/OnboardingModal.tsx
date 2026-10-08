import { useState } from 'react';
import { Modal } from '../ui';

interface Step {
  emoji: string;
  badge: string;
  title: string;
  lead: string;
  bullets: string[];
}

const STEPS: Step[] = [
  {
    emoji: '🍯',
    badge: 'Welcome to Moneypot',
    title: 'Peace of mind with your money',
    lead: 'No spreadsheets, complex formulas, or financial jargon. Just clear pots and real accounts.',
    bullets: [
      'Tracks what is really in your bank cards and cash.',
      'Know what you can safely spend without touching bill money.',
      'Simple, calming, and built for humans.'
    ]
  },
  {
    emoji: '✅',
    badge: '1. Today View',
    title: 'Your 10-second daily routine',
    lead: 'Check off regular bills as they happen and log casual spending in seconds.',
    bullets: [
      'Tap “✓ Paid” when a scheduled bill happens.',
      'Tap “⏰ Later” to postpone if an invoice is delayed.',
      'Tap “+ I spent money” to log casual coffee, groceries, or unexpected costs.'
    ]
  },
  {
    emoji: '🫙',
    badge: '2. Pots Dashboard',
    title: 'Visual spending envelopes',
    lead: 'Group your spending into clear pots and see your true month-end cashflow.',
    bullets: [
      'Pots show how much is planned, what’s already paid, and what’s still needed.',
      'Organize spending inside pots using flexible subcategories.',
      'Calculates your real month-end balance factoring in your current bank accounts.'
    ]
  },
  {
    emoji: '🗓️',
    badge: '3. Plan',
    title: 'Set it once, stay ahead',
    lead: 'Tell Moneypot about your recurring income and bills so you never miss a due date.',
    bullets: [
      'Supports daily, weekly (on chosen days), monthly (dates or nth-weekday), and yearly.',
      'Assign bills directly to your cards or banks to watch for low balances.',
      'No stress: future occurrences appear automatically on your timeline.'
    ]
  },
  {
    emoji: '💳',
    badge: '4. Money & Stashes',
    title: 'Where money lives & grows',
    lead: 'Track accounts in multiple currencies and save toward your goals.',
    bullets: [
      'Add cards, banks, cash, and wallets in EUR, USD, GBP, CNY, RUB, etc.',
      'Move money between accounts with live or custom exchange rates.',
      'Create 🐷 Stashes for rainy-day cushions or dream vacation goals.'
    ]
  },
  {
    emoji: '📜',
    badge: '5. Log Book',
    title: 'Complete peace of mind',
    lead: 'Every transaction is recorded here with instant one-click revert.',
    bullets: [
      'Search and filter past expenses, incomes, savings, and transfers.',
      'Made a mistake or returned an item? Tap “Cancel & revert money”.',
      'Funds are automatically restored back to the source account.'
    ]
  },
  {
    emoji: '👥',
    badge: '6. Shared Pots & Stashes',
    title: 'Collaborate with friends or family',
    lead: 'Share a grocery pot, rent pot, or savings stash via verified email invites.',
    bullets: [
      'Invite specific emails without griefing risks or auto-fill leaks.',
      'Collaborators confirm via a secure one-off masked access code in their email.',
      'Track shared spending together while keeping your personal accounts private.'
    ]
  }
];

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  const finish = () => {
    localStorage.setItem('mp_onboarded', 'true');
    onClose();
  };

  return (
    <Modal title="How Moneypot Works" onClose={finish}>
      <div className="onboarding-step">
        <div className="onboarding-icon">{step.emoji}</div>
        <span className="pill" style={{ margin: '0 auto', display: 'inline-block' }}>{step.badge}</span>
        <h2 style={{ margin: '8px 0 4px', fontSize: 20 }}>{step.title}</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>{step.lead}</p>

        <ul className="onboarding-bullets">
          {step.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>

        <div className="onboarding-dots">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`onboarding-dot ${i === index ? 'active' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>

        <div className="row" style={{ marginTop: 12, width: '100%' }}>
          {index > 0 ? (
            <button type="button" className="btn ghost" onClick={() => setIndex(index - 1)}>
              ‹ Back
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={finish}>
              Skip tour
            </button>
          )}

          {isLast ? (
            <button type="button" className="btn primary wide" onClick={finish}>
              Start using Moneypot 🚀
            </button>
          ) : (
            <button type="button" className="btn primary wide" onClick={() => setIndex(index + 1)}>
              Next ›
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
