'use client';

import { useState, useTransition } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { completedDailyAction } from '@/app/actions/analytics';
import type { CompletedDailyRow } from '@/lib/types/db';
import { CompletedPerDay } from './CompletedPerDay';
import { EffortByArea, type AreaWithColor } from './EffortByArea';

type Props = {
  initialDays: 30 | 90;
  initialRows: CompletedDailyRow[];
  areas: AreaWithColor[];
};

/** 30 / 90 day toggle for the "completed per day" and "effort by area"
 *  charts. First render comes from the server; switching ranges refetches
 *  through the server action. */
export function RangeTabs({ initialDays, initialRows, areas }: Props) {
  const [days, setDays] = useState<30 | 90>(initialDays);
  const [rows, setRows] = useState<CompletedDailyRow[]>(initialRows);
  const [isPending, startTransition] = useTransition();

  function onChange(value: unknown) {
    const next = String(value) === '90' ? 90 : 30;
    setDays(next);
    startTransition(async () => {
      const res = await completedDailyAction(next);
      if (res.ok) setRows(res.data);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs value={String(days)} onValueChange={onChange}>
          <TabsList>
            <TabsTrigger value="30">30 days</TabsTrigger>
            <TabsTrigger value="90">90 days</TabsTrigger>
          </TabsList>
        </Tabs>
        {isPending && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Tasks completed per day</h3>
          <CompletedPerDay rows={rows} />
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Effort per day by Area</h3>
          <EffortByArea rows={rows} areas={areas} />
        </div>
      </div>
    </div>
  );
}

export default RangeTabs;
