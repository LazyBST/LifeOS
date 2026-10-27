'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * A task title that edits where it stands: click it, type, Enter or click away to save, Escape to cancel.
 * Used on board cards (`multiline`: it wraps while you type) and list rows (one line).
 */
export function EditableTitle({ value, onSave, className = '', multiline }: { value: string; onSave: (next: string) => void; className?: string; multiline?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  const box = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => {
    if (!editing || !box.current) return;
    box.current.focus();
    box.current.setSelectionRange(box.current.value.length, box.current.value.length);
  }, [editing]);

  // inside a draggable card: taps and keys here must not start a drag or open the card
  const guard = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onClick: (e: React.MouseEvent) => e.stopPropagation() };

  function finish() {
    setEditing(false);
    const next = draft.trim();
    if (cancelled.current) { cancelled.current = false; setDraft(value); return; }
    if (!next) { setDraft(value); return; } // a task needs a title
    if (next !== value) onSave(next);
  }

  if (!editing) {
    return (
      <button type="button" {...guard} onClick={(e) => { e.stopPropagation(); setEditing(true); }} title="Click to rename" aria-label={`Rename “${value}”`}
        className={`min-w-0 cursor-text rounded text-left hover:bg-muted/80 focus-visible:bg-muted/80 focus-visible:outline-none ${multiline ? '' : 'truncate'} ${className}`}>
        {value}
      </button>
    );
  }
  return (
    <textarea ref={box} {...guard} rows={multiline ? Math.min(5, Math.max(2, Math.ceil(draft.length / 28))) : 1} value={draft} aria-label="Task title"
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        e.stopPropagation(); // the board's keyboard drag listens for Space and Enter
        if (e.key === 'Enter') { e.preventDefault(); box.current?.blur(); }
        else if (e.key === 'Escape') { cancelled.current = true; box.current?.blur(); }
      }}
      onBlur={finish}
      className={`w-full resize-none rounded border border-ring bg-card px-1 py-0.5 leading-5 outline-none ${className}`} />
  );
}
