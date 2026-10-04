const BASE_CURRENCY = 'USD';
const RATE_VERSION = '2026-09-17';

// Units of each currency per one USD. Replace this table with approved rates before production use.
const RATES_PER_USD = Object.freeze({
  USD: 1,
  NGN: 1500,
  KES: 129,
  GHS: 15,
  UGX: 3700,
  ZAR: 17.5,
  TZS: 2650,
  RWF: 1450,
  ETB: 145,
  XOF: 600
});

const BUDGET_RANGES = Object.freeze({
  lt100: { min: 0, max: 100 },
  '100-499': { min: 100, max: 500 },
  '500-999': { min: 500, max: 1000 },
  '1000+': { min: 1000, max: null }
});

function isSupportedCurrency(currency) {
  return typeof currency === 'string' && Object.prototype.hasOwnProperty.call(RATES_PER_USD, currency.toUpperCase());
}

function getRate(currency) {
  if (!isSupportedCurrency(currency)) return null;
  return RATES_PER_USD[currency.toUpperCase()];
}

function convertAmount(amount, fromCurrency, toCurrency = BASE_CURRENCY) {
  const value = Number(amount);
  const fromRate = getRate(fromCurrency);
  const toRate = getRate(toCurrency);
  if (!Number.isFinite(value) || !fromRate || !toRate) return null;
  return (value / fromRate) * toRate;
}

function roundAmount(value) {
  return value == null ? null : Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizePayload(payload) {
  const normalized = { ...payload };
  const currency = typeof payload.currency === 'string' ? payload.currency.toUpperCase() : '';
  const amount = Number(payload.monthlySpend);
  const budgetRange = BUDGET_RANGES[payload.budget];
  const rate = getRate(currency);

  normalized.currency = currency || payload.currency || '';
  normalized.budgetCurrency = currency || payload.currency || '';
  normalized.currencyRateVersion = RATE_VERSION;
  normalized.currencyConversionDate = new Date().toISOString().slice(0, 10);
  normalized.currencyConversionBase = BASE_CURRENCY;

  if (rate && Number.isFinite(amount)) {
    normalized.monthlySpendOriginal = amount;
    normalized.monthlySpendBase = roundAmount(convertAmount(amount, currency));
    normalized.currencyConversionRate = rate;
    normalized.currencyConversionStatus = 'converted';
  } else {
    normalized.monthlySpendOriginal = Number.isFinite(amount) ? amount : null;
    normalized.monthlySpendBase = null;
    normalized.currencyConversionRate = null;
    normalized.currencyConversionStatus = 'unavailable';
  }

  if (rate && budgetRange) {
    normalized.budgetMinBase = roundAmount(convertAmount(budgetRange.min, currency));
    normalized.budgetMaxBase = budgetRange.max == null ? null : roundAmount(convertAmount(budgetRange.max, currency));
  } else {
    normalized.budgetMinBase = null;
    normalized.budgetMaxBase = null;
  }

  return normalized;
}

function convertFromBase(amount, currency) {
  return roundAmount(convertAmount(amount, BASE_CURRENCY, currency));
}

module.exports = {
  BASE_CURRENCY,
  RATE_VERSION,
  RATES_PER_USD,
  BUDGET_RANGES,
  convertAmount,
  convertFromBase,
  getRate,
  isSupportedCurrency,
  normalizePayload,
  roundAmount
};
