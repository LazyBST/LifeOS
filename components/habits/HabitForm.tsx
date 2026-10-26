'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClearableInput } from '@/components/ui/clearable-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createHabitAction, updateHabitAction } from '@/app/actions/habits';
import type { Area, Habit, TimeOfDay } from '@/lib/types/db';

const TIME_OF_DAY_OPTIONS: { value: TimeOfDay; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'any', label: 'No type' },
];

const DOW_LABELS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

type FormState = {
  name: string;
  emoji: string;
  time_of_day: TimeOfDay;
  kind: 'boolean' | 'count';
  target_value: string;
  unit: string;
  days_of_week: number[];
  reminder_time: string;
  start_time: string;
  end_time: string;
  gtask_title: string;
  area_id: string | null;
};

function toState(habit?: Habit | null): FormState {
  return {
    name: habit?.name ?? '',
    emoji: habit?.emoji ?? '',
    time_of_day: habit?.time_of_day ?? 'any',
    kind: habit?.kind ?? 'boolean',
    target_value: String(habit?.target_value ?? 1),
    unit: habit?.unit ?? '',
    days_of_week: habit?.days_of_week ?? [],
    reminder_time: habit?.reminder_time?.slice(0, 5) ?? '',
    start_time: habit?.start_time?.slice(0, 5) ?? '',
    end_time: habit?.end_time?.slice(0, 5) ?? '',
    gtask_title: habit?.gtask_title ?? '',
    area_id: habit?.area_id ?? null,
  };
}

type HabitFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  habit?: Habit | null;
  areas: Area[];
  onSaved: (habit: Habit) => void;
};

/** Add/edit dialog for a habit. */
export function HabitForm({ open, onOpenChange, mode, habit, areas, onSaved }: HabitFormProps) {
  const [state, setState] = useState<FormState>(() => toState(habit));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setState(toState(habit));
  }, [open, habit]);

  function toggleDow(d: number) {
    setState((s) => ({
      ...s,
      days_of_week: s.days_of_week.includes(d) ? s.days_of_week.filter((x) => x !== d) : [...s.days_of_week, d].sort(),
    }));
  }

  async function submit() {
    const name = state.name.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    const input = {
      name,
      emoji: state.emoji.trim() || null,
      time_of_day: state.time_of_day,
      kind: state.kind,
      target_value: state.kind === 'boolean' ? 1 : Number(state.target_value) || 1,
      unit: state.kind === 'count' ? state.unit.trim() || null : null,
      days_of_week: state.days_of_week.length ? state.days_of_week : null,
      reminder_time: state.reminder_time || null,
      start_time: state.start_time || null,
      end_time: state.end_time || null,
      gtask_title: state.gtask_title.trim() || null,
      area_id: state.area_id,
    };
    const res =
      mode === 'create'
        ? await createHabitAction(input)
        : await updateHabitAction(habit!.id, input);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || 'Could not save habit');
      return;
    }
    toast.success(mode === 'create' ? 'Habit added' : 'Habit updated');
    onSaved(res.data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add habit' : 'Edit habit'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="w-16 space-y-1">
              <Label>Emoji</Label>
              <Input
                value={state.emoji}
                onChange={(e) => setState((s) => ({ ...s, emoji: e.target.value }))}
                placeholder="🏃"
                className="text-center"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label>Name</Label>
              <Input
                autoFocus
                value={state.name}
                onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                placeholder="Read"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label>Time of day</Label>
              <Select
                value={state.time_of_day}
                onValueChange={(v) => setState((s) => ({ ...s, time_of_day: v as TimeOfDay }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OF_DAY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label>Kind</Label>
              <Select
                value={state.kind}
                onValueChange={(v) => setState((s) => ({ ...s, kind: v as 'boolean' | 'count' }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="boolean">Tick (yes/no)</SelectItem>
                  <SelectItem value="count">Count</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {state.kind === 'count' && (
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label>Target</Label>
                <Input
                  type="number"
                  value={state.target_value}
                  onChange={(e) => setState((s) => ({ ...s, target_value: e.target.value }))}
                  placeholder="20"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label>Unit</Label>
                <Input
                  value={state.unit}
                  onChange={(e) => setState((s) => ({ ...s, unit: e.target.value }))}
                  placeholder="pages"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Days of week (none = every day)</Label>
            <div className="flex flex-wrap gap-1.5">
              {DOW_LABELS.map((d) => {
                const active = state.days_of_week.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDow(d.value)}
                    className={`h-8 min-w-9 rounded-md border px-2 text-xs font-medium transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-transparent text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Starts</Label>
              <ClearableInput wrapperClassName="w-full" type="time" value={state.start_time} onChange={(e) => setState((s) => ({ ...s, start_time: e.target.value }))} onClear={() => setState((s) => ({ ...s, start_time: '', end_time: '' }))} clearLabel="Remove the start time" />
            </div>
            <div className="space-y-1">
              <Label>Ends</Label>
              <ClearableInput wrapperClassName="w-full" type="time" value={state.end_time} onChange={(e) => setState((s) => ({ ...s, end_time: e.target.value }))} onClear={() => setState((s) => ({ ...s, end_time: '' }))} clearLabel="Remove the end time" />
            </div>
            <p className="col-span-2 -mt-1 text-xs text-muted-foreground">Gives the habit a block on the day view. Leave empty for “any time”.</p>
          </div>

          <div className="space-y-1">
            <Label>Google Task title</Label>
            <Input placeholder="Only if it differs from the name" value={state.gtask_title} onChange={(e) => setState((s) => ({ ...s, gtask_title: e.target.value }))} />
            <p className="text-xs text-muted-foreground">A Google Task with this title (or the habit’s name) checks this habit in when you complete it.</p>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label>Reminder time</Label>
              <ClearableInput
                wrapperClassName="w-full"
                type="time"
                value={state.reminder_time}
                onChange={(e) => setState((s) => ({ ...s, reminder_time: e.target.value }))}
                onClear={() => setState((s) => ({ ...s, reminder_time: '' }))}
                clearLabel="Remove the reminder time"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label>Area</Label>
              <Select
                value={state.area_id ?? '__none__'}
                onValueChange={(v) => setState((s) => ({ ...s, area_id: v === '__none__' ? null : v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving}>
            {mode === 'create' ? 'Add habit' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default HabitForm;
