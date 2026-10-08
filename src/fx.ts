/**
 * Currency conversion and exchange rates.
 * Supports EUR, USD, GBP, CNY, RUB, RSD, CHF, PLN, UAH, TRY, GEL, JPY, CAD, AUD.
 * Base rates relative to 1 EUR.
 */

export const DEFAULT_RATES: Record<string, number> = {
  EUR: 1.0,
  USD: 1.08,
  GBP: 0.85,
  CNY: 7.82,
  RUB: 104.5,
  RSD: 117.2,
  CHF: 0.96,
  PLN: 4.30,
  UAH: 44.8,
  TRY: 37.1,
  GEL: 2.95,
  JPY: 165.0,
  CAD: 1.48,
  AUD: 1.65,
};

let liveRates: Record<string, number> = { ...DEFAULT_RATES };
let lastUpdatedTime: number | null = null;
const listeners = new Set<() => void>();

function notifyFxChange() {
  for (const fn of listeners) fn();
}

export function subscribeFx(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function fetchLiveRates(force = false): Promise<Record<string, number>> {
  if (typeof window === 'undefined') return liveRates;
  const cached = localStorage.getItem('pots-fx-rates');
  const cachedTime = localStorage.getItem('pots-fx-time');
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (!force && cached && cachedTime && Date.now() - Number(cachedTime) < ONE_DAY) {
    try {
      liveRates = { ...DEFAULT_RATES, ...JSON.parse(cached) };
      lastUpdatedTime = Number(cachedTime);
      return liveRates;
    } catch {}
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/EUR');
    const data = await res.json();
    if (data?.rates) {
      liveRates = { ...DEFAULT_RATES, ...data.rates };
      lastUpdatedTime = Date.now();
      localStorage.setItem('pots-fx-rates', JSON.stringify(liveRates));
      localStorage.setItem('pots-fx-time', String(lastUpdatedTime));
      notifyFxChange();
    }
  } catch {
    // Fall back to cached or default
    if (cached) {
      try { liveRates = { ...DEFAULT_RATES, ...JSON.parse(cached) }; } catch {}
    }
  }
  return liveRates;
}

// Initial fetch on module load
if (typeof window !== 'undefined') {
  fetchLiveRates().catch(() => {});
}

export function getFxInfo(): { lastUpdated: number | null; isLive: boolean } {
  if (typeof window !== 'undefined' && !lastUpdatedTime) {
    const t = localStorage.getItem('pots-fx-time');
    if (t) lastUpdatedTime = Number(t);
  }
  return {
    lastUpdated: lastUpdatedTime,
    isLive: !!lastUpdatedTime,
  };
}

/** Convert amount from one currency to another */
export function convert(amount: number, from: string = 'EUR', to: string = 'EUR'): number {
  if (!amount || from === to) return amount;
  const rateFrom = liveRates[from] ?? DEFAULT_RATES[from] ?? 1.0;
  const rateTo = liveRates[to] ?? DEFAULT_RATES[to] ?? 1.0;
  // Convert to EUR first, then to target currency
  const inEur = amount / rateFrom;
  return inEur * rateTo;
}

/** Get estimated rate from -> to */
export function getRate(from: string, to: string): number {
  if (from === to) return 1;
  const rateFrom = liveRates[from] ?? DEFAULT_RATES[from] ?? 1.0;
  const rateTo = liveRates[to] ?? DEFAULT_RATES[to] ?? 1.0;
  return rateTo / rateFrom;
}

