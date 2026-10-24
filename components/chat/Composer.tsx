'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function Composer({
  disabled,
  onSend,
  prefill,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
  /** text dropped into the box by another part of the app (the Settle
   *  buttons on /money); the user edits and sends it themselves */
  prefill?: { text: string; at: number } | null;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !prefill?.text) return;
    el.value = prefill.text;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [prefill]);

  function submit() {
    const el = textareaRef.current;
    if (!el) return;
    const value = el.value;
    if (!value.trim() || disabled) return;
    onSend(value);
    el.value = '';
    el.style.height = 'auto';
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  return (
    <div className="flex items-end gap-2 border-t bg-background p-2.5">
      <Textarea
        ref={textareaRef}
        placeholder="Ask LifeOS anything…"
        rows={1}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        className="min-h-11 max-h-40 flex-1 resize-none py-2.5"
      />
      <Button
        type="button"
        size="icon"
        disabled={disabled}
        onClick={submit}
        aria-label="Send message"
        className="h-11 w-11 shrink-0"
      >
        <SendHorizontal className="size-4" />
      </Button>
    </div>
  );
}

export default Composer;
