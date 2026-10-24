'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  updateTimesAction,
  createAccountAction,
  archiveAccountAction,
  createCategoryAction,
} from '@/app/actions/settings';
import type { Account, AppConfig, Category } from '@/lib/types/db';

/** Strips any seconds component so <input type="time"> is happy with 'HH:MM'. */
function toInputTime(value: string): string {
  return value.slice(0, 5);
}

export function SettingsForm({ config }: { config: AppConfig }) {
  const [morning, setMorning] = useState(toInputTime(config.morning_time));
  const [night, setNight] = useState(toInputTime(config.night_time));
  const [pushEnabled, setPushEnabled] = useState(config.push_enabled);
  const [estimate, setEstimate] = useState(String(config.default_estimate_min));
  const [pending, startTransition] = useTransition();

  const save = () => {
    const minutes = Number.parseInt(estimate, 10);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      toast.error('Default estimate must be a positive number of minutes.');
      return;
    }
    startTransition(async () => {
      const res = await updateTimesAction({
        morning_time: morning,
        night_time: night,
        push_enabled: pushEnabled,
        default_estimate_min: minutes,
      });
      if (res.ok) toast.success('Settings saved.');
      else toast.error(`Could not save: ${res.error}`);
    });
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="morning_time">Morning plan time</Label>
          <Input id="morning_time" type="time" value={morning} onChange={(e) => setMorning(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="night_time">Nightly review time</Label>
          <Input id="night_time" type="time" value={night} onChange={(e) => setNight(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="default_estimate_min">Default task estimate (minutes)</Label>
          <Input
            id="default_estimate_min"
            type="number"
            min={1}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <Label htmlFor="push_enabled">Push notifications on</Label>
          <Switch id="push_enabled" checked={pushEnabled} onCheckedChange={setPushEnabled} />
        </div>
      </div>
      <div>
        <Button onClick={save} disabled={pending}>
          Save
        </Button>
      </div>
    </div>
  );
}

export function AccountsPanel({ accounts }: { accounts: Account[] }) {
  const [list, setList] = useState(accounts);
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('0');
  const [isDefault, setIsDefault] = useState(false);
  const [pending, startTransition] = useTransition();

  const add = () => {
    if (!name.trim()) {
      toast.error('Account name is required.');
      return;
    }
    const balance = Number.parseFloat(opening);
    startTransition(async () => {
      const res = await createAccountAction({
        name: name.trim(),
        opening_balance: Number.isFinite(balance) ? balance : 0,
        is_default: isDefault,
      });
      if (res.ok) {
        setList((prev) => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
        setName('');
        setOpening('0');
        setIsDefault(false);
        toast.success(`Account "${res.data.name}" added.`);
      } else {
        toast.error(`Could not add account: ${res.error}`);
      }
    });
  };

  const archive = (id: string) => {
    startTransition(async () => {
      const res = await archiveAccountAction(id);
      if (res.ok) {
        setList((prev) => prev.filter((a) => a.id !== id));
        toast.success('Account archived.');
      } else {
        toast.error(`Could not archive account: ${res.error}`);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul className="flex flex-col gap-1">
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">No accounts yet.</p>
        ) : (
          list.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <span>
                {a.name} {a.is_default ? <span className="text-xs text-muted-foreground">(default)</span> : null}
              </span>
              <Button variant="ghost" size="sm" onClick={() => archive(a.id)} disabled={pending}>
                Archive
              </Button>
            </li>
          ))
        )}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account_name">Name</Label>
          <Input id="account_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="HDFC" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account_opening">Opening balance</Label>
          <Input
            id="account_opening"
            type="number"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            className="w-32"
          />
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          <Checkbox id="account_default" checked={isDefault} onCheckedChange={(c) => setIsDefault(c === true)} />
          <Label htmlFor="account_default">Default</Label>
        </div>
        <Button onClick={add} disabled={pending}>
          Add account
        </Button>
      </div>
    </div>
  );
}

export function CategoriesPanel({ categories }: { categories: Category[] }) {
  const [list, setList] = useState(categories);
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();

  const add = () => {
    if (!name.trim()) {
      toast.error('Category name is required.');
      return;
    }
    startTransition(async () => {
      const res = await createCategoryAction(name.trim());
      if (res.ok) {
        setList((prev) => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
        setName('');
        toast.success(`Category "${res.data.name}" added.`);
      } else {
        toast.error(`Could not add category: ${res.error}`);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap gap-2">
        {list.map((c) => (
          <span key={c.id} className="rounded-full border px-2.5 py-1 text-xs">
            {c.name}
          </span>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category_name">New category</Label>
          <Input id="category_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Travel" />
        </div>
        <Button onClick={add} disabled={pending}>
          Add category
        </Button>
      </div>
    </div>
  );
}

export default SettingsForm;
