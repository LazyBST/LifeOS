'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { usePageContext } from '@/components/chat/page-context';
import { useChat } from '@/components/chat/useChat';
import { MessageList } from '@/components/chat/MessageList';
import { Composer } from '@/components/chat/Composer';

const STORAGE_KEY = 'lifeos:chat:open';
const DESKTOP_QUERY = '(min-width: 768px)';

/**
 * Right-side drawer on desktop, full-screen panel on mobile. Rendered once
 * in the app shell; keeps all state internally so it survives route changes.
 */
export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const pageContext = usePageContext();
  const pageContextRef = useRef(pageContext);
  useEffect(() => {
    pageContextRef.current = pageContext;
  }, [pageContext]);
  const getPageContext = useCallback(() => pageContextRef.current, []);

  const { messages, sending, unread, setIsOpen, send } = useChat(getPageContext);

  // Restore open state on desktop only; start closed on mobile.
  useEffect(() => {
    try {
      const isDesktop = window.matchMedia(DESKTOP_QUERY).matches;
      if (isDesktop) {
        setOpen(window.localStorage.getItem(STORAGE_KEY) === '1');
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — stay closed.
    } finally {
      setMounted(true);
    }
  }, []);

  useEffect(() => {
    setIsOpen(open);
  }, [open, setIsOpen]);

  useEffect(() => {
    if (!mounted) return;
    try {
      const isDesktop = window.matchMedia(DESKTOP_QUERY).matches;
      if (isDesktop) {
        window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
      }
    } catch {
      // ignore
    }
  }, [open, mounted]);

  // External open/toggle triggers: dashboard quick-add and the mobile bottom
  // nav dispatch these instead of reaching into our internal state.
  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }
    function handleToggle() {
      setOpen((prev) => !prev);
    }
    window.addEventListener('lifeos:chat:open', handleOpen);
    window.addEventListener('lifeos:toggle-chat', handleToggle);
    return () => {
      window.removeEventListener('lifeos:chat:open', handleOpen);
      window.removeEventListener('lifeos:toggle-chat', handleToggle);
    };
  }, []);

  function handlePickOption(optionIndex: number) {
    void send(String(optionIndex));
  }

  return (
    <>
      <Button
        type="button"
        size="icon-lg"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        className={cn(
          'fixed right-4 bottom-4 z-40 hidden rounded-full shadow-lg md:flex',
          open && 'md:hidden',
        )}
      >
        <MessageCircle className="size-5" />
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 flex size-4.5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </Button>

      <div
        role="dialog"
        aria-label="LifeOS chat"
        aria-hidden={!open}
        className={cn(
          'fixed inset-0 z-50 flex flex-col border-border bg-background shadow-xl transition-transform duration-200 ease-in-out',
          'md:inset-y-0 md:left-auto md:right-0 md:w-[380px] md:border-l',
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">LifeOS chat</span>
            {unread > 0 && !open ? (
              <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
                {unread}
              </span>
            ) : null}
          </div>
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => setOpen(false)} aria-label="Close chat">
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <MessageList messages={messages} sending={sending} onPickOption={handlePickOption} />
        </div>

        <Composer disabled={sending} onSend={(text) => void send(text)} />
      </div>
    </>
  );
}

export default ChatPanel;
