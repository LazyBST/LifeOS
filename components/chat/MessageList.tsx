'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { ChatBubble } from '@/components/chat/useChat';
import { ToolResultCard } from '@/components/chat/ToolResultCard';
import { CopyButton } from '@/components/chat/CopyButton';

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return '';
  }
}

export function MessageList({
  messages,
  sending,
  onPickOption,
}: {
  messages: ChatBubble[];
  sending: boolean;
  onPickOption: (optionIndex: number) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, sending]);

  return (
    <div className="flex flex-col gap-3 p-3">
      {messages.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Ask me to create a task, check your goals, or plan your day.
        </p>
      ) : null}

      {messages.map((m) => {
        if (m.channel === 'system' || m.role === 'system') {
          return (
            <div key={m.id} className="flex flex-col items-start gap-1">
              <span className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                LifeOS
              </span>
              <div className="group/msg flex max-w-[95%] items-start gap-1">
                <div
                  className={cn(
                    'rounded-lg border border-dashed bg-muted/50 px-3 py-2 text-sm text-foreground whitespace-pre-wrap',
                    m.isError && 'border-destructive/40 text-destructive',
                  )}
                >
                  {m.text}
                </div>
                <CopyButton text={m.text} />
              </div>
            </div>
          );
        }

        const isUser = m.role === 'user';
        return (
          <div key={m.id} className={cn('flex flex-col gap-1.5', isUser ? 'items-end' : 'items-start')}>
            {!isUser ? (
              <span className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                LifeOS
              </span>
            ) : null}
            {m.text ? (
              <div className={cn('group/msg flex max-w-[92%] items-start gap-1', isUser && 'flex-row-reverse')}>
                <div
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
                    isUser
                      ? 'bg-primary text-primary-foreground'
                      : m.isError
                        ? 'border border-destructive/30 bg-destructive/10 text-destructive'
                        : 'bg-muted text-foreground',
                  )}
                >
                  {m.text}
                </div>
                <CopyButton text={m.text} />
              </div>
            ) : null}

            {m.cards && m.cards.length > 0 ? (
              <div className="flex w-full max-w-[85%] flex-col gap-1.5">
                {m.cards.map((card, i) => (
                  <ToolResultCard key={i} card={card} />
                ))}
              </div>
            ) : null}

            {m.pending && m.pending.options.length > 0 ? (
              <div className="flex w-full max-w-[85%] flex-col gap-1">
                {m.pending.options.map((opt, i) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onPickOption(i + 1)}
                    className="touch-target w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:bg-muted/60"
                  >
                    <span className="mr-1.5 font-medium text-muted-foreground">{i + 1}.</span>
                    {opt.label}
                    {opt.path ? <span className="text-muted-foreground"> — {opt.path}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}

            <span className="px-1 text-[11px] text-muted-foreground">{formatTime(m.createdAt)}</span>
          </div>
        );
      })}

      {sending ? (
        <div className="flex flex-col items-start gap-1">
          <span className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            LifeOS
          </span>
          <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
          </div>
        </div>
      ) : null}

      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
