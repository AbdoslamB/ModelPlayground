const formatters = new Map<number, Intl.NumberFormat>();

function formatter(decimals: number): Intl.NumberFormat {
  let found = formatters.get(decimals);
  if (!found) {
    found = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, found);
  }
  return found;
}

/**
 * Formats a number for display: fixed decimals, thousands separators, the true
 * minus sign (−), and never "−0" (a value that rounds to zero shows as 0).
 */
export function formatNumber(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  const safe = rounded === 0 ? 0 : rounded;
  return formatter(decimals).format(safe).replace('-', '−');
}

/** The number of decimals a slider step needs: 0.5 → 1, 0.05 → 2, 1 → 0. */
export function decimalsForStep(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** Rounds to the nearest multiple of `step`, without floating-point tails. */
export function snap(value: number, step: number): number {
  const decimals = decimalsForStep(step);
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
