'use client';

import { useMemo } from 'react';
import { marked } from 'marked';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

marked.setOptions({ gfm: true, breaks: false });

function escapeHtml(src: string): string {
  return src.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function injectCopyButtons(html: string): string {
  const openBtn =
    '<button type="button" data-copy-btn class="absolute right-2 top-2 rounded-md border border-border bg-background px-2 py-0.5 text-[12px] font-sans text-muted-foreground hover:bg-muted">Copy</button>';
  return html.replace(/<pre>/g, `<pre data-code-block>${openBtn}`);
}

/**
 * Renders markdown to HTML with no raw HTML allowed: every `<`/`>` in the
 * source is escaped before parsing, so only markdown syntax itself can ever
 * produce tags. Notes content is data, never instructions.
 */
export function renderMarkdown(md: string): string {
  const safeSrc = escapeHtml(md ?? '');
  const html = marked.parse(safeSrc, { async: false }) as string;
  return injectCopyButtons(html);
}

type MarkdownProps = {
  markdown: string;
  className?: string;
};

/** Shared read-only markdown renderer: headings, lists, task checklists and
 *  fenced code blocks with a copy button. Used by the notes preview. */
export function Markdown({ markdown, className }: MarkdownProps) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-copy-btn]');
    if (!btn) return;
    const block = btn.closest('[data-code-block]');
    const code = block?.querySelector('code');
    if (!code) return;
    navigator.clipboard
      .writeText(code.textContent ?? '')
      .then(() => {
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.textContent = prev;
        }, 1200);
      })
      .catch(() => toast.error('Could not copy'));
  }

  if (!markdown.trim()) {
    return <p className={cn('text-sm text-muted-foreground', className)}>Nothing here yet.</p>;
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'max-w-none space-y-2 break-words text-sm leading-relaxed [&>*+*]:mt-2',
        '[&_pre]:relative [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-xs',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold',
        '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5',
        '[&_li]:my-0.5',
        '[&_input[type=checkbox]]:mr-1.5 [&_input[type=checkbox]]:align-middle',
        '[&_a]:text-primary [&_a]:underline',
        className,
      )}
      // Content is HTML produced from escaped markdown source above, so no
      // user- or model-supplied raw HTML ever reaches this sink.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default Markdown;
