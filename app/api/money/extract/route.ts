// POST /api/money/extract — reads one statement file (PDF, screenshot, CSV or text) and returns its lines.
// A file per request keeps each one under the host's body limit; the page combines them and previews the lot.
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { extractStatement } from '@/lib/domain/statement-import';
import type { ImportSource } from '@/lib/domain/statement-import-math';

export const maxDuration = 300;

const OK_TYPES = /^(application\/pdf|image\/(png|jpe?g|webp|gif)|text\/(csv|plain))$/;

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const form = await req.formData();
    const file = form.get('file');
    const source = String(form.get('source') ?? '') as ImportSource;
    if (!(file instanceof File) || !['federal', 'hdfc', 'phonepe'].includes(source)) return NextResponse.json({ ok: false, error: 'Choose a bank and a file.' }, { status: 400 });
    const mediaType = file.type || (/\.csv$/i.test(file.name) ? 'text/csv' : /\.pdf$/i.test(file.name) ? 'application/pdf' : '');
    if (!OK_TYPES.test(mediaType)) return NextResponse.json({ ok: false, error: 'Use a PDF, a screenshot (PNG/JPG) or a CSV file.' }, { status: 415 });
    if (file.size > 12 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'That file is too large (12 MB at most).' }, { status: 413 });
    const rows = await extractStatement(source, { data: Buffer.from(await file.arrayBuffer()), mediaType, filename: file.name });
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Could not read the file.' }, { status: 500 });
  }
}
