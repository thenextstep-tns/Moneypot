import AsyncStorage from '@react-native-async-storage/async-storage';

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
  const ONE_DAY = 24 * 60 * 60 * 1000;
  let cached: string | null = null;
  let cachedTime: string | null = null;

  try {
    cached = await AsyncStorage.getItem('pots-fx-rates');
    cachedTime = await AsyncStorage.getItem('pots-fx-time');
  } catch {}

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
      await AsyncStorage.setItem('pots-fx-rates', JSON.stringify(liveRates));
      await AsyncStorage.setItem('pots-fx-time', String(lastUpdatedTime));
      notifyFxChange();
    }
  } catch {
    if (cached) {
      try { liveRates = { ...DEFAULT_RATES, ...JSON.parse(cached) }; } catch {}
    }
  }
  return liveRates;
}

// Initial fetch on module load
fetchLiveRates().catch(() => {});

export function getFxInfo(): { lastUpdated: number | null; isLive: boolean } {
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
