import Link from 'next/link';
import { moneyTrend } from '@/lib/domain/trends';
import { wallet } from '@/lib/domain/money';
import { formatINR } from '@/lib/format';
import { WidgetCard } from './WidgetCard';
import { TrendChart } from './TrendChart';

export async function MoneyWidget() {
  const [t, w] = await Promise.all([moneyTrend(12, 3).catch(() => null), wallet().catch(() => null)]);
  const pos = 'text-emerald-600 dark:text-emerald-400', neg = 'text-red-600 dark:text-red-400';
  return (
    <WidgetCard title="Money · account trend" sub="Cash balance by week, with forecast" right={<Link href="/money" className="text-xs text-muted-foreground hover:underline">Open</Link>}>
      {!t ? <p className="text-sm text-muted-foreground">No money data yet.</p> : (
        <>
          <div className="mb-2 grid grid-cols-4 gap-2 text-xs">
            <div><div className="text-muted-foreground">Balance</div><div className="text-sm font-semibold">{formatINR(t.current)}</div></div>
            <div><div className="text-muted-foreground">30 days</div><div className={`text-sm font-semibold ${t.monthChange >= 0 ? pos : neg}`}>{t.monthChange >= 0 ? '+' : ''}{formatINR(t.monthChange)}</div></div>
            <div><div className="text-muted-foreground">Owed to me</div><div className={`text-sm font-semibold ${pos}`}>{formatINR(w?.owed_to_me ?? 0)}</div></div>
            <div><div className="text-muted-foreground">I owe</div><div className={`text-sm font-semibold ${neg}`}>{formatINR(w?.i_owe ?? 0)}</div></div>
          </div>
          <TrendChart weeks={t.weeks} ahead={t.ahead} series={t.series} height={170} format={(n) => `${Math.round(n / 1000)}k`} />
        </>
      )}
    </WidgetCard>
  );
}
