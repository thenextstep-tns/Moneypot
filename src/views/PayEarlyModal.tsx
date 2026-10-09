import { useMemo, useState } from 'react';
import { useData } from '../store';
import { occurrences, today, addDays, dayLabel, money } from '../schedule';
import type { Occurrence } from '../types';
import { Empty, Modal } from '../ui';

export function PayEarlyModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (o: Occurrence) => void;
}) {
  const { plans, payments, categories, accounts } = useData();
  const [query, setQuery] = useState('');
  const t = today();

  // Search upcoming planned occurrences for the next 90 days
  const upcoming = useMemo(() => {
    return occurrences(plans, payments, addDays(t, 1), addDays(t, 90)).filter(
      o => o.status === 'pending'
    );
  }, [plans, payments, t]);

  const cat = (id: string) => categories.find(c => c.id === id);
  const acc = (id?: string) => accounts.find(a => a.id === id);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return upcoming;
    return upcoming.filter(o => {
      const c = cat(o.categoryId);
      return (
        o.name.toLowerCase().includes(q) ||
        (o.subcategory && o.subcategory.toLowerCase().includes(q)) ||
        (c && c.name.toLowerCase().includes(q)) ||
        String(o.amount).includes(q)
      );
    });
  }, [upcoming, query, categories]);

  return (
    <Modal title="Pay or Receive Ahead of Schedule" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Paid a bill, received an income, or made a transfer earlier than scheduled? Select it below to record it today — Moneypot will satisfy the upcoming due date so you won’t be asked again.
      </p>

      <div style={{ marginBottom: 16 }}>
        <input
          type="search"
          placeholder="Search upcoming bills, income, transfers (e.g. rent, salary)..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          style={{
            width: '100%',
            padding: '11px 14px',
            borderRadius: 12,
            border: '1.5px solid var(--line)',
            fontSize: 14,
            outline: 'none',
          }}
        />
      </div>

      <div
        style={{
          maxHeight: '52vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          paddingRight: 4,
        }}
      >
        {filtered.length === 0 ? (
          <Empty
            emoji="🔍"
            title={query ? 'No matching upcoming bills' : 'No upcoming bills in the next 90 days'}
          />
        ) : (
          filtered.map(o => {
            const c = cat(o.categoryId);
            const a = acc(o.accountId);
            return (
              <div
                key={o.key}
                className="item"
                style={{
                  cursor: 'pointer',
                  padding: '12px 14px',
                  borderRadius: 14,
                  transition: 'background 0.15s ease',
                  border: '1px solid var(--line)',
                }}
                onClick={() => {
                  onClose();
                  onSelect(o);
                }}
              >
                <div className="emoji">{c?.emoji ?? '🗓️'}</div>
                <div className="grow">
                  <div
                    className="title"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>{o.name}</span>
                    <span
                      className="tag"
                      style={{
                        background: '#FEF3C7',
                        color: '#92400E',
                        fontWeight: 700,
                        fontSize: 11,
                      }}
                    >
                      Due {dayLabel(o.date)}
                    </span>
                    {o.subcategory && (
                      <span className="tag subcat-badge">{o.subcategory}</span>
                    )}
                  </div>
                  <div className="sub" style={{ fontSize: 12, marginTop: 2 }}>
                    {c?.name ?? 'Pot'} · {a?.name ?? 'No account assigned'}
                  </div>
                </div>
                <div className="amt" style={{ fontWeight: 700, fontSize: 15 }}>
                  {money(o.amount, o.currency)}
                </div>
                <button
                  type="button"
                  className="btn ok"
                  style={{
                    fontSize: 13,
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontWeight: 600,
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onSelect(o);
                  }}
                >
                  {o.kind === 'income' ? '⚡ Got today' : (o.kind === 'transfer' || o.kind === 'saving') ? '⚡ Move today' : '⚡ Pay today'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
