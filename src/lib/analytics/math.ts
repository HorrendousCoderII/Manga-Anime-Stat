export const mean = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

/** Population standard deviation: the spread of the titles actually on the list, not a sample estimate. */
export function stdDev(values: number[]): number | null {
  const m = mean(values);
  if (m === null) return null;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length);
}

/** Quantile with linear interpolation between closest ranks (same as NumPy's default). */
export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function pearson(xs: number[], ys: number[]): number | null {
  const mx = mean(xs);
  const my = mean(ys);
  if (mx === null || my === null || xs.length < 2) return null;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

export const round = (n: number | null, digits = 2): number | null =>
  n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits;
