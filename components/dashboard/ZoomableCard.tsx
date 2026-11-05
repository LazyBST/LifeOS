'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';
import { ZoomContext } from '@/components/money/chart-kit';

/** A widget with an expand button: the same content again, filling the screen (legends smaller, chart bigger). */
export function ZoomableCard({ title, sub, right, children, bodyClassName = '' }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; bodyClassName?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open]);

  const button = (
    <div className="flex items-center gap-2">
      {right}
      <button type="button" onClick={() => setOpen(true)} aria-label="Open full screen" title="Full screen" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Maximize2 className="size-4" /></button>
    </div>
  );
  return (
    <>
      <WidgetFrame title={title} sub={sub} right={button} bodyClassName={bodyClassName}>{children}</WidgetFrame>
      {open && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Chart, full screen" className="fixed inset-0 z-[80] flex flex-col bg-background">
          <header className="flex items-center gap-3 border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold leading-tight">{title}</h2>
              {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close full screen" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-5" /></button>
          </header>
          <div className={`min-h-0 flex-1 overflow-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 ${bodyClassName}`}>
            <ZoomContext.Provider value>{children}</ZoomContext.Provider>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
