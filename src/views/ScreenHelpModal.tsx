import { Modal } from '../ui';

export type ScreenHelpKey = 'today' | 'pots' | 'plan' | 'accounts' | 'stashes' | 'logbook';

interface HelpData {
  emoji: string;
  title: string;
  desc: string;
  tips: { icon: string; title: string; text: string }[];
}

const HELP_MAP: Record<ScreenHelpKey, HelpData> = {
  today: {
    emoji: '✅',
    title: 'How the Today View works',
    desc: 'Your daily check-in. In a few seconds, confirm bills as they happen or log spontaneous spending.',
    tips: [
      { icon: '✓', title: 'Confirm (Paid / Got it)', text: 'Records the payment and updates your account balance immediately.' },
      { icon: '⏰', title: 'Postpone (Later)', text: 'Pushes the bill to tomorrow or next week without messing up your recurring plan.' },
      { icon: '➕', title: 'Quick spending', text: 'Tap “+ I spent money” for grocery runs, coffees, or sudden purchases.' }
    ]
  },
  pots: {
    emoji: '🫙',
    title: 'How Pots work',
    desc: 'Visual spending envelopes for the current month. Know what is planned, what’s paid, and what’s left.',
    tips: [
      { icon: '📊', title: 'Real Cashflow', text: 'Takes your current bank balances into account so you know your true month-end position.' },
      { icon: '🏷️', title: 'Subcategories', text: 'Click any pot to see spending broken down by subcategory (e.g., Home › Rent vs WiFi).' },
      { icon: '⚠️', title: 'Low Balance Warning', text: 'Warns you if upcoming bills assigned to an account exceed its current balance.' }
    ]
  },
  plan: {
    emoji: '🗓️',
    title: 'How Planning works',
    desc: 'Your financial autopilot. Set up recurring income and expenses once, and Moneypot schedules them.',
    tips: [
      { icon: '🔄', title: 'Flexible Recurrence', text: 'Daily, weekly on selected days, monthly (dates or nth-weekday like 1st Monday), or yearly.' },
      { icon: '💳', title: 'Account Assignment', text: 'Choose which card or bank pays the bill to monitor for low funds.' },
      { icon: '📝', title: 'Notes', text: 'Add notes like “includes electricity + water” so you remember what is covered.' }
    ]
  },
  accounts: {
    emoji: '💳',
    title: 'How Accounts work',
    desc: 'Where your cash, cards, and bank balances actually live.',
    tips: [
      { icon: '💱', title: 'Multi-Currency', text: 'Each account can have its own currency (EUR, USD, GBP, CNY, RUB). Live rates convert seamlessly.' },
      { icon: '⇄', title: 'Move Money', text: 'Transfer between accounts with custom amounts and effective exchange rates.' },
      { icon: '🛡️', title: 'Low Funds Protection', text: 'Prevents accidentally transferring more money than what is available in the account.' }
    ]
  },
  stashes: {
    emoji: '🐷',
    title: 'How Stashes work',
    desc: 'Money you are putting aside for safety cushions or dream goals.',
    tips: [
      { icon: '🎯', title: 'Savings Goals', text: 'Track how much you’ve saved against your goal with a visual progress bar.' },
      { icon: '🗓️', title: 'Monthly Reminders', text: 'Optionally link a monthly plan to remind you to set money aside.' },
      { icon: '👥', title: 'Shared Stashes', text: 'Share savings goals with friends or family to save up together.' }
    ]
  },
  logbook: {
    emoji: '📜',
    title: 'How the Log Book works',
    desc: 'Complete ledger of everything you confirmed or moved, with zero regrets.',
    tips: [
      { icon: '🔍', title: 'Search & Filters', text: 'Quickly find any past expense, income, saving, or transfer.' },
      { icon: '↩️', title: 'Cancel & Revert Money', text: 'Cancelling any operation automatically refunds the money back to the account.' },
      { icon: '✎', title: 'Edit Past Transactions', text: 'Change the amount, pot, subcategory, or notes anytime.' }
    ]
  }
};

export function ScreenHelpModal({ screenKey, onClose }: { screenKey: ScreenHelpKey; onClose: () => void }) {
  const h = HELP_MAP[screenKey];
  return (
    <Modal title={h.title} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 32 }}>{h.emoji}</span>
          <p style={{ margin: 0, color: 'var(--mute)', fontSize: 14, lineHeight: 1.4 }}>{h.desc}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          {h.tips.map((t, i) => (
            <div key={i} className="item" style={{ margin: 0, padding: '10px 14px' }}>
              <div className="emoji" style={{ width: 32, height: 32, fontSize: 16 }}>{t.icon}</div>
              <div className="grow">
                <div className="title" style={{ fontSize: 13 }}>{t.title}</div>
                <div className="sub" style={{ fontSize: 12 }}>{t.text}</div>
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="btn primary wide" style={{ marginTop: 8 }} onClick={onClose}>
          Got it 👍
        </button>
      </div>
    </Modal>
  );
}
