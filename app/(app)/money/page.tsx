import Link from 'next/link';
import { SetPageContext } from '@/components/chat/page-context';
import { WalletSummary } from '@/components/money/WalletSummary';
import { AddTransactionForm } from '@/components/money/AddTransactionForm';
import { AccountsPanel } from '@/components/money/AccountsPanel';
import { TransactionList, type TransactionRow } from '@/components/money/TransactionList';
import {
  accountBalances,
  listAccounts,
  listCategories,
  listTransactions,
  owedByLabel,
  spendByCategory,
  wallet,
} from '@/lib/domain/money';
import { istDate, formatDate } from '@/lib/time';
import { formatINR } from '@/lib/format';
import { WidgetGrid, type GridItem } from '@/components/widgets/WidgetGrid';
import { WidgetCard } from '@/components/dashboard/WidgetCard';
import { Gauge } from '@/components/money/Gauge';
import { BalanceTrend, CategoryDonut, DailyBars, ForecastChart, MonthlyBars, PeriodComparison } from '@/components/money/MoneyCharts';
import { BudgetsCard } from '@/components/money/BudgetsCard';
import { ScheduledCard } from '@/components/money/ScheduledCard';
import { budgetStatus } from '@/lib/domain/budgeting';
import { moneyInsights } from '@/lib/domain/money-insights';
import { getOrder } from '@/lib/domain/order';
import { getUiState } from '@/lib/domain/uistate';
import type { ResponsiveLayouts } from 'react-grid-layout';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthRange(offset: number) {
  const today = istDate();
  const [y, m] = today.split('-').map(Number);
  let year = y;
  let month = m - 1 + offset; // 0-based
  while (month < 0) {
    month += 12;
    year -= 1;
  }
  while (month > 11) {
    month -= 12;
    year += 1;
  }
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to, label: `${MONTH_NAMES[month]} ${year}` };
}

type MoneyPageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function MoneyPage({ searchParams }: MoneyPageProps) {
  const sp = await searchParams;
  const offset = sp.month === 'last' ? -1 : 0;
  const { from, to, label } = monthRange(offset);

  const budgetOrder = await getOrder('money-budgets');
  const [w, owed, balances, accounts, categories, spend, transactions, insights, budgets, savedLayout, prevSpend] = await Promise.all([
    wallet(),
    owedByLabel(),
    accountBalances(),
    listAccounts(),
    listCategories(),
    spendByCategory(from, to),
    listTransactions({ from, to, limit: 500 }),
    moneyInsights(from),
    budgetStatus(from, to),
    getUiState<ResponsiveLayouts>('money-layout').catch(() => null),
    spendByCategory(monthRange(offset - 1).from, monthRange(offset - 1).to),
  ]);

  const activeAccountIds = new Set(accounts.map((a) => a.id));
  const visibleBalances = balances.filter((b) => activeAccountIds.has(b.id));

  const catById = new Map(categories.map((c) => [c.id, c.name]));
  const accById = new Map(accounts.map((a) => [a.id, a.name]));
  const rows: TransactionRow[] = transactions.map((t) => ({
    ...t,
    category_name: t.category_id ? catById.get(t.category_id) ?? null : null,
    account_name: t.account_id ? accById.get(t.account_id) ?? null : null,
  }));

  const pos = 'text-emerald-600 dark:text-emerald-400', neg = 'text-red-600 dark:text-red-400';
  const pct = (n: number | null, goodWhenUp: boolean) => n === null ? null : (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${(n >= 0) === goodWhenUp ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'}`}>{n >= 0 ? '↗' : '↘'} {Math.abs(n)}%</span>
  );
  const net = insights.income - insights.expense;
  const maxFlow = Math.max(1, insights.income, insights.expense, insights.prevIncome, insights.prevExpense);
  const f = insights.forecast;
  const at = (n: number) => f[Math.min(n, f.length - 1)];
  const low = f.reduce((m, p) => (p.expected < m.expected ? p : m), f[0]);
  const prevLabel = monthRange(offset - 1).label;

  // the speedometers: where the needle sits is 0 (left) to 1 (right)
  const peak = Math.max(1, ...insights.balanceTrend.map((x) => x.balance), insights.balanceNow);
  const flowMax = Math.max(1, insights.income, insights.expense);
  const totalBudget = budgets.rows.reduce((s2, r) => s2 + (r.budget ?? 0), 0);
  const spendRef = totalBudget > 0 ? totalBudget : insights.prevExpense;
  const saving = insights.income > 0 ? (insights.income - insights.expense) / insights.income : 0;
  const MiniStat = ({ label: l, value, bad }: { label: string; value: string; bad?: boolean }) => (
    <div className="rounded-xl bg-muted/50 px-3 py-2"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{l}</div><div className={`text-base font-bold tracking-tight ${bad ? neg : ''}`}>{value}</div></div>
  );
  const topExpenses = rows.filter((r) => r.kind === 'expense').sort((x, y) => Number(y.my_share ?? y.amount) - Number(x.my_share ?? x.amount)).slice(0, 6);
  const chartBody = 'flex flex-col';

  const items: GridItem[] = [
    { id: 'gauges', w: 8, h: 8, minW: 4, minH: 6, node: (
      <WidgetCard title="At a glance" sub={label}>
        <div className="flex flex-wrap items-start justify-around gap-x-2 gap-y-4 pt-1">
          <Gauge label="Balance" position={insights.balanceNow / (peak * 1.1)} value={formatINR(insights.balanceNow)} hint={`peak ${formatINR(peak)}`} />
          <Gauge label="Cash flow" position={0.5 + (0.5 * net) / flowMax} value={formatINR(net)} hint={net >= 0 ? 'more in than out' : 'more out than in'} />
          <Gauge label="Spending" invert position={spendRef > 0 ? insights.expense / spendRef : insights.expense > 0 ? 1 : 0} value={formatINR(insights.expense)} hint={spendRef > 0 ? `${totalBudget > 0 ? 'budget' : 'last period'} ${formatINR(spendRef)}` : 'nothing to compare'} />
          <Gauge label="Saved" position={Math.max(0, saving)} value={`${Math.round(saving * 100)}%`} hint="of income kept" />
        </div>
      </WidgetCard>
    ) },
    { id: 'overview', w: 4, h: 8, minW: 3, minH: 6, node: (
      <WidgetCard title="Wallet" sub="Balances and who owes what">
        <WalletSummary wallet={w} owed={owed} />
        <div className="mt-3 border-t pt-3"><AccountsPanel balances={visibleBalances} /></div>
      </WidgetCard>
    ) },
    { id: 'cashflow', w: 6, h: 8, minW: 3, minH: 7, node: (
      <WidgetCard title="Cash flow" sub={`${label} vs previous period`}>
        <div><div className="text-xs text-muted-foreground">Net</div><div className={`text-2xl font-bold tracking-tight ${net >= 0 ? pos : neg}`}>{formatINR(net)}</div></div>
        <div className="mt-4 space-y-4 text-sm">
          {([['Income', insights.income, insights.prevIncome, insights.incomePct, true, 'bg-emerald-500'], ['Expense', insights.expense, insights.prevExpense, insights.expensePct, false, 'bg-red-500']] as const).map(([name, now, before, change, up, color]) => (
            <div key={name}>
              <div className="mb-1 flex items-center justify-between"><span>{name}</span><span className="flex items-center gap-2">{pct(change, up)}<b>{formatINR(now)}</b></span></div>
              <div className="relative h-3 rounded-full bg-muted">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${(now / maxFlow) * 100}%` }} />
                <div className="absolute -top-1 h-5 w-0.5 rounded bg-foreground/70" style={{ left: `calc(${(before / maxFlow) * 100}% - 1px)` }} title={`Previous period: ${formatINR(before)}`} />
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">Previous period {formatINR(before)} <span className="text-foreground/70">(the line)</span></div>
            </div>
          ))}
        </div>
      </WidgetCard>
    ) },
    { id: 'balance', w: 6, h: 8, minW: 3, minH: 7, node: (
      <WidgetCard bodyClassName={chartBody} title="Balance trend" sub={`${label}${insights.prevBalanceEnd !== null ? ` · ${formatINR(insights.prevBalanceEnd)} at the end of the previous month` : ''}`}>
        <div className="mb-1 text-2xl font-bold tracking-tight">{formatINR(insights.balanceNow)}</div>
        <BalanceTrend points={insights.balanceTrend} />
      </WidgetCard>
    ) },
    { id: 'monthly', w: 6, h: 10, minW: 4, minH: 8, node: (
      <WidgetCard bodyClassName={chartBody} title="Last 6 months" sub="Income, expense and net"><MonthlyBars rows={insights.monthly} /></WidgetCard>
    ) },
    { id: 'categories', w: 6, h: 10, minW: 4, minH: 7, node: <WidgetCard title="Spending by category" sub={`${label} · change vs previous period`}><CategoryDonut rows={spend} previous={prevSpend} /></WidgetCard> },
    { id: 'period', w: 6, h: 10, minW: 4, minH: 8, node: (
      <WidgetCard bodyClassName={chartBody} title="Period to period comparison" sub="Running total by day"><PeriodComparison {...insights.comparison} currentLabel={label} previousLabel={prevLabel} /></WidgetCard>
    ) },
    { id: 'daily', w: 6, h: 10, minW: 4, minH: 8, node: (
      <WidgetCard bodyClassName={chartBody} title="Daily spending" sub={`${label} · my share`}><DailyBars rows={insights.daily} /></WidgetCard>
    ) },
    { id: 'forecast', w: 8, h: 13, minW: 5, minH: 10, node: (
      <WidgetCard bodyClassName={chartBody} title="Forecast" sub="Next 90 days, from your scheduled payments and usual spending">
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="In 30 days" value={formatINR(at(30).expected)} bad={at(30).expected < 0} />
          <MiniStat label="In 60 days" value={formatINR(at(60).expected)} bad={at(60).expected < 0} />
          <MiniStat label="In 90 days" value={formatINR(at(90).expected)} bad={at(90).expected < 0} />
          <MiniStat label={`Lowest · ${formatDate(low.date)}`} value={formatINR(low.expected)} bad={low.expected < 0} />
        </div>
        <ForecastChart points={f} />
        <p className="mt-1 text-xs text-muted-foreground">Usual spending is {formatINR(insights.dailySpend)} a day (last 60 days, without payments you have scheduled).</p>
      </WidgetCard>
    ) },
    { id: 'upcoming', w: 4, h: 13, minW: 3, minH: 8, node: (
      <WidgetCard title="Scheduled payments" sub="Next 60 days">
        <ScheduledCard items={insights.upcoming} categories={categories} accounts={accounts} ready={insights.scheduledReady} />
      </WidgetCard>
    ) },
    { id: 'budgets', w: 4, h: 12, minW: 3, minH: 8, node: (
      <WidgetCard title="Budgets" sub={`Monthly, ${label}`}>
        <BudgetsCard rows={budgets.rows} categories={categories} ready={budgets.ready} order={budgetOrder} />
      </WidgetCard>
    ) },
    { id: 'top', w: 4, h: 12, minW: 3, minH: 6, node: (
      <WidgetCard title="Biggest expenses" sub={label}>
        {topExpenses.length === 0 ? <p className="text-sm text-muted-foreground">No expenses yet.</p> : (
          <ul className="divide-y">
            {topExpenses.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{t.description || t.category_name || 'Expense'}</div><div className="text-xs text-muted-foreground">{formatDate(t.occurred_on)}{t.category_name ? ` · ${t.category_name}` : ''}</div></div>
                <b className="shrink-0">{formatINR(Number(t.my_share ?? t.amount))}</b>
              </li>
            ))}
          </ul>
        )}
      </WidgetCard>
    ) },
    { id: 'add', w: 4, h: 12, minW: 3, minH: 8, node: <WidgetCard title="Add a record"><AddTransactionForm categories={categories} accounts={accounts} /></WidgetCard> },
    { id: 'records', w: 12, h: 13, minW: 4, minH: 6, node: <WidgetCard title={`Transactions — ${label}`} sub="Click anything to edit it right here" right={<Link href="/money/transactions" className="rounded-md border px-2 py-1 text-xs hover:bg-muted" title="Open all transactions with filters">Expand ⤢</Link>}><TransactionList transactions={rows} categories={categories.map((c) => ({ id: c.id, name: c.name }))} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} /></WidgetCard> },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <SetPageContext ctx={{ route: '/money', entity_type: 'none' }} />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Money</h1>
        <div className="flex items-center gap-2">
        <Link href="/money/transactions" className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">All transactions →</Link>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-sm">
          <Link href="/money?month=this" className={`rounded-md px-3 py-1.5 ${offset === 0 ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}>This month</Link>
          <Link href="/money?month=last" className={`rounded-md px-3 py-1.5 ${offset === -1 ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}>Last month</Link>
        </div>
        </div>
      </div>
      <WidgetGrid items={items} layoutKey="money-layout" initial={savedLayout} />
    </div>
  );
}
