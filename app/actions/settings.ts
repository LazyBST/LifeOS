'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { updateConfig } from '@/lib/domain/config';
import { notify } from '@/lib/notify';
import { type ActionResult, run } from './_result';
import type { Account, AppConfig, Category, PushSubscriptionRow } from '@/lib/types/db';

export type TimesInput = {
  morning_time: string;
  night_time: string;
  push_enabled: boolean;
  default_estimate_min: number;
  timezone?: string;
};

export async function updateTimesAction(input: TimesInput): Promise<ActionResult<AppConfig>> {
  return run(async () => {
    await requireUser();
    const patch: Partial<AppConfig> = {
      morning_time: input.morning_time,
      night_time: input.night_time,
      push_enabled: input.push_enabled,
      default_estimate_min: input.default_estimate_min,
    };
    if (input.timezone) patch.timezone = input.timezone;
    const cfg = await updateConfig(patch);
    revalidatePath('/settings');
    return cfg;
  });
}

export async function sendTestNotificationAction(): Promise<ActionResult<string>> {
  return run(async () => {
    await requireUser();
    const res = await notify({
      title: 'LifeOS test',
      body: 'If you can see this with the app closed, reminders will work.',
      tag: 'test',
      url: '/',
      bypassQuietHours: true,
    });
    return res.push;
  });
}

export async function listPushDevicesAction(): Promise<ActionResult<PushSubscriptionRow[]>> {
  return run(async () => {
    await requireUser();
    const { data, error } = await admin()
      .from('push_subscriptions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`push_subscriptions: ${error.message}`);
    return (data ?? []) as PushSubscriptionRow[];
  });
}

export async function removePushDeviceAction(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    const { error } = await admin().from('push_subscriptions').delete().eq('id', id);
    if (error) throw new Error(`push_subscriptions: ${error.message}`);
    revalidatePath('/settings');
    return null;
  });
}

// --- Accounts and categories (money tables from migration 0002; the money
// UI itself is Part 3, but settings needs basic add/list/archive). ---

export async function listAccountsAction(): Promise<ActionResult<Account[]>> {
  return run(async () => {
    await requireUser();
    try {
      const { data, error } = await admin()
        .from('accounts')
        .select('*')
        .is('archived_at', null)
        .order('name', { ascending: true });
      if (error) throw new Error(`accounts: ${error.message}`);
      return (data ?? []) as Account[];
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  });
}

export type CreateAccountInput = { name: string; opening_balance: number; is_default: boolean };

export async function createAccountAction(input: CreateAccountInput): Promise<ActionResult<Account>> {
  return run(async () => {
    await requireUser();
    try {
      const { data, error } = await admin()
        .from('accounts')
        .insert({
          name: input.name,
          opening_balance: input.opening_balance,
          is_default: input.is_default,
        })
        .select('*')
        .single();
      if (error) throw new Error(`accounts: ${error.message}`);
      revalidatePath('/settings');
      return data as Account;
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  });
}

export async function archiveAccountAction(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    try {
      const { error } = await admin()
        .from('accounts')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`accounts: ${error.message}`);
      revalidatePath('/settings');
      return null;
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  });
}

export async function listCategoriesAction(): Promise<ActionResult<Category[]>> {
  return run(async () => {
    await requireUser();
    try {
      const { data, error } = await admin().from('categories').select('*').order('name', { ascending: true });
      if (error) throw new Error(`categories: ${error.message}`);
      return (data ?? []) as Category[];
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  });
}

export async function createCategoryAction(name: string): Promise<ActionResult<Category>> {
  return run(async () => {
    await requireUser();
    try {
      const { data, error } = await admin().from('categories').insert({ name }).select('*').single();
      if (error) throw new Error(`categories: ${error.message}`);
      revalidatePath('/settings');
      return data as Category;
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  });
}
