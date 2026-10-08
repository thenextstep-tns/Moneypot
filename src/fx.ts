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

// Fetch live rates once in background if online (cached locally)
if (typeof window !== 'undefined') {
  const cached = localStorage.getItem('pots-fx-rates');
  const cachedTime = localStorage.getItem('pots-fx-time');
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (cached && cachedTime && Date.now() - Number(cachedTime) < ONE_DAY) {
    try { liveRates = { ...DEFAULT_RATES, ...JSON.parse(cached) }; } catch {}
  } else {
    fetch('https://open.er-api.com/v6/latest/EUR')
      .then(r => r.json())
      .then(d => {
        if (d?.rates) {
          liveRates = { ...DEFAULT_RATES, ...d.rates };
          localStorage.setItem('pots-fx-rates', JSON.stringify(liveRates));
          localStorage.setItem('pots-fx-time', String(Date.now()));
        }
      })
      .catch(() => {
        // Fall back to DEFAULT_RATES silently
      });
  }
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
