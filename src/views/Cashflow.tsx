import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../store';
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

  // Selected / Hovered day
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [inspectDay, setInspectDay] = useState<DayCashflow | null>(null);

  // FX state
  const [fxInfo, setFxInfo] = useState(getFxInfo());
  const [isRefreshingFx, setIsRefreshingFx] = useState(false);

  useEffect(() => {
    return subscribeFx(() => setFxInfo(getFxInfo()));
  }, []);

  const handleRefreshFx = async () => {
    setIsRefreshingFx(true);
    try {
      await fetchLiveRates(true);
      setFxInfo(getFxInfo());
    } finally {
      setIsRefreshingFx(false);
    }
  };

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
      accounts,
      payments,
      transfers,
      plans,
      stashes,
      categories,
      mainCurrency
    );
  }, [fromDate, toDate, accounts, payments, transfers, plans, stashes, categories, mainCurrency]);

  // Overall KPIs for this period
  const kpis = useMemo(() => {
    if (!days.length) return { startBal: 0, endBal: 0, net: 0, income: 0, expense: 0, minBal: 0, maxBal: 0 };
    const startBal = days[0].totalBalance;
    const endBal = days[days.length - 1].totalBalance;
    let income = 0;
    let expense = 0;
    let minBal = days[0].totalBalance;
    let maxBal = days[0].totalBalance;

    for (const d of days) {
      income += d.incomeTotal;
      expense += d.expenseTotal;
      if (d.totalBalance < minBal) minBal = d.totalBalance;
      if (d.totalBalance > maxBal) maxBal = d.totalBalance;
    }
    return {
      startBal,
      endBal,
      net: income - expense,
      income,
      expense,
      minBal,
      maxBal,
    };
  }, [days]);

  // Hovered day object
  const activeDay = useMemo(() => {
    if (!activeDate) return null;
    return days.find(d => d.date === activeDate) ?? null;
  }, [activeDate, days]);

  return (
    <div className="page wide cashflow-view">
      {/* Top Header & Range Controls */}
      <div className="cashflow-top">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1>📈 Cashflow & Calendar</h1>
            <span className="tag fx-badge">
              Normalized to <b>{mainCurrency}</b>
            </span>
          </div>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Daily cash trajectory across all accounts with projected bills and payments.
          </p>
        </div>

        {/* Currency & FX sync info */}
        <div className="fx-status-box">
          <span style={{ fontSize: 12, color: 'var(--mute)' }}>
            FX Rates: {fxInfo.isLive ? '🟢 Live daily sync' : '⚪ Standard rates'}
          </span>
          <button
            type="button"
            className="btn ghost icon-btn"
            title="Refresh exchange rates from live API"
            disabled={isRefreshingFx}
            onClick={handleRefreshFx}
            style={{ fontSize: 14, padding: '4px 8px' }}
          >
            {isRefreshingFx ? '⏳ Syncing…' : '🔄 Refresh rates'}
          </button>
        </div>
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
          <span className="kpi-label">TOTAL LIQUID BALANCE</span>
          <b className="kpi-value" style={{ color: kpis.endBal < 0 ? 'var(--bad)' : 'var(--ink)' }}>
            {money(kpis.endBal, mainCurrency)}
          </b>
          <small className="muted">
            End of period ({days[days.length - 1]?.dayLabel ?? ''})
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
              Top line shows total balance. Colored layers represent stacked account contributions.
            </span>
          </div>

          {/* Account Legend */}
          <div className="graph-legend">
            {accounts.map(a => (
              <div key={a.id} className="legend-item">
                <span className="legend-color-dot" style={{ background: a.color || '#3B82F6' }} />
                <span className="legend-name">{a.name}</span>
              </div>
            ))}
            <div className="legend-item">
              <span className="legend-dot-red" />
              <span className="legend-name">Activity / Payments</span>
            </div>
          </div>
        </div>

        {/* SVG Graph Component */}
        <CashflowSvgChart
          days={days}
          accounts={accounts}
          mainCurrency={mainCurrency}
          activeDate={activeDate}
          onHoverDate={setActiveDate}
          onSelectDate={d => setInspectDay(d)}
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
              All incomes and expenses written in calendar cells. Tap any day for the full rundown.
            </span>
          </div>
        </div>

        {mode === 'month' ? (
          <MonthCalendarGrid
            days={days}
            mainCurrency={mainCurrency}
            activeDate={activeDate}
            onSelectDay={d => {
              setActiveDate(d.date);
              setInspectDay(d);
            }}
          />
        ) : (
          <WeekOrRangeCalendarList
            days={days}
            mainCurrency={mainCurrency}
            activeDate={activeDate}
            onSelectDay={d => {
              setActiveDate(d.date);
              setInspectDay(d);
            }}
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
  onHoverDate: (date: string | null) => void;
  onSelectDate: (day: DayCashflow) => void;
}

function CashflowSvgChart({
  days,
  accounts,
  mainCurrency,
  activeDate,
  onHoverDate,
  onSelectDate,
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
  const maxBalRaw = Math.max(10, ...days.map(d => d.totalBalance));

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

        {/* Total Balance Curve */}
        <path
          d={totalLinePath}
          fill="none"
          stroke="#0F172A"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

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
              onClick={() => onSelectDate(d)}
            />
          );
        })}
      </svg>

      {/* Floating Info Pill under the graph when a day is active */}
      {activeDayObj && (
        <div className="graph-active-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <b style={{ fontSize: 14 }}>{activeDayObj.fullLabel}</b>
              {activeDayObj.isToday && <span className="tag ok-badge">Today</span>}
              {activeDayObj.isFuture && <span className="tag" style={{ background: '#E0F2FE', color: '#0369A1' }}>Projected</span>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 11, color: 'var(--mute)', display: 'block' }}>TOTAL END OF DAY</span>
              <b style={{ fontSize: 16, color: activeDayObj.totalBalance < 0 ? 'var(--bad)' : 'var(--ink)' }}>
                {money(activeDayObj.totalBalance, mainCurrency)}
              </b>
            </div>
          </div>

          {/* Account breakdown row */}
          <div className="day-account-chips">
            {activeDayObj.accounts.map(ab => (
              <span key={ab.accountId} className="chip">
                <span className="dot" style={{ background: ab.accountColor }} />
                {ab.accountName}: <b>{money(ab.balanceOriginal, ab.currency)}</b>
              </span>
            ))}
          </div>

          {/* Rundown summary if items exist */}
          {activeDayObj.items.length > 0 ? (
            <div className="active-items-preview">
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)' }}>
                {activeDayObj.items.length} TRANSACTIONS ON THIS DAY:
              </span>
              <div className="preview-items-list">
                {activeDayObj.items.slice(0, 4).map(it => (
                  <span
                    key={it.id}
                    className={`item-pill ${it.kind}`}
                  >
                    <span>{it.emoji}</span>
                    <span>{it.name}</span>
                    <b>
                      {it.kind === 'income' ? '+' : it.kind === 'expense' ? '-' : ''}
                      {money(it.amount, it.currency)}
                    </b>
                  </span>
                ))}
                {activeDayObj.items.length > 4 && (
                  <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                    +{activeDayObj.items.length - 4} more…
                  </span>
                )}
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
  activeDate: string | null;
  onSelectDay: (day: DayCashflow) => void;
}

function MonthCalendarGrid({ days, mainCurrency, activeDate, onSelectDay }: MonthGridProps) {
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
          const isSelected = d.date === activeDate;
          const hasIncome = d.incomeTotal > 0;
          const hasExpense = d.expenseTotal > 0;

          return (
            <div
              key={d.date}
              className={`cal-cell ${d.isToday ? 'today-cell' : ''} ${isSelected ? 'selected-cell' : ''}`}
              onClick={() => onSelectDay(d)}
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
  activeDate,
  onSelectDay,
}: MonthGridProps) {
  return (
    <div className="week-cards-grid">
      {days.map(d => {
        const isSelected = d.date === activeDate;

        return (
          <div
            key={d.date}
            className={`week-day-card ${d.isToday ? 'today-card' : ''} ${isSelected ? 'selected-card' : ''}`}
            onClick={() => onSelectDay(d)}
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>{day.fullLabel}</h2>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {day.isToday && <span className="tag ok-badge">Today</span>}
              {day.isPast && <span className="tag" style={{ background: '#F1F5F9', color: '#475569' }}>Historical</span>}
              {day.isFuture && <span className="tag" style={{ background: '#E0F2FE', color: '#0369A1' }}>Projected Schedule</span>}
            </div>
          </div>
          <button type="button" className="btn ghost icon" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Day End Total Balance & Net */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: '#F8FAFC', padding: 14, borderRadius: 12, marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 11, color: 'var(--mute)', display: 'block', fontWeight: 700 }}>
              DAY-END TOTAL
            </span>
            <b style={{ fontSize: 20, color: day.totalBalance < 0 ? 'var(--bad)' : 'var(--ink)' }}>
              {money(day.totalBalance, mainCurrency)}
            </b>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--mute)', display: 'block', fontWeight: 700 }}>
              NET CASHFLOW
            </span>
            <b style={{ fontSize: 20, color: day.netChange >= 0 ? '#16A34A' : '#DC2626' }}>
              {day.netChange >= 0 ? `+${money(day.netChange, mainCurrency)}` : money(day.netChange, mainCurrency)}
            </b>
          </div>
        </div>

        {/* Account Balances on this day */}
        <div style={{ marginBottom: 16 }}>
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
                <div style={{ fontWeight: 600 }}>{a.accountName}</div>
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

        {/* Items List */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 6 }}>
            Transactions & Scheduled Items ({day.items.length})
          </div>

          {day.items.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', background: '#F8FAFC', borderRadius: 10, color: 'var(--mute)' }}>
              No transactions on this date.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
              {day.items.map(it => (
                <div
                  key={it.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{it.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{it.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--mute)' }}>
                        {it.accountName ? `${it.accountName} · ` : ''}
                        {it.status === 'confirmed' ? '✓ Confirmed' : '⏰ Scheduled pending'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <b
                      style={{
                        fontSize: 15,
                        color: it.kind === 'income' ? '#16A34A' : it.kind === 'expense' ? '#DC2626' : 'var(--ink)',
                      }}
                    >
                      {it.kind === 'income' ? '+' : it.kind === 'expense' ? '-' : ''}
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
          style={{ marginTop: 18 }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
