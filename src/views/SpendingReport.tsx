import { useMemo, useState } from 'react';
import { useData } from '../store';
import { addDays, monthLabel, monthRange, money, shiftMonth, thisMonth, today } from '../schedule';
import { convert } from '../fx';
import { Empty, Field, HelpButton } from '../ui';
import { ScreenHelpModal } from './ScreenHelpModal';

type PeriodType = 'this_month' | 'last_month' | 'last_30' | 'last_90' | 'this_year' | 'all_time' | 'custom';

interface SubcatSpending {
  key: string;
  potId: string;
  potName: string;
  potEmoji: string;
  potColor: string;
  subcategory: string;
  total: number;
  count: number;
  avgPerOp: number;
  percentage: number;
  sliceColor: string;
}

interface PieSlice extends SubcatSpending {
  startAngle: number;
  endAngle: number;
  midAngle: number;
  pathD: string;
}

/** Converts hex color to HSL values [h, s, l] */
function hexToHsl(hex: string): [number, number, number] {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return [210, 50, 50];
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** Generates harmonic shade variation for subcategories belonging to the same pot */
function getSubcatColor(potColor: string, index: number, totalInPot: number): string {
  if (totalInPot <= 1) return potColor;
  const [h, s, l] = hexToHsl(potColor);
  const step = totalInPot > 1 ? 32 / (totalInPot - 1) : 0;
  const targetL = Math.min(82, Math.max(26, (l - 16) + index * step));
  const hueShift = totalInPot > 2 ? ((index % 2 === 0 ? 1 : -1) * (index * 3)) : 0;
  const targetH = (h + hueShift + 360) % 360;
  return `hsl(${targetH}, ${Math.max(35, s)}%, ${targetL}%)`;
}

/** Builds an SVG donut slice arc path */
function createDonutArc(
  cx: number,
  cy: number,
  R: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const delta = endAngle - startAngle;
  // If slice spans nearly full circle (single category)
  if (delta >= 2 * Math.PI - 0.001) {
    return [
      `M ${cx} ${cy - R}`,
      `A ${R} ${R} 0 1 1 ${cx} ${cy + R}`,
      `A ${R} ${R} 0 1 1 ${cx} ${cy - R}`,
      `M ${cx} ${cy - r}`,
      `A ${r} ${r} 0 1 0 ${cx} ${cy + r}`,
      `A ${r} ${r} 0 1 0 ${cx} ${cy - r}`,
      'Z',
    ].join(' ');
  }

  const theta1 = startAngle - Math.PI / 2;
  const theta2 = endAngle - Math.PI / 2;
  const x1 = cx + R * Math.cos(theta1);
  const y1 = cy + R * Math.sin(theta1);
  const x2 = cx + R * Math.cos(theta2);
  const y2 = cy + R * Math.sin(theta2);
  const ix2 = cx + r * Math.cos(theta2);
  const iy2 = cy + r * Math.sin(theta2);
  const ix1 = cx + r * Math.cos(theta1);
  const iy1 = cy + r * Math.sin(theta1);
  const largeArc = delta > Math.PI ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${ix2} ${iy2}`,
    `A ${r} ${r} 0 ${largeArc} 0 ${ix1} ${iy1}`,
    'Z',
  ].join(' ');
}

export function SpendingReport() {
  const { payments, categories, settings } = useData();
  const [period, setPeriod] = useState<PeriodType>('this_month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [selectedPotId, setSelectedPotId] = useState<string>('all');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const curCurrency = settings.currency || 'EUR';

  // Compute period range
  const { startDate, endDate, periodLabel } = useMemo(() => {
    const todayStr = today();
    const currentYm = thisMonth();
    const curYear = new Date().getFullYear();

    if (period === 'this_month') {
      const [start, end] = monthRange(currentYm);
      return {
        startDate: start,
        endDate: end,
        periodLabel: `This Month (${monthLabel(currentYm)})`,
      };
    }
    if (period === 'last_month') {
      const lastYm = shiftMonth(currentYm, -1);
      const [start, end] = monthRange(lastYm);
      return {
        startDate: start,
        endDate: end,
        periodLabel: `Last Month (${monthLabel(lastYm)})`,
      };
    }
    if (period === 'last_30') {
      const start = addDays(todayStr, -29);
      return {
        startDate: start,
        endDate: todayStr,
        periodLabel: `Last 30 Days (${start} – ${todayStr})`,
      };
    }
    if (period === 'last_90') {
      const start = addDays(todayStr, -89);
      return {
        startDate: start,
        endDate: todayStr,
        periodLabel: `Last 90 Days (${start} – ${todayStr})`,
      };
    }
    if (period === 'this_year') {
      const start = `${curYear}-01-01`;
      const end = `${curYear}-12-31`;
      return {
        startDate: start,
        endDate: end,
        periodLabel: `Year ${curYear}`,
      };
    }
    if (period === 'all_time') {
      return {
        startDate: '2000-01-01',
        endDate: '2099-12-31',
        periodLabel: 'All Time Spending',
      };
    }
    // Custom
    const start = customStart || `${currentYm}-01`;
    const end = customEnd || todayStr;
    return {
      startDate: start,
      endDate: end,
      periodLabel: `Custom Range (${start} – ${end})`,
    };
  }, [period, customStart, customEnd]);

  // Aggregate confirmed expense operations by Pot + Subcategory
  const { groupedItems, rundownList, grandTotal, totalOperations, potTotals } = useMemo(() => {
    const catMap = new Map(categories.map(c => [c.id, c]));
    const itemMap = new Map<string, {
      potId: string;
      potName: string;
      potEmoji: string;
      potColor: string;
      subcategory: string;
      total: number;
      count: number;
    }>();

    const potTotalMap = new Map<string, number>();

    for (const p of payments) {
      if (p.kind !== 'expense' || p.status !== 'confirmed') continue;
      if (p.date < startDate || p.date > endDate) continue;

      const pot = p.categoryId ? catMap.get(p.categoryId) : undefined;
      const potId = pot?.id || 'other';
      if (selectedPotId !== 'all' && potId !== selectedPotId) continue;

      const potName = pot?.name || 'Other / Uncategorized';
      const potEmoji = pot?.emoji || '📦';
      const potColor = pot?.color || '#9AA0A6';
      const subcategory = (p.subcategory || '').trim() || 'General';

      const key = `${potId}:::${subcategory}`;
      const convertedAmt = convert(p.amount, p.currency, curCurrency);

      const existing = itemMap.get(key) || {
        potId,
        potName,
        potEmoji,
        potColor,
        subcategory,
        total: 0,
        count: 0,
      };

      existing.total += convertedAmt;
      existing.count += 1;
      itemMap.set(key, existing);

      potTotalMap.set(potId, (potTotalMap.get(potId) ?? 0) + convertedAmt);
    }

    const grand = Array.from(itemMap.values()).reduce((sum, item) => sum + item.total, 0);
    const ops = Array.from(itemMap.values()).reduce((sum, item) => sum + item.count, 0);

    // Group by pot (pots ordered by total spending descending)
    const potGroups = new Map<string, Array<typeof itemMap extends Map<any, infer V> ? V : never>>();
    for (const item of itemMap.values()) {
      if (!potGroups.has(item.potId)) potGroups.set(item.potId, []);
      potGroups.get(item.potId)!.push(item);
    }

    const sortedPots = Array.from(potGroups.entries()).sort(
      ([potA], [potB]) => (potTotalMap.get(potB) ?? 0) - (potTotalMap.get(potA) ?? 0)
    );

    const orderedGrouped: SubcatSpending[] = [];

    for (const [, subItems] of sortedPots) {
      // Sort subcategories in pot descending by spending
      subItems.sort((a, b) => b.total - a.total);
      subItems.forEach((item, idx) => {
        const percentage = grand > 0 ? (item.total / grand) * 100 : 0;
        const avgPerOp = item.count > 0 ? item.total / item.count : 0;
        const sliceColor = getSubcatColor(item.potColor, idx, subItems.length);
        orderedGrouped.push({
          key: `${item.potId}:::${item.subcategory}`,
          ...item,
          percentage,
          avgPerOp,
          sliceColor,
        });
      });
    }

    // Rundown list starting with the biggest % subcategories globally
    const rundown = [...orderedGrouped].sort((a, b) => b.total - a.total);

    return {
      groupedItems: orderedGrouped,
      rundownList: rundown,
      grandTotal: grand,
      totalOperations: ops,
      potTotals: potTotalMap,
    };
  }, [payments, categories, startDate, endDate, selectedPotId, curCurrency]);

  // Build SVG Pie / Donut slices
  const slices: PieSlice[] = useMemo(() => {
    if (grandTotal <= 0) return [];

    let currentAngle = 0;
    const cx = 200;
    const cy = 200;
    const R = 150;
    const r = 76;

    return groupedItems.map(item => {
      const fraction = item.total / grandTotal;
      const angle = fraction * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      const midAngle = (startAngle + endAngle) / 2;
      currentAngle = endAngle;

      const pathD = createDonutArc(cx, cy, R, r, startAngle, endAngle);

      return {
        ...item,
        startAngle,
        endAngle,
        midAngle,
        pathD,
      };
    });
  }, [groupedItems, grandTotal]);

  const activeItem = useMemo(() => {
    if (!hoveredKey) return null;
    return rundownList.find(i => i.key === hoveredKey) || null;
  }, [hoveredKey, rundownList]);

  const overallAvgPerOp = totalOperations > 0 ? grandTotal / totalOperations : 0;
  const topSubcategory = rundownList.length > 0 ? rundownList[0] : null;

  return (
    <div className="page spending-report-page">
      <header className="page-head">
        <div>
          <h1>
            Spending Breakdown 📊
            <HelpButton onClick={() => setHelpOpen(true)} title="How this spending report works" />
          </h1>
          <p className="muted">
            What do you spend money on? Pots divided into subcategories for {periodLabel}.
          </p>
        </div>
      </header>

      {/* Period Selection Controls */}
      <div className="spending-controls">
        <div className="chips period-chips">
          {(
            [
              ['this_month', 'This Month'],
              ['last_month', 'Last Month'],
              ['last_30', 'Last 30 Days'],
              ['last_90', 'Last 90 Days'],
              ['this_year', 'This Year'],
              ['all_time', 'All Time'],
              ['custom', 'Custom Range…'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={period === val ? 'chip on' : 'chip'}
              onClick={() => setPeriod(val)}
            >
              {label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="custom-date-row">
            <Field label="From Date">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
              />
            </Field>
            <Field label="To Date">
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
              />
            </Field>
          </div>
        )}

        {/* Optional Pot Filter */}
        <div className="pot-filter-row">
          <span className="muted filter-label">Pot filter:</span>
          <div className="chips">
            <button
              type="button"
              className={selectedPotId === 'all' ? 'chip on' : 'chip'}
              onClick={() => setSelectedPotId('all')}
            >
              All Pots
            </button>
            {categories
              .filter(c => c.kind === 'expense')
              .map(c => {
                const spent = potTotals.get(c.id) ?? 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={selectedPotId === c.id ? 'chip on' : 'chip'}
                    onClick={() => setSelectedPotId(c.id)}
                  >
                    {c.emoji} {c.name}
                    {spent > 0 ? ` (${money(spent, curCurrency)})` : ''}
                  </button>
                );
              })}
          </div>
        </div>
      </div>

      {grandTotal <= 0 ? (
        <Empty
          emoji="🥧"
          title="No expenses in this period"
          text="There are no confirmed expenses recorded for the chosen timeframe. Try selecting another date range or record a payment."
        />
      ) : (
        <>
          {/* Top KPI Summary Cards */}
          <div className="spending-kpi-grid">
            <div className="spending-kpi-card">
              <div className="kpi-label">Total Spent</div>
              <div className="kpi-value brand">{money(grandTotal, curCurrency)}</div>
              <div className="kpi-sub muted">In {curCurrency} (converted)</div>
            </div>

            <div className="spending-kpi-card">
              <div className="kpi-label">Operations</div>
              <div className="kpi-value">{totalOperations}</div>
              <div className="kpi-sub muted">Confirmed transactions</div>
            </div>

            <div className="spending-kpi-card">
              <div className="kpi-label">Average per Operation</div>
              <div className="kpi-value">{money(overallAvgPerOp, curCurrency)}</div>
              <div className="kpi-sub muted">Across all subcategories</div>
            </div>

            {topSubcategory && (
              <div className="spending-kpi-card highlight">
                <div className="kpi-label">Top Expense Subcategory</div>
                <div className="kpi-value text-ellipsis">
                  {topSubcategory.potEmoji} {topSubcategory.subcategory}
                </div>
                <div className="kpi-sub">
                  {topSubcategory.percentage.toFixed(1)}% ({money(topSubcategory.total, curCurrency)})
                </div>
              </div>
            )}
          </div>

          {/* Interactive Pie / Donut Chart */}
          <div className="spending-chart-section">
            <div className="chart-container">
              <svg
                viewBox="0 0 400 400"
                className="spending-donut-svg"
                onMouseMove={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => {
                  setHoveredKey(null);
                  setMousePos(null);
                }}
              >
                <defs>
                  <filter id="sliceGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.35" />
                  </filter>
                </defs>

                {/* Slices */}
                {slices.map(slice => {
                  const isHovered = hoveredKey === slice.key;
                  // Pop out translation vector along midAngle
                  const popDist = isHovered ? 7 : 0;
                  const theta = slice.midAngle - Math.PI / 2;
                  const dx = Math.cos(theta) * popDist;
                  const dy = Math.sin(theta) * popDist;

                  return (
                    <path
                      key={slice.key}
                      d={slice.pathD}
                      fill={slice.sliceColor}
                      stroke="var(--bg)"
                      strokeWidth={isHovered ? 3 : 1.5}
                      strokeLinejoin="round"
                      style={{
                        transform: `translate(${dx}px, ${dy}px)`,
                        transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), stroke-width 0.15s ease',
                        cursor: 'pointer',
                        filter: isHovered ? 'url(#sliceGlow)' : undefined,
                      }}
                      onMouseEnter={e => {
                        setHoveredKey(slice.key);
                        setMousePos({ x: e.clientX, y: e.clientY });
                      }}
                    />
                  );
                })}

                {/* Center Donut Info */}
                <g className="donut-center-info" pointerEvents="none">
                  {activeItem ? (
                    <>
                      <text x="200" y="165" textAnchor="middle" className="donut-center-emoji" fontSize="24">
                        {activeItem.potEmoji}
                      </text>
                      <text x="200" y="188" textAnchor="middle" className="donut-center-subcat" fontSize="13" fontWeight="700" fill="var(--ink)">
                        {activeItem.subcategory.length > 18 ? `${activeItem.subcategory.slice(0, 16)}…` : activeItem.subcategory}
                      </text>
                      <text x="200" y="212" textAnchor="middle" className="donut-center-pct" fontSize="20" fontWeight="800" fill={activeItem.sliceColor}>
                        {activeItem.percentage.toFixed(1)}%
                      </text>
                      <text x="200" y="232" textAnchor="middle" className="donut-center-sum" fontSize="12" fontWeight="600" fill="var(--ink)">
                        {money(activeItem.total, curCurrency)}
                      </text>
                      <text x="200" y="248" textAnchor="middle" className="donut-center-avg muted" fontSize="10">
                        avg {money(activeItem.avgPerOp, curCurrency)}/op
                      </text>
                    </>
                  ) : (
                    <>
                      <text x="200" y="175" textAnchor="middle" className="donut-center-label muted" fontSize="11" fontWeight="700" letterSpacing="1">
                        TOTAL SPENT
                      </text>
                      <text x="200" y="206" textAnchor="middle" className="donut-center-total" fontSize="22" fontWeight="800" fill="var(--ink)">
                        {money(grandTotal, curCurrency)}
                      </text>
                      <text x="200" y="230" textAnchor="middle" className="donut-center-sub muted" fontSize="12">
                        {totalOperations} operations
                      </text>
                    </>
                  )}
                </g>
              </svg>
            </div>

            {/* Floating Tooltip */}
            {activeItem && mousePos && (
              <div
                className="spending-floating-tooltip"
                style={{
                  left: `${mousePos.x + 14}px`,
                  top: `${mousePos.y - 14}px`,
                }}
              >
                <div className="tooltip-header">
                  <span className="tooltip-pot-badge" style={{ backgroundColor: `${activeItem.potColor}25`, color: activeItem.potColor }}>
                    {activeItem.potEmoji} {activeItem.potName}
                  </span>
                  <span className="tooltip-subcat">› {activeItem.subcategory}</span>
                </div>
                <div className="tooltip-metrics">
                  <div className="tooltip-pct-badge" style={{ background: activeItem.sliceColor }}>
                    {activeItem.percentage.toFixed(1)}%
                  </div>
                  <div className="tooltip-sum">{money(activeItem.total, curCurrency)}</div>
                </div>
                <div className="tooltip-avg">
                  Avg per operation: <strong>{money(activeItem.avgPerOp, curCurrency)}</strong>
                </div>
                <div className="tooltip-ops muted">
                  {activeItem.count} {activeItem.count === 1 ? 'operation' : 'operations'}
                </div>
              </div>
            )}
          </div>

          {/* Breakdown List Below - Starting with Biggest % Subcategories */}
          <div className="spending-rundown-section">
            <div className="rundown-header">
              <h2>Subcategories Breakdown</h2>
              <span className="muted font-small">Sorted by highest spending percentage</span>
            </div>

            <div className="spending-rundown-list">
              {rundownList.map((item, idx) => {
                const isHovered = hoveredKey === item.key;
                return (
                  <div
                    key={item.key}
                    className={`spending-rundown-row ${isHovered ? 'hovered' : ''}`}
                    onMouseEnter={() => setHoveredKey(item.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                  >
                    <div className="row-rank">#{idx + 1}</div>

                    <div
                      className="row-swatch"
                      style={{ backgroundColor: item.sliceColor }}
                      title={`Color for ${item.subcategory}`}
                    />

                    <div className="row-content">
                      <div className="row-top">
                        <div className="row-title-group">
                          <span className="row-subcat-name">{item.subcategory}</span>
                          <span
                            className="tag pot-tag-badge"
                            style={{ borderLeft: `3px solid ${item.potColor}` }}
                          >
                            {item.potEmoji} {item.potName}
                          </span>
                        </div>

                        <div className="row-figures">
                          <span className="row-sum">{money(item.total, curCurrency)}</span>
                          <span className="row-pct" style={{ color: item.sliceColor }}>
                            {item.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* Percentage Bar */}
                      <div className="row-bar-track">
                        <div
                          className="row-bar-fill"
                          style={{
                            width: `${Math.min(100, item.percentage)}%`,
                            backgroundColor: item.sliceColor,
                          }}
                        />
                      </div>

                      <div className="row-bottom">
                        <span className="row-ops muted">
                          {item.count} {item.count === 1 ? 'op' : 'ops'} · Average:{' '}
                          <strong style={{ color: 'var(--ink)' }}>
                            {money(item.avgPerOp, curCurrency)}
                          </strong>{' '}
                          / operation
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {helpOpen && (
        <ScreenHelpModal
          screenKey="spending"
          onClose={() => setHelpOpen(false)}
        />
      )}
    </div>
  );
}
