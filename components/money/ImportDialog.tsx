'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { commitImportAction, previewImportAction } from '@/app/actions/money';
import { formatINR } from '@/lib/format';
import { IMPORT_SOURCES, type Classified, type ExtractedRow, type ImportSource } from '@/lib/domain/statement-import-math';
import type { ImportPreview } from '@/lib/domain/statement-import';

const LS_MAP = 'lifeos:import:phonepe-accounts';
const SOURCES: ImportSource[] = ['federal', 'hdfc', 'phonepe'];
const BADGE: Record<Classified['status'], { text: string; cls: string }> = {
  new: { text: 'New', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  merge: { text: 'Merge', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  duplicate: { text: 'Already there', cls: 'bg-muted text-muted-foreground' },
  transfer: { text: 'Own transfer', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
};
const selectCls = 'h-8 min-w-0 rounded-lg border border-input bg-transparent px-2 text-xs';

/** Big phone screenshots are shrunk before upload so a few of them fit in one request. */
async function shrink(file: File): Promise<File> {
  if (!/^image\//.test(file.type) || file.size < 2_500_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

/** Bring in a bank or PhonePe statement: read it, see what is new, then add only that. */
export function ImportDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Import statement</Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader><DialogTitle>Import a statement</DialogTitle></DialogHeader>
            <Importer onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function Importer({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [source, setSource] = useState<ImportSource>('federal');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedRow[] | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [phoneMap, setPhoneMap] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem(LS_MAP) ?? '{}'); } catch { return {}; } });
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [cat, setCat] = useState<Record<number, string>>({});
  const [acc, setAcc] = useState<Record<number, string>>({});
  const [removeOther, setRemoveOther] = useState<Record<number, boolean>>({});

  async function run(rows: ExtractedRow[], aId: string | null, map: Record<string, string>) {
    const r = await previewImportAction(source, rows, aId, map);
    if (!r.ok) { toast.error(r.error); return false; }
    setPreview(r.data);
    setAccountId(aId ?? r.data.defaultAccountId);
    setPicked(Object.fromEntries(r.data.rows.map((x) => [x.idx, x.status === 'new' || x.status === 'merge'])));
    setRemoveOther(Object.fromEntries(r.data.rows.filter((x) => x.counterpartId).map((x) => [x.idx, true])));
    setCat({}); setAcc({});
    return true;
  }

  async function read() {
    if (!files.length) { toast.error('Choose a file first.'); return; }
    const all: ExtractedRow[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setBusy(`Reading file ${i + 1} of ${files.length}… long statements can take a minute or two.`);
        const form = new FormData();
        form.set('file', await shrink(files[i]));
        form.set('source', source);
        const res = await fetch('/api/money/extract', { method: 'POST', body: form });
        const j = (await res.json().catch(() => null)) as { ok: boolean; rows?: ExtractedRow[]; error?: string } | null;
        if (!j?.ok) throw new Error(j?.error ?? `Could not read ${files[i].name}.`);
        all.push(...(j.rows ?? []));
      }
      if (!all.length) { toast.error('No transactions found in that file.'); return; }
      setBusy('Checking against what you already have…');
      setExtracted(all);
      await run(all, null, phoneMap);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read the file.');
    } finally { setBusy(null); }
  }

  const rows = useMemo(() => preview?.rows ?? [], [preview]);
  const counts = useMemo(() => {
    const c = { new: 0, merge: 0, duplicate: 0, transfer: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);
  const phoneDigits = useMemo(() => [...new Set(rows.map((r) => r.paid_by_last4).filter((x): x is string => !!x))], [rows]);
  const chosen = rows.filter((r) => picked[r.idx]);
  const addCount = chosen.filter((r) => r.status !== 'merge').length;
  const mergeCount = chosen.filter((r) => r.status === 'merge').length;

  async function remap(next: { accountId?: string | null; map?: Record<string, string> }) {
    if (!extracted) return;
    const map = next.map ?? phoneMap;
    if (next.map) { setPhoneMap(map); try { localStorage.setItem(LS_MAP, JSON.stringify(map)); } catch {} }
    setBusy('Checking against what you already have…');
    await run(extracted, next.accountId !== undefined ? next.accountId : accountId, map);
    setBusy(null);
  }

  async function commit() {
    if (!preview) return;
    setBusy('Adding…');
    const items = chosen.filter((r) => r.status !== 'merge').map((r) => ({
      date: r.date, name: r.name, raw: r.raw, direction: r.direction, amount: r.amount, ref: r.ref,
      account_id: acc[r.idx] ?? r.account_id, category: r.direction === 'credit' ? null : cat[r.idx] ?? r.category,
    }));
    const merges = [
      ...chosen.filter((r) => r.status === 'merge' && r.matchId).map((r) => ({ id: r.matchId!, ...(r.patch ?? {}) })),
      // remembering the reference on an entry you typed yourself costs nothing and stops a later duplicate
      ...rows.filter((r) => r.status === 'duplicate' && r.matchId && r.patch?.ext_ref).map((r) => ({ id: r.matchId!, ext_ref: r.patch!.ext_ref })),
    ];
    const removeIds = rows.filter((r) => r.counterpartId && removeOther[r.idx] && !picked[r.idx]).map((r) => r.counterpartId!);
    const res = await commitImportAction(source, items, merges, removeIds, IMPORT_SOURCES[source].label);
    setBusy(null);
    if (!res.ok) { toast.error(res.error); return; }
    const { added, merged, removed } = res.data;
    toast.success(`${added} added${merged ? ` · ${merged} merged` : ''}${removed ? ` · ${removed} transfer entr${removed === 1 ? 'y' : 'ies'} removed` : ''}`);
    router.refresh();
    onDone();
  }

  if (!preview) {
    return (
      <div className="space-y-4 text-sm">
        <div className="flex rounded-lg bg-muted p-0.5 text-xs">
          {SOURCES.map((s) => (
            <button key={s} type="button" onClick={() => setSource(s)} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${source === s ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{IMPORT_SOURCES[s].label}</button>
          ))}
        </div>
        <label className="block space-y-1">
          <span className="font-medium">Statement file</span>
          <input type="file" multiple accept="application/pdf,image/*,.csv,.txt,text/csv" onChange={(e) => setFiles([...(e.target.files ?? [])])} className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:bg-transparent file:px-3 file:py-1.5 file:text-xs hover:file:bg-muted" />
          <span className="block text-xs text-muted-foreground">A PDF, a screenshot or a CSV. Several screenshots of one statement are fine. Nothing is added until you review it.</span>
        </label>
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Payments already on file are skipped: the same bank reference is matched first (Federal and PhonePe share it), then the same account, amount and date. Money you move between your own accounts is flagged, not counted as spending.
        </p>
        {busy && <p className="text-xs text-muted-foreground" role="status">{busy}</p>}
        <div className="flex justify-end"><Button onClick={() => void read()} disabled={!!busy || !files.length}>Read statement</Button></div>
      </div>
    );
  }

  const accountOptions = preview.accounts;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-medium">{rows.length} lines from {IMPORT_SOURCES[source].label}:</span>
        <span className="text-emerald-700 dark:text-emerald-300">{counts.new} new</span>
        {counts.merge > 0 && <span className="text-sky-700 dark:text-sky-300">{counts.merge} to merge</span>}
        <span className="text-muted-foreground">{counts.duplicate} already there</span>
        {counts.transfer > 0 && <span className="text-amber-700 dark:text-amber-300">{counts.transfer} own transfers</span>}
        {preview.balanceFixed > 0 && <span className="text-amber-700 dark:text-amber-300">{preview.balanceFixed} amounts corrected from the running balance</span>}
      </div>
      {source !== 'phonepe' ? (
        <label className="flex items-center gap-2 text-xs"><span className="font-medium">Account</span>
          <select value={accountId ?? ''} onChange={(e) => void remap({ accountId: e.target.value || null })} className={selectCls}>
            <option value="">{`New account "${IMPORT_SOURCES[source].label}"`}</option>
            {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      ) : (
        <div className="space-y-1 text-xs">
          <div className="font-medium">PhonePe paid from</div>
          {phoneDigits.length === 0 && <span className="text-muted-foreground">No bank numbers found: lines go to the account below.</span>}
          {phoneDigits.map((d) => (
            <label key={d} className="flex items-center gap-2"><span className="w-28 text-muted-foreground">account ending {d}</span>
              <select value={phoneMap[d] ?? ''} onChange={(e) => void remap({ map: { ...phoneMap, [d]: e.target.value } })} className={selectCls}>
                <option value="">{preview.defaultAccountId ? 'Default account' : 'New account "PhonePe"'}</option>
                {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          ))}
          <label className="flex items-center gap-2"><span className="w-28 text-muted-foreground">default account</span>
            <select value={accountId ?? ''} onChange={(e) => void remap({ accountId: e.target.value || null })} className={selectCls}>
              <option value="">{'New account "PhonePe"'}</option>
              {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
      )}
      <ul className="max-h-[46vh] divide-y overflow-y-auto rounded-xl border">
        {rows.map((r) => {
          const on = !!picked[r.idx];
          const credit = r.direction === 'credit';
          return (
            <li key={r.idx} className={`space-y-1 px-3 py-2 ${on ? '' : 'opacity-60'}`}>
              <div className="flex items-start gap-2">
                <input type="checkbox" checked={on} onChange={(e) => setPicked((p) => ({ ...p, [r.idx]: e.target.checked }))} className="mt-1 size-4" aria-label={`Import ${r.name}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate font-medium">{r.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${BADGE[r.status].cls}`}>{BADGE[r.status].text}</span>
                    {r.corrected && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">amount fixed</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.date}{r.reason ? ` · ${r.reason}` : ''}</div>
                </div>
                <span className={`shrink-0 font-semibold tabular-nums ${credit ? 'text-emerald-600' : ''}`}>{credit ? '+' : '−'}{formatINR(r.amount)}</span>
              </div>
              {(r.status === 'new' || on) && r.status !== 'merge' && (
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  {!credit && (
                    <select value={cat[r.idx] ?? r.category ?? ''} onChange={(e) => setCat((c) => ({ ...c, [r.idx]: e.target.value }))} className={selectCls} aria-label="Category">
                      {preview.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <select value={acc[r.idx] ?? r.account_id ?? ''} onChange={(e) => setAcc((a) => ({ ...a, [r.idx]: e.target.value }))} className={selectCls} aria-label="Account">
                    <option value="">New account</option>
                    {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              {r.status === 'transfer' && r.counterpartId && !on && (
                <label className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
                  <input type="checkbox" checked={!!removeOther[r.idx]} onChange={(e) => setRemoveOther((m) => ({ ...m, [r.idx]: e.target.checked }))} className="size-3.5" />
                  Also remove the matching entry imported earlier (the other side of this transfer)
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">After importing, open any transaction to change its account or category, add a label, or split it.</p>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => { setPreview(null); setExtracted(null); setFiles([]); }} className="text-xs text-muted-foreground underline">Start over</button>
        <Button onClick={() => void commit()} disabled={!!busy || (addCount + mergeCount === 0 && !Object.entries(removeOther).some(([i, v]) => v && !picked[Number(i)]))}>
          {busy ?? `Import ${addCount} new${mergeCount ? ` · merge ${mergeCount}` : ''}`}
        </Button>
      </div>
    </div>
  );
}
