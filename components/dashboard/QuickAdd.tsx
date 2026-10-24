'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PageContext } from '@/lib/types/db';

const PAGE_CONTEXT: PageContext = { route: '/', entity_type: 'none' };

/** Dashboard header input that hands text straight to the chat agent. */
export function QuickAdd() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, page_context: PAGE_CONTEXT }),
      });
      if (!res.ok) {
        toast.error("Couldn't reach the assistant yet.");
        return;
      }
      const data = (await res.json()) as { reply?: string };
      toast.success(data.reply ?? 'Done.');
      window.dispatchEvent(new Event('lifeos:changed'));
      setValue('');
    } catch {
      toast.error("Couldn't reach the assistant yet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto sm:min-w-80">
      <Input
        value={value}
        placeholder="Quick add… e.g. task call the vendor tomorrow 4pm"
        className="h-9 flex-1"
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <Button size="sm" onClick={submit} disabled={busy}>
        Add
      </Button>
      <Button
        size="icon-sm"
        variant="outline"
        aria-label="Open chat"
        onClick={() => window.dispatchEvent(new CustomEvent('lifeos:chat:open'))}
      >
        💬
      </Button>
    </div>
  );
}

export default QuickAdd;
