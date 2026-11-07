// Splitting one payment into several parts (say a ₹1,200 Zomato bill into food ₹900 and a gift ₹300). Pure.
export type SplitPart = { amount: number; description?: string | null; category_id?: string | null; labels?: string[] };

const cents = (n: number) => Math.round(n * 100);
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** What is still unassigned (negative when the parts add up to more than the payment). */
export const splitRemainder = (total: number, amounts: number[]) => round2(total - amounts.reduce((s, a) => s + (Number.isFinite(a) ? a : 0), 0));

/** null when the split is fine, otherwise what is wrong, in words. */
export function splitProblem(total: number, amounts: number[]): string | null {
  if (amounts.length < 2) return 'A split needs at least two parts.';
  if (amounts.some((a) => !Number.isFinite(a) || a <= 0)) return 'Every part needs an amount above zero.';
  const sum = amounts.reduce((s, a) => s + cents(a), 0);
  if (sum !== cents(total)) return sum < cents(total) ? `₹${round2(total - sum / 100)} is still unassigned.` : `The parts are ₹${round2(sum / 100 - total)} over the total.`;
  return null;
}

/** My share of each part when the payment had someone else's share in it: kept in the same proportion, to the paisa. */
export function splitShares(total: number, share: number, amounts: number[]): number[] {
  if (total <= 0 || share >= total) return amounts.map(round2);
  let left = cents(share);
  return amounts.map((a, i) => {
    const part = i === amounts.length - 1 ? left : Math.round((cents(a) * cents(share)) / cents(total));
    left -= part;
    return part / 100;
  });
}
