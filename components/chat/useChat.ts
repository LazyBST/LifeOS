'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, PageContext, PendingChoice, ToolResultCard } from '@/lib/types/db';

export type ChatBubble = {
  /** negative ids are optimistic/local-only bubbles, never persisted */
  id: number;
  role: 'user' | 'assistant' | 'tool' | 'system';
  channel: 'web' | 'system';
  text: string;
  cards?: ToolResultCard[];
  pending?: PendingChoice | null;
  createdAt: string;
  /** marks a locally-synthesized error bubble (network failure, etc.) */
  isError?: boolean;
};

type ChatApiResponse = {
  reply: string;
  cards: ToolResultCard[];
  pending?: PendingChoice | null;
  messageId: number;
};

function toBubble(m: ChatMessage): ChatBubble {
  return {
    id: m.id,
    role: m.role === 'tool' ? 'assistant' : m.role,
    channel: m.channel,
    text: m.content?.text ?? '',
    cards: m.content?.cards,
    pending: m.content?.pending,
    createdAt: m.created_at,
  };
}

let localIdCounter = -1;
function nextLocalId(): number {
  return localIdCounter--;
}

export function useChat(getPageContext: () => PageContext) {
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const isOpenRef = useRef(false);

  // Hydrate from GET /api/chat on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/chat', { method: 'GET' });
        if (!res.ok) throw new Error(`GET /api/chat failed: ${res.status}`);
        const data = (await res.json()) as { messages: ChatMessage[] };
        if (cancelled) return;
        setMessages(data.messages.map(toBubble));
      } catch {
        if (!cancelled) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextLocalId(),
              role: 'system',
              channel: 'system',
              text: "Couldn't load chat history.",
              createdAt: new Date().toISOString(),
              isError: true,
            },
          ]);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setIsOpen = useCallback((open: boolean) => {
    isOpenRef.current = open;
    if (open) setUnread(0);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      const optimistic: ChatBubble = {
        id: nextLocalId(),
        role: 'user',
        channel: 'web',
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setSending(true);

      try {
        const page_context = getPageContext();
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed, page_context }),
        });
        if (!res.ok) throw new Error(`POST /api/chat failed: ${res.status}`);
        const data = (await res.json()) as ChatApiResponse;

        const reply: ChatBubble = {
          id: data.messageId,
          role: 'assistant',
          channel: 'web',
          text: data.reply,
          cards: data.cards,
          pending: data.pending ?? null,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, reply]);
        window.dispatchEvent(new Event('lifeos:changed'));
        if (!isOpenRef.current) setUnread((n) => n + 1);
      } catch {
        const errBubble: ChatBubble = {
          id: nextLocalId(),
          role: 'assistant',
          channel: 'web',
          text: "Something went wrong sending that. Please try again.",
          createdAt: new Date().toISOString(),
          isError: true,
        };
        setMessages((prev) => [...prev, errBubble]);
        if (!isOpenRef.current) setUnread((n) => n + 1);
      } finally {
        setSending(false);
      }
    },
    [getPageContext, sending],
  );

  return { messages, hydrated, sending, unread, setIsOpen, send };
}
