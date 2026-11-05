// POST /api/money/extract — reads one statement PDF (Federal Bank, HDFC Bank or PhonePe) and returns its lines.
// No AI: each bank's layout is read directly and the result is checked against the statement's own balances and totals.
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { readStatementPdf, StatementError } from '@/lib/domain/statement-import';
import type { ImportSource } from '@/lib/domain/statement-import-math';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const form = await req.formData();
    const file = form.get('file');
    const source = String(form.get('source') ?? '') as ImportSource;
    if (!(file instanceof File) || !['federal', 'hdfc', 'phonepe'].includes(source)) return NextResponse.json({ ok: false, error: 'Choose a bank and a PDF.' }, { status: 400 });
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return NextResponse.json({ ok: false, error: 'Only PDF statements can be imported.' }, { status: 415 });
    if (file.size > 12 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'That file is too large (12 MB at most).' }, { status: 413 });
    // an empty password means the file is not protected; the password is used for this read only and never stored or logged
    const password = String(form.get('password') ?? '');
    const read = await readStatementPdf(source, new Uint8Array(await file.arrayBuffer()), password);
    return NextResponse.json({ ok: true, ...read });
  } catch (e) {
    const known = e instanceof StatementError;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Could not read the file.' }, { status: known ? 422 : 500 });
  }
}
