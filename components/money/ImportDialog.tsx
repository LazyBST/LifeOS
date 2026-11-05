'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { commitImportAction, previewImportAction } from '@/app/actions/money';
import { LabelPicker } from './LabelChips';
import { formatINR } from '@/lib/format';
import { IMPORT_SOURCES, type Classified, type ExtractedRow, type ImportSource } from '@/lib/domain/statement-import-math';
import type { CommitItem, ImportPreview } from '@/lib/domain/statement-import';

const LS_MAP = 'lifeos:import:phonepe-accounts';
const SOURCES: ImportSource[] = ['federal', 'hdfc', 'phonepe'];
const BADGE: Record<Classified['status'], { text: string; cls: string }> = {
  new: { text: 'New', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  merge: { text: 'Merge', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  duplicate: { text: 'Already there', cls: 'bg-muted text-muted-foreground' },
  transfer: { text: 'Transfer', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
};
const selectCls = 'h-8 min-w-0 rounded-lg border border-input bg-transparent px-2 text-xs';

/** Bring in a Federal, HDFC or PhonePe statement PDF: read it, see what is new, then add only that. */
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
  const [last4, setLast4] = useState<string | null>(null);
  const [proof, setProof] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [phoneMap, setPhoneMap] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem(LS_MAP) ?? '{}'); } catch { return {}; } });
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [cat, setCat] = useState<Record<number, string>>({});
  const [acc, setAcc] = useState<Record<number, string>>({});
  const [removeOther, setRemoveOther] = useState<Record<number, boolean>>({});
  const [lab, setLab] = useState<Record<number, string[]>>({});

  async function run(rows: ExtractedRow[], aId: string | null, map: Record<string, string>, l4: string | null) {
    const r = await previewImportAction(source, rows, aId, map, l4);
    if (!r.ok) { toast.error(r.error); return false; }
    setPreview(r.data);
    setAccountId(aId ?? r.data.defaultAccountId);
    setPicked(Object.fromEntries(r.data.rows.map((x) => [x.idx, x.status === 'new' || x.status === 'merge' || x.status === 'transfer'])));
    setRemoveOther(Object.fromEntries(r.data.rows.filter((x) => x.counterpartIds.length).map((x) => [x.idx, true])));
    setCat({}); setAcc({}); setLab({});
    return true;
  }

  async function read() {
    if (!files.length) { toast.error('Choose a file first.'); return; }
    const all: ExtractedRow[] = [];
    const notes: string[] = [];
    let l4: string | null = null;
    try {
      for (let i = 0; i < files.length; i++) {
        setBusy(`Reading file ${i + 1} of ${files.length}…`);
        const form = new FormData();
        form.set('file', files[i]);
        form.set('source', source);
        const res = await fetch('/api/money/extract', { method: 'POST', body: form });
        const j = (await res.json().catch(() => null)) as { ok: boolean; rows?: ExtractedRow[]; accountLast4?: string | null; summary?: string; error?: string } | null;
        if (!j?.ok) throw new Error(j?.error ?? `Could not read ${files[i].name}.`);
        if (j.accountLast4 && l4 && j.accountLast4 !== l4) throw new Error('These files are from different bank accounts. Import one account at a time.');
        l4 = j.accountLast4 ?? l4;
        all.push(...(j.rows ?? []));
        notes.push(`${files[i].name}: ${j.summary}`);
      }
      if (!all.length) { toast.error('No transactions found in that file.'); return; }
      setBusy('Checking against what you already have…');
      setExtracted(all); setLast4(l4); setProof(notes);
      await run(all, null, phoneMap, l4);
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
    await run(extracted, next.accountId !== undefined ? next.accountId : accountId, map, last4);
    setBusy(null);
  }

  async function commit() {
    if (!preview) return;
    setBusy('Adding…');
    const items: CommitItem[] = chosen.filter((r) => r.status !== 'merge').map((r) => ({
      date: r.date, name: r.name, raw: r.raw, direction: r.direction, amount: r.amount, ref: r.ref,
      account_id: acc[r.idx] ?? r.account_id, category: (cat[r.idx] ?? r.category) || null, labels: lab[r.idx] ?? [],
      ...(r.status === 'transfer' && r.transfer?.from && r.transfer.to ? { transfer: { from: r.transfer.from, to: r.transfer.to } } : {}),
    }));
    const merges = [
      ...chosen.filter((r) => r.status === 'merge' && r.matchId).map((r) => ({ id: r.matchId!, ...(r.patch ?? {}) })),
      // remembering the reference on an entry you typed yourself costs nothing and stops a later duplicate
      ...rows.filter((r) => r.status === 'duplicate' && r.matchId && r.patch?.ext_ref).map((r) => ({ id: r.matchId!, ext_ref: r.patch!.ext_ref })),
    ];
    const removeIds = rows.filter((r) => r.counterpartIds.length && removeOther[r.idx] && picked[r.idx]).flatMap((r) => r.counterpartIds);
    const res = await commitImportAction(source, items, merges, removeIds, IMPORT_SOURCES[source].label, last4);
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
          <span className="font-medium">Statement PDF</span>
          <input type="file" multiple accept="application/pdf,.pdf" onChange={(e) => setFiles([...(e.target.files ?? [])])} className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:bg-transparent file:px-3 file:py-1.5 file:text-xs hover:file:bg-muted" />
          <span className="block text-xs text-muted-foreground">The PDF you download from the bank or PhonePe (unlocked, not a photo). It is read exactly as printed and checked against the statement&apos;s own balances. Nothing is added until you review it.</span>
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
  const accountName = (id: string | null) => accountOptions.find((a) => a.id === id)?.name ?? 'an account';
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-medium">{rows.length} lines from {IMPORT_SOURCES[source].label}:</span>
        <span className="text-emerald-700 dark:text-emerald-300">{counts.new} new</span>
        {counts.merge > 0 && <span className="text-sky-700 dark:text-sky-300">{counts.merge} to merge</span>}
        <span className="text-muted-foreground">{counts.duplicate} already there</span>
        {counts.transfer > 0 && <span className="text-amber-700 dark:text-amber-300">{counts.transfer} transfers between your accounts</span>}
      </div>
      {proof.length > 0 && <ul className="text-[11px] text-muted-foreground">{proof.map((p) => <li key={p}>✓ {p}</li>)}</ul>}
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
              <select value={phoneMap[d] ?? preview.knownLast4[d] ?? ''} onChange={(e) => void remap({ map: { ...phoneMap, [d]: e.target.value } })} className={selectCls}>
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
                  </div>
                  <div className="text-xs text-muted-foreground">{r.date}{r.reason ? ` · ${r.reason}` : ''}</div>
                </div>
                <span className={`shrink-0 font-semibold tabular-nums ${credit ? 'text-emerald-600' : ''}`}>{credit ? '+' : '−'}{formatINR(r.amount)}</span>
              </div>
              {r.status === 'transfer' && r.transfer && (
                <div className="pl-6 text-xs font-medium">{accountName(r.transfer.from)} → {accountName(r.transfer.to)}</div>
              )}
              {(r.status === 'new' || on) && r.status !== 'merge' && r.status !== 'transfer' && (
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <select value={cat[r.idx] ?? r.category ?? ''} onChange={(e) => setCat((c) => ({ ...c, [r.idx]: e.target.value }))} className={selectCls} aria-label="Category">
                    {credit && <option value="">No category</option>}
                    {preview.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={acc[r.idx] ?? r.account_id ?? ''} onChange={(e) => setAcc((a) => ({ ...a, [r.idx]: e.target.value }))} className={selectCls} aria-label="Account">
                    <option value="">New account</option>
                    {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <LabelPicker labels={preview.labels} value={lab[r.idx] ?? []} onChange={(next) => setLab((m) => ({ ...m, [r.idx]: next }))} />
                </div>
              )}
              {r.status === 'transfer' && r.counterpartIds.length > 0 && on && (
                <label className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
                  <input type="checkbox" checked={!!removeOther[r.idx]} onChange={(e) => setRemoveOther((m) => ({ ...m, [r.idx]: e.target.checked }))} className="size-3.5" />
                  Also remove the entr{r.counterpartIds.length === 1 ? 'y' : 'ies'} imported earlier for each side, so the transfer is not counted twice
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Money moving between your own accounts is recorded once, as a transfer (not income or spending). After importing, open any transaction to change its account, category or labels, split it, or turn it into a transfer with the ⇄ button.</p>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => { setPreview(null); setExtracted(null); setFiles([]); setProof([]); }} className="text-xs text-muted-foreground underline">Start over</button>
        <Button onClick={() => void commit()} disabled={!!busy || chosen.length === 0}>
          {busy ?? `Import ${addCount}${mergeCount ? ` · merge ${mergeCount}` : ''}`}
        </Button>
      </div>
    </div>
  );
}
