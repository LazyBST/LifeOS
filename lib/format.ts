// Pure formatting shared by server and client components. No server-only
// import, so `'use client'` files can use it too.

/** '₹1,200' — Indian digit grouping, decimals only when they matter. */
export function formatINR(amount: number): string {
  const n = Math.round(amount * 100) / 100;
  const s = Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}₹${s}`;
}
