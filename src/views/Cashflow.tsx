import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../store';
import { Modal } from '../ui';
import { calculateCashflowRange, type DayCashflow, type CashflowItem } from '../cashflow';
import { fetchLiveRates, getFxInfo, subscribeFx } from '../fx';
import {
  addDays,
  dayLabel,
  money,
  monthLabel,
  monthRange,
  parse,
  shiftMonth,
  shiftWeek,
  thisMonth,
  today,
  weekLabel,
  weekRange,
  WEEKDAYS,
} from '../schedule';

type RangeMode = 'month' | 'week' | 'range';

export function Cashflow() {
  const { accounts, payments, transfers, plans, stashes, categories, settings } = useData();
  const mainCurrency = settings.currency || 'EUR';

  // Range state
  const [mode, setMode] = useState<RangeMode>('month');
  const [currentYm, setCurrentYm] = useState<string>(thisMonth());
  const [currentWeekDate, setCurrentWeekDate] = useState<string>(today());
  const [customFrom, setCustomFrom] = useState<string>(today());
  const [customTo, setCustomTo] = useState<string>(addDays(today(), 30));

  // Pinned & Hovered day state
  const [pinnedDate, setPinnedDate] = useState<string>(today());
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [inspectDay, setInspectDay] = useState<DayCashflow | null>(null);

  // Selected Accounts filter state
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() => accounts.map(a => a.id));

  useEffect(() => {
    if (accounts.length > 0) {
      setSelectedAccountIds(prev => {
        const valid = prev.filter(id => accounts.some(a => a.id === id));
        return valid.length > 0 ? valid : accounts.map(a => a.id);
      });
    }
  }, [accounts]);

  const isAllAccountsSelected = selectedAccountIds.length === accounts.length;

  const toggleAccount = (accId: string) => {
    if (selectedAccountIds.includes(accId)) {
      if (selectedAccountIds.length > 1) {
        setSelectedAccountIds(selectedAccountIds.filter(id => id !== accId));
      }
    } else {
      setSelectedAccountIds([...selectedAccountIds, accId]);
    }
  };

  const selectAllAccounts = () => {
    setSelectedAccountIds(accounts.map(a => a.id));
  };

  const selectOnlyAccount = (accId: string) => {
    setSelectedAccountIds([accId]);
  };

  const visibleAccounts = useMemo(() => {
    const list = accounts.filter(a => selectedAccountIds.includes(a.id));
    return list.length > 0 ? list : accounts;
  }, [accounts, selectedAccountIds]);

  // Determine active date range [fromDate, toDate]
  const [fromDate, toDate] = useMemo((): [string, string] => {
    if (mode === 'month') {
      return monthRange(currentYm);
    }
    if (mode === 'week') {
      return weekRange(currentWeekDate);
    }
    return [customFrom, customTo < customFrom ? customFrom : customTo];
  }, [mode, currentYm, currentWeekDate, customFrom, customTo]);

  // Compute daily cashflow data
  const days = useMemo(() => {
    return calculateCashflowRange(
      fromDate,
      toDate,
      visibleAccounts,
      payments,
      transfers,
      plans,
      stashes,
      categories,
      mainCurrency
    );
  }, [fromDate, toDate, visibleAccounts, payments, transfers, plans, stashes, categories, mainCurrency]);

  // Synchronize pinnedDate if it's out of range
  useEffect(() => {
    if (days.length > 0) {
      const exists = days.some(d => d.date === pinnedDate);
      if (!exists) {
        const todayItem = days.find(d => d.date === today());
        setPinnedDate(todayItem ? todayItem.date : days[0].date);
      }
    }
  }, [days, pinnedDate]);

  const activeDate = hoveredDate ?? pinnedDate ?? (days[0]?.date || null);

  const handleStepDay = (delta: number) => {
    const idx = days.findIndex(d => d.date === pinnedDate);
    if (idx === -1) return;
    const nextIdx = idx + delta;
    if (nextIdx >= 0 && nextIdx < days.length) {
      setPinnedDate(days[nextIdx].date);
      setHoveredDate(null);
    }
  };

  // Overall KPIs for this period
  const kpis = useMemo(() => {
    if (!days.length) return { startBal: 0, endBal: 0, endStashed: 0, endAvailable: 0, net: 0, income: 0, expense: 0, minBal: 0, maxBal: 0 };
    const startBal = days[0].totalBalance;
    const endBal = days[days.length - 1].totalBalance;
    let income = 0;
    let expense = 0;
    let saving = 0;
    let minBal = days[0].totalBalance;
    let maxBal = days[0].totalBalance;

    for (const d of days) {
      income += d.incomeTotal;
      expense += d.expenseTotal;
      saving += (d.savingTotal ?? 0);
      if (d.totalBalance < minBal) minBal = d.totalBalance;
      if (d.totalBalance > maxBal) maxBal = d.totalBalance;
    }
    const endStashed = days[days.length - 1]?.totalStashed ?? 0;
    const endAvailable = Math.max(0, endBal - endStashed);
    return {
      startBal,
      endBal,
      endStashed,
      endAvailable,
      net: income - (expense + saving),
      income,
      expense: expense + saving,
      onlyExpense: expense,
      saving,
      minBal,
      maxBal,
    };
  }, [days]);

  return (
    <div className="page wide cashflow-view">
      {/* Top Header */}
      <div className="cashflow-top">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1>📈 Cashflow & Calendar</h1>
            <span className="tag fx-badge">
              Normalized to <b>{mainCurrency}</b>
            </span>
          </div>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Daily cash trajectory with projected bills and payments.
          </p>
        </div>

        {/* Account Selector Filter Chips */}
        {accounts.length > 1 && (
          <div className="cashflow-acc-filter-bar">
            <span className="acc-filter-title">Accounts:</span>
            <div className="acc-filter-chips">
              <button
                type="button"
                className={`acc-filter-pill ${isAllAccountsSelected ? 'on' : ''}`}
                onClick={selectAllAccounts}
              >
                All ({accounts.length})
              </button>
              {accounts.map(a => {
                const isSelected = selectedAccountIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`acc-filter-pill ${isSelected ? 'on' : 'off'}`}
                    style={{ ['--acc-c' as string]: a.color || '#3B82F6' }}
                    onClick={() => toggleAccount(a.id)}
                    onDoubleClick={() => selectOnlyAccount(a.id)}
                    title={isSelected ? `Showing ${a.name} (click to hide, double-click to solo)` : `Hidden ${a.name} (click to show)`}
                  >
                    <span className="pill-dot" style={{ background: a.color || '#3B82F6' }} />
                    <span>{a.name}</span>
                    {isSelected && <span className="pill-check">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Navigation & Range Toolbar */}
      <div className="cashflow-toolbar">
        {/* Mode Selector */}
        <div className="segmented-control">
          <button
            type="button"
            className={mode === 'month' ? 'active' : ''}
            onClick={() => setMode('month')}
          >
            📅 Month
          </button>
          <button
            type="button"
            className={mode === 'week' ? 'active' : ''}
            onClick={() => setMode('week')}
          >
            🗓️ Week
          </button>
          <button
            type="button"
            className={mode === 'range' ? 'active' : ''}
            onClick={() => setMode('range')}
          >
            ⏳ Date Range
          </button>
        </div>

        {/* Period Navigation */}
        <div className="cashflow-nav-controls">
          {mode === 'month' && (
            <div className="period-nav">
              <button
                type="button"
                className="btn ghost icon"
                onClick={() => setCurrentYm(shiftMonth(currentYm, -1))}
                title="Previous Month"
              >
                ◀
              </button>
              <h2 style={{ margin: 0, minWidth: 160, textAlign: 'center' }}>
                {monthLabel(currentYm)}
              </h2>
              <button
                type="button"
                className="btn ghost icon"
                onClick={() => setCurrentYm(shiftMonth(currentYm, 1))}
                title="Next Month"
              >
                ▶
              </button>
              {currentYm !== thisMonth() && (
                <button
                  type="button"
                  className="btn ghost today-jump"
                  onClick={() => setCurrentYm(thisMonth())}
                >
                  This Month
                </button>
              )}
            </div>
          )}

          {mode === 'week' && (
            <div className="period-nav">
              <button
                type="button"
                className="btn ghost icon"
                onClick={() => setCurrentWeekDate(shiftWeek(currentWeekDate, -1))}
                title="Previous Week"
              >
                ◀
              </button>
              <h2 style={{ margin: 0, minWidth: 200, textAlign: 'center' }}>
                {weekLabel(currentWeekDate)}
              </h2>
              <button
                type="button"
                className="btn ghost icon"
                onClick={() => setCurrentWeekDate(shiftWeek(currentWeekDate, 1))}
                title="Next Week"
              >
                ▶
              </button>
              <button
                type="button"
                className="btn ghost today-jump"
                onClick={() => setCurrentWeekDate(today())}
              >
                This Week
              </button>
            </div>
          )}

          {mode === 'range' && (
            <div className="range-inputs">
              <label>
                <span>From:</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                />
              </label>
              <label>
                <span>To:</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setCustomFrom(today());
                  setCustomTo(addDays(today(), 30));
                }}
              >
                Next 30 Days
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="cashflow-kpis">
        <div className="kpi-card">
          <span className="kpi-label">AVAILABLE CASH</span>
          <b className="kpi-value" style={{ color: (kpis.endAvailable <= 0 && kpis.endBal <= 0) ? 'var(--ink)' : '#16A34A' }}>
            {money(kpis.endAvailable, mainCurrency)}
          </b>
          <small className="muted">
            End of period · Total: {money(kpis.endBal, mainCurrency)}{(kpis.endStashed ?? 0) > 0 ? ` · 🔒 ${money(kpis.endStashed ?? 0, mainCurrency)}` : ''}
          </small>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">NET CASHFLOW</span>
          <b
            className="kpi-value"
            style={{ color: kpis.net >= 0 ? '#16A34A' : 'var(--bad)' }}
          >
            {kpis.net >= 0 ? `+${money(kpis.net, mainCurrency)}` : money(kpis.net, mainCurrency)}
          </b>
          <small className="muted">
            Income minus expenses in period
          </small>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">TOTAL INCOMES</span>
          <b className="kpi-value" style={{ color: '#16A34A' }}>
            +{money(kpis.income, mainCurrency)}
          </b>
          <small className="muted">Confirmed & scheduled</small>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">TOTAL OUTGOING</span>
          <b className="kpi-value" style={{ color: '#DC2626' }}>
            -{money(kpis.expense, mainCurrency)}
          </b>
          <small className="muted">Bills & casual spending</small>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">LOWEST POINT</span>
          <b className="kpi-value" style={{ color: kpis.minBal < 0 ? 'var(--bad)' : 'var(--ink)' }}>
            {money(kpis.minBal, mainCurrency)}
          </b>
          <small className="muted">
            {kpis.minBal < 0 ? '⚠️ Projected shortfall!' : 'Safety cushion intact'}
          </small>
        </div>
      </div>

      {/* Interactive Cashflow Chart Section */}
      <div className="cashflow-graph-container card-panel">
        <div className="graph-panel-header">
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Cashflow Trajectory</h3>
            <span style={{ fontSize: 12, color: 'var(--mute)' }}>
              Top line shows total balance. Colored layers represent stacked account contributions. Click any date to pin rundown.
            </span>
          </div>

          {/* Account Legend */}
          <div className="graph-legend">
            {accounts.map(a => {
              const isSelected = selectedAccountIds.includes(a.id);
              return (
                <div
                  key={a.id}
                  className="legend-item clickable"
                  style={{ cursor: 'pointer', opacity: isSelected ? 1 : 0.4 }}
                  onClick={() => toggleAccount(a.id)}
                  title={isSelected ? `Showing ${a.name} (click to hide)` : `Hiding ${a.name} (click to show)`}
                >
                  <span className="legend-color-dot" style={{ background: a.color || '#3B82F6' }} />
                  <span className="legend-name" style={{ textDecoration: isSelected ? 'none' : 'line-through' }}>
                    {a.name}
                  </span>
                </div>
              );
            })}
            <div className="legend-item">
              <span className="legend-dot-red" />
              <span className="legend-name">Activity / Payments</span>
            </div>
            {days.some(d => (d.totalStashed ?? 0) > 0) && (
              <div className="legend-item" title="Money put away into stashes (reserved from spending)">
                <span className="legend-color-dot" style={{ background: '#94A3B8', border: '1px dashed #64748B' }} />
                <span className="legend-name">🔒 Stashed (Reserved)</span>
              </div>
            )}
          </div>
        </div>

        {/* SVG Graph Component */}
        <CashflowSvgChart
          days={days}
          accounts={visibleAccounts}
          mainCurrency={mainCurrency}
          activeDate={activeDate}
          pinnedDate={pinnedDate}
          hoveredDate={hoveredDate}
          onHoverDate={setHoveredDate}
          onPinDate={d => {
            setPinnedDate(d);
            setHoveredDate(null);
          }}
          onStepDay={handleStepDay}
          onOpenModal={d => setInspectDay(d)}
        />
      </div>

      {/* Payment Calendar Underneath Graph */}
      <div className="cashflow-calendar-section card-panel">
        <div className="calendar-panel-header">
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>
              {mode === 'month' ? 'Payment Calendar Grid' : mode === 'week' ? 'Weekly Payment Breakdown' : 'Daily Cashflow Schedule'}
            </h3>
            <span style={{ fontSize: 12, color: 'var(--mute)' }}>
              All incomes and expenses written in calendar cells. Tap any day to pin and see full rundown.
            </span>
          </div>
        </div>

        {mode === 'month' ? (
          <MonthCalendarGrid
            days={days}
            mainCurrency={mainCurrency}
            pinnedDate={pinnedDate}
            onPinDate={d => {
              setPinnedDate(d);
              setHoveredDate(null);
            }}
            onOpenModal={d => setInspectDay(d)}
          />
        ) : (
          <WeekOrRangeCalendarList
            days={days}
            mainCurrency={mainCurrency}
            pinnedDate={pinnedDate}
            onPinDate={d => {
              setPinnedDate(d);
              setHoveredDate(null);
            }}
            onOpenModal={d => setInspectDay(d)}
          />
        )}
      </div>

      {/* Day Inspector Modal */}
      {inspectDay && (
        <DayDetailModal
          day={inspectDay}
          mainCurrency={mainCurrency}
          onClose={() => setInspectDay(null)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------------
// SVG GRAPH COMPONENT WITH STACKED ACCOUNTS AND INTERACTIVE CALLOUTS
// -----------------------------------------------------------------------------------

interface SvgChartProps {
  days: DayCashflow[];
  accounts: any[];
  mainCurrency: string;
  activeDate: string | null;
  pinnedDate: string;
  hoveredDate: string | null;
  onHoverDate: (date: string | null) => void;
  onPinDate: (date: string) => void;
  onStepDay: (delta: number) => void;
  onOpenModal: (day: DayCashflow) => void;
}

function CashflowSvgChart({
  days,
  accounts,
  mainCurrency,
  activeDate,
  pinnedDate,
  hoveredDate,
  onHoverDate,
  onPinDate,
  onStepDay,
  onOpenModal,
}: SvgChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (!days.length) {
    return <div style={{ padding: 40, textAlign: 'center' }}>No date range selected.</div>;
  }

  // Geometry dimensions
  const svgW = 1000;
  const svgH = 340;
  const padLeft = 70;
  const padRight = 30;
  const padTop = 60; // Extra room for floating callout balloons
  const padBottom = 40;

  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;
  const n = days.length;

  // Auto-scale vertical bounds
  const minBalRaw = Math.min(0, ...days.map(d => d.totalBalance));
  const maxBalRaw = Math.max(10, ...days.map(d => Math.max(d.totalBalance, d.totalAvailable, 0)));

  // Determine tick range with headroom
  const rangeSpan = Math.max(100, maxBalRaw - minBalRaw);
  const yMax = Math.ceil((maxBalRaw + rangeSpan * 0.1) / 100) * 100;
  const yMin = minBalRaw < 0 ? Math.floor((minBalRaw - rangeSpan * 0.05) / 100) * 100 : 0;
  const yTotalSpan = yMax - yMin || 1;

  // Coordinate mappers
  const getX = (index: number) => {
    if (n <= 1) return padLeft + plotW / 2;
    return padLeft + (index / (n - 1)) * plotW;
  };

  const getY = (val: number) => {
    const norm = (val - yMin) / yTotalSpan;
    return padTop + plotH - norm * plotH;
  };

  // Y-axis grid ticks (4 evenly spaced intervals)
  const ticksCount = 4;
  const yTicks = Array.from({ length: ticksCount + 1 }).map((_, i) => {
    const val = yMin + (i / ticksCount) * (yMax - yMin);
    return { val, y: getY(val) };
  });

  // Calculate stacked area paths for each account
  // Accounts are drawn from bottom to top
  const accountAreas = useMemo(() => {
    return accounts.map(a => {
      // Points along top edge of account band
      const topPoints = days.map((d, i) => {
        const ab = d.accounts.find(x => x.accountId === a.id);
        const yTop = ab ? ab.y1 : 0;
        return `${getX(i).toFixed(1)},${getY(yTop).toFixed(1)}`;
      });

      // Points along bottom edge of account band (in reverse)
      const bottomPoints = days
        .map((d, i) => {
          const ab = d.accounts.find(x => x.accountId === a.id);
          const yBot = ab ? ab.y0 : 0;
          return `${getX(i).toFixed(1)},${getY(yBot).toFixed(1)}`;
        })
        .reverse();

      const pathData = `M ${topPoints.join(' L ')} L ${bottomPoints.join(' L ')} Z`;
      return {
        id: a.id,
        name: a.name,
        color: a.color || '#3B82F6',
        pathData,
      };
    });
  }, [days, accounts, yMin, yTotalSpan]);

  const hasStashed = useMemo(() => days.some(d => (d.totalStashed ?? 0) > 0), [days]);

  // Stashed area layer (greyed out / striped on top of available cash)
  const stashedArea = useMemo(() => {
    if (!hasStashed) return null;
    const topPoints = days.map((d, i) => `${getX(i).toFixed(1)},${getY(d.stashedY1).toFixed(1)}`);
    const bottomPoints = days.map((d, i) => `${getX(i).toFixed(1)},${getY(d.stashedY0).toFixed(1)}`).reverse();
    const pathData = `M ${topPoints.join(' L ')} L ${bottomPoints.join(' L ')} Z`;
    return { pathData };
  }, [days, hasStashed, yMin, yTotalSpan]);

  const availableLinePath = useMemo(() => {
    if (!hasStashed) return null;
    const points = days.map((d, i) => `${getX(i).toFixed(1)},${getY(d.totalAvailable).toFixed(1)}`);
    return `M ${points.join(' L ')}`;
  }, [days, hasStashed, yMin, yTotalSpan]);

  // Total balance line path
  const totalLinePoints = days.map((d, i) => `${getX(i).toFixed(1)},${getY(d.totalBalance).toFixed(1)}`);
  const totalLinePath = `M ${totalLinePoints.join(' L ')}`;

  // Find active day index
  const activeIndex = days.findIndex(d => d.date === activeDate);
  const activeDayObj = activeIndex >= 0 ? days[activeIndex] : null;

  // X-axis label skip logic to prevent crowding
  const labelInterval = n > 35 ? 5 : n > 20 ? 3 : n > 12 ? 2 : 1;

  return (
    <div className="svg-chart-wrapper" ref={containerRef}>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="cashflow-svg"
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => onHoverDate(null)}
      >
        <defs>
          <linearGradient id="totalLineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E293B" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>
          <pattern id="stashedHatch" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#64748B" strokeWidth="1.2" strokeOpacity="0.4" />
          </pattern>
          <filter id="shadowGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
          </filter>
        </defs>

        {/* Horizontal Grid lines & Y-axis labels */}
        {yTicks.map((t, idx) => (
          <g key={idx} className="y-grid-line">
            <line
              x1={padLeft}
              y1={t.y}
              x2={padLeft + plotW}
              y2={t.y}
              stroke="#E2E8F0"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <text
              x={padLeft - 10}
              y={t.y + 4}
              textAnchor="end"
              fill="#64748B"
              fontSize="11"
              fontFamily="inherit"
              fontWeight="500"
            >
              {money(t.val, mainCurrency)}
            </text>
          </g>
        ))}

        {/* Zero baseline if yMin < 0 */}
        {yMin < 0 && (
          <line
            x1={padLeft}
            y1={getY(0)}
            x2={padLeft + plotW}
            y2={getY(0)}
            stroke="#94A3B8"
            strokeWidth="1.5"
          />
        )}

        {/* Stacked Account Area Layers */}
        {accountAreas.map(layer => (
          <path
            key={layer.id}
            d={layer.pathData}
            fill={layer.color}
            fillOpacity="0.32"
            stroke={layer.color}
            strokeWidth="1"
            strokeOpacity="0.6"
            style={{ transition: 'fill-opacity .15s' }}
          />
        ))}

        {/* Greyed-out Stashed / Reserved Area Layer */}
        {stashedArea && (
          <g className="stashed-chart-layer">
            <path
              d={stashedArea.pathData}
              fill="#94A3B8"
              fillOpacity="0.22"
              stroke="#64748B"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <path
              d={stashedArea.pathData}
              fill="url(#stashedHatch)"
            />
          </g>
        )}

        {/* Total Balance Curve */}
        <path
          d={totalLinePath}
          fill="none"
          stroke="#0F172A"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Available Cash Curve (Dashed line under stashed layer) */}
        {availableLinePath && (
          <path
            d={availableLinePath}
            fill="none"
            stroke="#64748B"
            strokeWidth="1.8"
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />
        )}

        {/* Vertical Day Grid lines & X-axis Date Labels */}
        {days.map((d, i) => {
          const x = getX(i);
          const showLabel = i === 0 || i === n - 1 || i % labelInterval === 0;

          return (
            <g key={d.date}>
              {showLabel && (
                <text
                  x={x}
                  y={svgH - 12}
                  textAnchor="middle"
                  fill={d.isToday ? 'var(--brand)' : '#64748B'}
                  fontSize={d.isToday ? '12' : '11'}
                  fontWeight={d.isToday ? '700' : '500'}
                  fontFamily="inherit"
                >
                  {d.dayLabel}
                </text>
              )}
            </g>
          );
        })}

        {/* Activity Red Dots & Today marker */}
        {days.map((d, i) => {
          const x = getX(i);
          const y = getY(d.totalBalance);
          const hasActivity = d.items.length > 0;
          const isSelected = d.date === activeDate;

          return (
            <g key={d.date} style={{ pointerEvents: 'none' }}>
              {/* Today pulsed circle */}
              {d.isToday && (
                <circle
                  cx={x}
                  cy={y}
                  r="8"
                  fill="none"
                  stroke="#16A34A"
                  strokeWidth="2"
                  strokeDasharray="2 2"
                />
              )}

              {/* Red dot for activity days */}
              {hasActivity && (
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 6 : 4.5}
                  fill="#EF4444"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  filter="url(#shadowGlow)"
                />
              )}

              {/* Selected / Hovered indicator */}
              {isSelected && (
                <circle
                  cx={x}
                  cy={y}
                  r="7.5"
                  fill="none"
                  stroke="#0F172A"
                  strokeWidth="2.5"
                />
              )}
            </g>
          );
        })}

        {/* Active Day Hover Guideline & Balloons */}
        {activeDayObj && activeIndex >= 0 && (
          <g style={{ pointerEvents: 'none' }}>
            {/* Vertical crosshair guideline */}
            <line
              x1={getX(activeIndex)}
              y1={padTop - 25}
              x2={getX(activeIndex)}
              y2={svgH - padBottom}
              stroke="#475569"
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />

            {/* Income & Expense Floating Callout Balloons (From Sketch) */}
            <ChartCalloutBalloons
              x={getX(activeIndex)}
              y={getY(activeDayObj.totalBalance)}
              day={activeDayObj}
              mainCurrency={mainCurrency}
            />
          </g>
        )}

        {/* Interactive Hover Columns (full height transparent hit areas) */}
        {days.map((d, i) => {
          const colW = n > 1 ? plotW / (n - 1) : plotW;
          const leftEdge = getX(i) - colW / 2;

          return (
            <rect
              key={d.date}
              x={Math.max(padLeft, leftEdge)}
              y={padTop - 20}
              width={colW}
              height={plotH + 40}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHoverDate(d.date)}
              onClick={() => onPinDate(d.date)}
            />
          );
        })}
      </svg>

      {/* Persistent Info Card under the graph */}
      {activeDayObj && (
        <div className="graph-active-card">
          <div className="day-card-header">
            <div className="day-card-title-group">
              <div className="day-card-nav-buttons">
                <button
                  type="button"
                  className="btn ghost icon"
                  style={{ width: 28, height: 28, fontSize: 13, border: '1px solid var(--line)' }}
                  title="Previous Day"
                  onClick={() => onStepDay(-1)}
                >
                  ◀
                </button>
                <button
                  type="button"
                  className="btn ghost icon"
                  style={{ width: 28, height: 28, fontSize: 13, border: '1px solid var(--line)' }}
                  title="Next Day"
                  onClick={() => onStepDay(1)}
                >
                  ▶
                </button>
              </div>

              <div className="day-card-title-labels">
                <b style={{ fontSize: 15, marginRight: 6 }}>{activeDayObj.fullLabel}</b>
                {activeDayObj.isToday && <span className="tag ok-badge">Today</span>}
                {activeDayObj.isFuture && <span className="tag" style={{ background: '#E0F2FE', color: '#0369A1' }}>Projected</span>}
                {hoveredDate && hoveredDate !== pinnedDate ? (
                  <span className="tag" style={{ background: '#FEF3C7', color: '#92400E' }}>
                    👁️ Hovering
                  </span>
                ) : (
                  <span className="tag" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
                    📌 Pinned
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: 12, padding: '4px 8px', border: '1px solid var(--line)', whiteSpace: 'nowrap' }}
              onClick={() => onOpenModal(activeDayObj)}
            >
              🔍 Details
            </button>
          </div>

          {/* Clean Metric Badges Strip */}
          <div className="day-card-metrics-strip">
            <div className="day-metric-box">
              <span className="metric-label">AVAILABLE CASH</span>
              <b className="metric-val" style={{ color: activeDayObj.totalAvailable < 0 ? 'var(--bad)' : '#16A34A' }}>
                {money(activeDayObj.totalAvailable, mainCurrency)}
              </b>
            </div>
            {activeDayObj.totalStashed > 0 && (
              <div className="day-metric-box stashed-metric">
                <span className="metric-label">🔒 STASHED (RESERVED)</span>
                <b className="metric-val" style={{ color: '#475569' }}>
                  {money(activeDayObj.totalStashed, mainCurrency)}
                </b>
              </div>
            )}
            <div className="day-metric-box">
              <span className="metric-label">TOTAL IN ACCOUNTS</span>
              <b className="metric-val" style={{ color: activeDayObj.totalBalance < 0 ? 'var(--bad)' : 'var(--ink)' }}>
                {money(activeDayObj.totalBalance, mainCurrency)}
              </b>
            </div>
            <div className="day-metric-box">
              <span className="metric-label">DAY NET CHANGE</span>
              <b className="metric-val" style={{ color: activeDayObj.netChange >= 0 ? '#16A34A' : '#DC2626' }}>
                {activeDayObj.netChange >= 0 ? `+${money(activeDayObj.netChange, mainCurrency)}` : money(activeDayObj.netChange, mainCurrency)}
              </b>
            </div>
          </div>

          {/* Account breakdown row */}
          <div className="day-account-chips">
            {activeDayObj.accounts.map(ab => (
              <span key={ab.accountId} className="chip">
                <span className="dot" style={{ background: ab.accountColor }} />
                <span>
                  {ab.accountName}: <b>{money(ab.availableOriginal, ab.currency)} free</b>
                  {ab.stashedOriginal > 0 && (
                    <span style={{ color: 'var(--mute)', fontSize: 11, marginLeft: 4 }}>
                      ({money(ab.balanceOriginal, ab.currency)} total)
                    </span>
                  )}
                </span>
              </span>
            ))}
            {activeDayObj.stashes?.map(sb => (
              <span
                key={sb.stashId}
                className="chip stash-chip"
                title={`Stash: ${sb.stashName}${sb.accountName ? ` (held in ${sb.accountName})` : ''}`}
              >
                <span style={{ fontSize: 13, marginRight: 2 }}>{sb.stashEmoji || '🌱'}</span>
                <span>{sb.stashName}: <b>{money(sb.balanceOriginal, sb.currency)}</b></span>
              </span>
            ))}
          </div>

          {/* Rundown of all items on this date */}
          {activeDayObj.items.length > 0 ? (
            <div className="active-items-preview">
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)' }}>
                {activeDayObj.items.length} TRANSACTIONS & SCHEDULED BILLS ON THIS DAY:
              </span>
              <div className="preview-items-list" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeDayObj.items.map(it => (
                  <div
                    key={it.id}
                    className="cashflow-active-item"
                  >
                    <div className="item-main">
                      <span className="item-emoji">{it.emoji}</span>
                      <div className="item-info">
                        <div className="item-title-row">
                          <span className="item-title">{it.name}</span>
                          {it.kind === 'saving' && (
                            <span className="tag" style={{ background: '#CCFBF1', color: '#0F766E', fontSize: 10.5, padding: '1px 6px' }}>
                              🌱 Stashed
                            </span>
                          )}
                        </div>
                        <div className="item-sub">
                          {it.category && <span className="tag" style={{ background: '#F1F5F9', color: '#475569', fontSize: 11, padding: '1px 5px' }}>{it.category}</span>}
                          {it.accountName && <span>({it.accountName})</span>}
                          <span>• {it.status === 'confirmed' ? '✓ Confirmed' : '⏰ Scheduled'}</span>
                        </div>
                      </div>
                    </div>
                    <div
                      className="item-amount"
                      style={{
                        color:
                          it.kind === 'income'
                            ? '#16A34A'
                            : it.kind === 'saving'
                            ? '#0D9488'
                            : '#DC2626',
                      }}
                    >
                      {it.kind === 'income' ? '+' : it.kind === 'saving' ? '-' : it.kind === 'expense' ? '-' : ''}
                      {money(it.amount, it.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <small className="muted" style={{ display: 'block', marginTop: 6 }}>
              No payments scheduled or recorded on this day.
            </small>
          )}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------------
// FLOATING CALLOUT BALLOONS (Matching User Sketch: "inc" green box, "exp" orange box)
// -----------------------------------------------------------------------------------

function ChartCalloutBalloons({
  x,
  y,
  day,
  mainCurrency,
}: {
  x: number;
  y: number;
  day: DayCashflow;
  mainCurrency: string;
}) {
  const hasIncome = day.incomeTotal > 0;
  const hasExpense = day.expenseTotal > 0;

  // If no transactions on this day, show simple total pill
  if (!hasIncome && !hasExpense) {
    return (
      <g transform={`translate(${x}, ${Math.max(25, y - 28)})`}>
        <rect
          x="-50"
          y="-18"
          width="100"
          height="24"
          rx="6"
          fill="#0F172A"
          fillOpacity="0.9"
        />
        <text
          x="0"
          y="-2"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="11"
          fontWeight="600"
          fontFamily="inherit"
        >
          {money(day.totalBalance, mainCurrency)}
        </text>
      </g>
    );
  }

  // Offset balloons so they do not collide
  const incX = hasExpense ? x - 48 : x;
  const expX = hasIncome ? x + 48 : x;
  const balloonY = Math.max(25, y - 42);

  return (
    <g>
      {/* Income balloon (Green) */}
      {hasIncome && (
        <g transform={`translate(${incX}, ${balloonY})`}>
          <rect
            x="-44"
            y="-22"
            width="88"
            height="26"
            rx="6"
            fill="#16A34A"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            filter="url(#shadowGlow)"
          />
          <text
            x="0"
            y="-5"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="10.5"
            fontWeight="700"
            fontFamily="inherit"
          >
            +{money(day.incomeTotal, mainCurrency)} inc
          </text>
        </g>
      )}

      {/* Expense balloon (Orange / Red) */}
      {hasExpense && (
        <g transform={`translate(${expX}, ${balloonY})`}>
          <rect
            x="-44"
            y="-22"
            width="88"
            height="26"
            rx="6"
            fill="#EA580C"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            filter="url(#shadowGlow)"
          />
          <text
            x="0"
            y="-5"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="10.5"
            fontWeight="700"
            fontFamily="inherit"
          >
            -{money(day.expenseTotal, mainCurrency)} exp
          </text>
        </g>
      )}
    </g>
  );
}

// -----------------------------------------------------------------------------------
// MONTH CALENDAR GRID (7 COLUMNS WITH DAILY PAYMENTS AND BALANCES)
// -----------------------------------------------------------------------------------

interface MonthGridProps {
  days: DayCashflow[];
  mainCurrency: string;
  pinnedDate: string;
  onPinDate: (date: string) => void;
  onOpenModal: (day: DayCashflow) => void;
}

function MonthCalendarGrid({ days, mainCurrency, pinnedDate, onPinDate, onOpenModal }: MonthGridProps) {
  if (!days.length) return null;

  // First day of month determines column offset (Monday-based: Mon=0, Sun=6)
  const firstDay = days[0];
  const offset = (firstDay.weekdayIndex + 6) % 7; // Monday = 0, Sun = 6
  const emptyPads = Array.from({ length: offset });

  return (
    <div className="month-calendar-wrapper">
      {/* Weekday column headers */}
      <div className="cal-weekday-headers">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => (
          <div key={w} className="cal-weekday-header">
            {w}
          </div>
        ))}
      </div>

      {/* Calendar Cells */}
      <div className="cal-cells-grid">
        {/* Leading empty pads */}
        {emptyPads.map((_, idx) => (
          <div key={`pad-${idx}`} className="cal-cell empty-cell" />
        ))}

        {/* Days of the month */}
        {days.map(d => {
          const isSelected = d.date === pinnedDate;

          return (
            <div
              key={d.date}
              className={`cal-cell ${d.isToday ? 'today-cell' : ''} ${isSelected ? 'selected-cell' : ''}`}
              onClick={() => onPinDate(d.date)}
              onDoubleClick={() => onOpenModal(d)}
              title="Click to view details in the rundown above, double-click for details"
            >
              {/* Day Number and End-of-Day Balance */}
              <div className="cal-cell-head">
                <span className={`cal-day-num ${d.isToday ? 'today-num' : ''}`}>
                  {d.dayOfMonth}
                </span>
                <span className="cal-cell-bal" title="Total end-of-day balance">
                  {money(d.totalBalance, mainCurrency)}
                </span>
              </div>

              {/* Transactions in cell */}
              <div className="cal-cell-items">
                {d.items.slice(0, 3).map(it => (
                  <div
                    key={it.id}
                    className={`cal-item-badge ${it.kind}`}
                    title={`${it.name}: ${money(it.amount, it.currency)}`}
                  >
                    <span className="badge-emoji">{it.emoji}</span>
                    <span className="badge-name">{it.name}</span>
                    <span className="badge-amt">
                      {it.kind === 'income' ? '+' : it.kind === 'expense' ? '-' : ''}
                      {money(it.amount, it.currency)}
                    </span>
                  </div>
                ))}

                {d.items.length > 3 && (
                  <div className="cal-more-badge">
                    +{d.items.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------------
// WEEK OR RANGE BREAKDOWN (7 RESPONSIVE DAILY CARDS)
// -----------------------------------------------------------------------------------

function WeekOrRangeCalendarList({
  days,
  mainCurrency,
  pinnedDate,
  onPinDate,
  onOpenModal,
}: MonthGridProps) {
  return (
    <div className="week-cards-grid">
      {days.map(d => {
        const isSelected = d.date === pinnedDate;

        return (
          <div
            key={d.date}
            className={`week-day-card ${d.isToday ? 'today-card' : ''} ${isSelected ? 'selected-card' : ''}`}
            onClick={() => onPinDate(d.date)}
            onDoubleClick={() => onOpenModal(d)}
          >
            <div className="week-card-head">
              <div>
                <b style={{ fontSize: 15 }}>{d.fullLabel}</b>
                {d.isToday && <span className="tag ok-badge">Today</span>}
                {d.isFuture && <span className="tag" style={{ background: '#E0F2FE', color: '#0369A1' }}>Projected</span>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 11, color: 'var(--mute)', display: 'block' }}>BALANCE</span>
                <b style={{ fontSize: 16, color: d.totalBalance < 0 ? 'var(--bad)' : 'var(--ink)' }}>
                  {money(d.totalBalance, mainCurrency)}
                </b>
              </div>
            </div>

            {/* Daily Net Bar */}
            <div className="week-card-net">
              <span>Day Net:</span>
              <b style={{ color: d.netChange >= 0 ? '#16A34A' : '#DC2626' }}>
                {d.netChange >= 0 ? `+${money(d.netChange, mainCurrency)}` : money(d.netChange, mainCurrency)}
              </b>
            </div>

            {/* Itemized List */}
            <div className="week-card-items">
              {d.items.length === 0 ? (
                <span className="muted" style={{ fontSize: 12 }}>No payments</span>
              ) : (
                d.items.map(it => (
                  <div key={it.id} className={`week-item-row ${it.kind}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{it.emoji}</span>
                      <span style={{ fontWeight: 600 }}>{it.name}</span>
                    </div>
                    <div style={{ fontWeight: 700 }}>
                      {it.kind === 'income' ? '+' : it.kind === 'expense' ? '-' : ''}
                      {money(it.amount, it.currency)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------------
// DAY DETAIL MODAL (DETAILED RUNDOWN ON TAP)
// -----------------------------------------------------------------------------------

function DayDetailModal({
  day,
  mainCurrency,
  onClose,
}: {
  day: DayCashflow;
  mainCurrency: string;
  onClose: () => void;
}) {
  return (
    <Modal title={day.fullLabel} onClose={onClose}>
      <div style={{ display: 'flex', gap: 6, marginTop: -4, marginBottom: 8 }}>
        {day.isToday && <span className="tag ok-badge">Today</span>}
        {day.isPast && <span className="tag" style={{ background: '#F1F5F9', color: '#475569' }}>Historical</span>}
        {day.isFuture && <span className="tag" style={{ background: '#E0F2FE', color: '#0369A1' }}>Projected Schedule</span>}
      </div>

      {/* Day End Total Balance & Net */}
      <div style={{ display: 'grid', gridTemplateColumns: day.totalStashed > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10, background: '#F8FAFC', padding: 14, borderRadius: 12, marginBottom: 14 }}>
        <div>
          <span style={{ fontSize: 11, color: 'var(--mute)', display: 'block', fontWeight: 700 }}>
            AVAILABLE CASH
          </span>
          <b style={{ fontSize: 18, color: day.totalAvailable <= 0 ? 'var(--ink)' : '#16A34A' }}>
            {money(Math.max(0, day.totalAvailable), mainCurrency)}
          </b>
        </div>
        <div>
          <span style={{ fontSize: 11, color: 'var(--mute)', display: 'block', fontWeight: 700 }}>
            NET CASHFLOW
          </span>
          <b style={{ fontSize: 18, color: day.netChange >= 0 ? '#16A34A' : '#DC2626' }}>
            {day.netChange >= 0 ? `+${money(day.netChange, mainCurrency)}` : money(day.netChange, mainCurrency)}
          </b>
        </div>
        {day.totalStashed > 0 && (
          <div>
            <span style={{ fontSize: 11, color: 'var(--mute)', display: 'block', fontWeight: 700 }}>
              🔒 STASHED
            </span>
            <b style={{ fontSize: 18, color: '#475569' }}>
              {money(day.totalStashed, mainCurrency)}
            </b>
          </div>
        )}
      </div>

      {/* Account Balances on this day */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 6 }}>
          Account Balances on {day.dayLabel}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {day.accounts.map(a => (
            <div
              key={a.accountId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 10,
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderLeft: `4px solid ${a.accountColor}`,
              }}
            >
              <div>
                <span style={{ fontWeight: 600 }}>{a.accountName}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b>{money(a.balanceOriginal, a.currency)}</b>
                {a.currency !== mainCurrency && (
                  <small className="muted" style={{ display: 'block', fontSize: 11 }}>
                    ≈ {money(a.balanceInMain, mainCurrency)}
                  </small>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stash Balances on this day */}
      {day.stashes && day.stashes.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 6 }}>
            Stash Balances on {day.dayLabel}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {day.stashes.map(s => (
              <div
                key={s.stashId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'var(--card)',
                  border: '1px dashed #94A3B8',
                  borderLeft: '4px solid #64748B',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{s.stashEmoji || '🌱'}</span>
                  <div>
                    <span style={{ fontWeight: 600 }}>{s.stashName}</span>
                    {s.accountName && (
                      <span style={{ fontSize: 11, color: 'var(--mute)', fontWeight: 400, marginLeft: 6 }}>
                        (held in {s.accountName})
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <b style={{ color: '#1E293B' }}>{money(s.balanceOriginal, s.currency)}</b>
                  {s.currency !== mainCurrency && (
                    <small className="muted" style={{ display: 'block', fontSize: 11 }}>
                      ≈ {money(s.balanceInMain, mainCurrency)}
                    </small>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items List */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 6 }}>
          Transactions & Scheduled Items ({day.items.length})
        </div>

        {day.items.length === 0 ? (
          <div style={{ padding: 18, textAlign: 'center', background: '#F8FAFC', borderRadius: 10, color: 'var(--mute)' }}>
            No transactions on this date.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
            {day.items.map(it => (
              <div
                key={it.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{it.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{it.name}</span>
                      {it.kind === 'saving' && (
                        <span className="tag" style={{ background: '#CCFBF1', color: '#0F766E', fontSize: 10.5, padding: '1px 6px' }}>
                          🌱 Stashed
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mute)' }}>
                      {it.accountName ? `${it.accountName} · ` : ''}
                      {it.status === 'confirmed' ? '✓ Confirmed' : '⏰ Scheduled pending'}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <b
                    style={{
                      fontSize: 14,
                      color:
                        it.kind === 'income'
                          ? '#16A34A'
                          : it.kind === 'saving'
                          ? '#0D9488'
                          : '#DC2626',
                    }}
                  >
                    {it.kind === 'income' ? '+' : '-'}
                    {money(it.amount, it.currency)}
                  </b>
                  {it.currency !== mainCurrency && (
                    <small className="muted" style={{ display: 'block', fontSize: 11 }}>
                      ≈ {money(it.amountInMain, mainCurrency)}
                    </small>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className="btn primary wide"
        style={{ marginTop: 12 }}
        onClick={onClose}
      >
        Close
      </button>
    </Modal>
  );
}
