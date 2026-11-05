// Pure formatting shared by server and client components. No server-only
// import, so `'use client'` files can use it too.

/**
 * '₹22K', '₹22.48K', '₹4.17L', '₹2.13Cr': Indian short form for tight spaces (thousand, lakh, crore). Under a thousand it
 * is the plain amount; trailing zeros are dropped.
 */
export function formatINRCompact(amount: number): string {
  const a = Math.abs(amount);
  if (a < 1000) return formatINR(amount);
  const [div, unit] = a >= 1e7 ? [1e7, 'Cr'] : a >= 1e5 ? [1e5, 'L'] : [1e3, 'K'];
  let v = Math.round((a / div) * 100) / 100;
  let u = unit;
  if (v >= 100 && unit === 'K') { v = Math.round((a / 1e5) * 100) / 100; u = 'L'; } // 99,999.6 rounds up to a lakh
  if (v >= 100 && unit === 'L') { v = Math.round((a / 1e7) * 100) / 100; u = 'Cr'; }
  return `${amount < 0 ? '-' : ''}₹${String(v)}${u}`;
}

/** '₹1,200' — Indian digit grouping, decimals only when they matter. */
export function formatINR(amount: number): string {
  const n = Math.round(amount * 100) / 100;
  const s = Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}₹${s}`;
}
