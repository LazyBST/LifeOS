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
import { StatTiles } from '@/components/analytics/Insights';
import { BalanceTrend, CategoryDonut, ForecastChart, PeriodComparison } from '@/components/money/MoneyCharts';
import { BudgetsCard } from '@/components/money/BudgetsCard';
import { ScheduledCard } from '@/components/money/ScheduledCard';
import { budgetStatus } from '@/lib/domain/budgeting';
import { moneyInsights } from '@/lib/domain/money-insights';
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

  const items: GridItem[] = [
    { id: 'overview', w: 12, h: 5, minW: 4, minH: 4, node: (
      <WidgetCard title="Overview" sub={label}><WalletSummary wallet={w} owed={owed} /></WidgetCard>
    ) },
    { id: 'cashflow', w: 4, h: 11, minW: 3, minH: 8, node: (
      <WidgetCard title="Cash flow" sub={`${label} vs previous period`}>
        <div className="flex items-start justify-between">
          <div><div className="text-xs text-muted-foreground">Net</div><div className={`text-2xl font-bold tracking-tight ${net >= 0 ? pos : neg}`}>{formatINR(net)}</div></div>
        </div>
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
    { id: 'accounts', w: 4, h: 11, minW: 3, minH: 6, node: <WidgetCard title="Accounts"><AccountsPanel balances={visibleBalances} /></WidgetCard> },
    { id: 'balance', w: 4, h: 11, minW: 3, minH: 8, node: (
      <WidgetCard title="Balance trend" sub={`${label}${insights.prevBalanceEnd !== null ? ` · ${formatINR(insights.prevBalanceEnd)} at the end of the previous month` : ''}`}>
        <div className="mb-1 text-2xl font-bold tracking-tight">{formatINR(insights.balanceNow)}</div>
        <BalanceTrend points={insights.balanceTrend} />
      </WidgetCard>
    ) },
    { id: 'period', w: 6, h: 12, minW: 4, minH: 9, node: (
      <WidgetCard title="Period to period comparison" sub="Running total by day"><PeriodComparison {...insights.comparison} currentLabel={label} previousLabel={prevLabel} /></WidgetCard>
    ) },
    { id: 'categories', w: 6, h: 12, minW: 4, minH: 8, node: <WidgetCard title="Spending by category" sub={label}><CategoryDonut rows={spend} previous={prevSpend} /></WidgetCard> },
    { id: 'forecast', w: 8, h: 15, minW: 5, minH: 11, node: (
      <WidgetCard title="Forecast" sub="Next 90 days, from your scheduled payments and usual spending">
        <StatTiles items={[
          { label: 'In 30 days', value: formatINR(at(30).expected), tone: at(30).expected < 0 ? 'bad' : undefined },
          { label: 'In 60 days', value: formatINR(at(60).expected), tone: at(60).expected < 0 ? 'bad' : undefined },
          { label: 'In 90 days', value: formatINR(at(90).expected), tone: at(90).expected < 0 ? 'bad' : undefined },
          { label: 'Lowest point', value: `${formatINR(low.expected)} · ${formatDate(low.date)}`, tone: low.expected < 0 ? 'bad' : undefined },
        ]} />
        <div className="mt-2"><ForecastChart points={f} /></div>
        <p className="mt-1 text-xs text-muted-foreground">Usual spending is {formatINR(insights.dailySpend)} a day (last 60 days, without payments you have scheduled).</p>
      </WidgetCard>
    ) },
    { id: 'upcoming', w: 4, h: 15, minW: 3, minH: 8, node: (
      <WidgetCard title="Scheduled payments" sub="Next 60 days">
        <ScheduledCard items={insights.upcoming} categories={categories} accounts={accounts} ready={insights.scheduledReady} />
      </WidgetCard>
    ) },
    { id: 'budgets', w: 6, h: 14, minW: 4, minH: 8, node: (
      <WidgetCard title="Budgets" sub={`Monthly, ${label}`}>
        <BudgetsCard rows={budgets.rows} categories={categories} ready={budgets.ready} />
      </WidgetCard>
    ) },
    { id: 'add', w: 6, h: 14, minW: 4, minH: 8, node: <WidgetCard title="Add a record"><AddTransactionForm categories={categories} accounts={accounts} /></WidgetCard> },
    { id: 'records', w: 12, h: 14, minW: 4, minH: 6, node: <WidgetCard title={`Transactions — ${label}`}><TransactionList transactions={rows} /></WidgetCard> },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <SetPageContext ctx={{ route: '/money', entity_type: 'none' }} />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Money</h1>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-sm">
          <Link href="/money?month=this" className={`rounded-md px-3 py-1.5 ${offset === 0 ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}>This month</Link>
          <Link href="/money?month=last" className={`rounded-md px-3 py-1.5 ${offset === -1 ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}>Last month</Link>
        </div>
      </div>
      <WidgetGrid items={items} layoutKey="money-layout" initial={savedLayout} />
    </div>
  );
}
