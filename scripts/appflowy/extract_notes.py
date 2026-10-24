#!/usr/bin/env python3
"""Extracts the page body of every AppFlowy database row (a task's notes, commands, code) as Markdown.

usage: extract_notes.py <copy-of-appflowy-user-dir> <out.json>

AppFlowy keeps page bodies as Yjs documents in a RocksDB store (collab_db). Needs two Python packages:
    python3 -m venv venv && ./venv/bin/pip install rocksdict y-py
    ./venv/bin/python scripts/appflowy/extract_notes.py <copy> data/appflowy/notes.json
Read-only: point it at a COPY of the AppFlowy folder, never the live one.
"""
import json, os, re, sqlite3, sys
from rocksdict import Rdict, Options, AccessType
import y_py as Y

UUID = rb'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

def load_doc(db, number):
    prefix = b'\x01\x01' + number
    doc = Y.YDoc()
    updates = sorted((bytes(k), bytes(v)) for k, v in db.items() if bytes(k).startswith(prefix))
    for _, v in updates:
        try: Y.apply_update(doc, v)
        except Exception: continue  # tiny trailing/foreign records: the real content has already been applied
    return doc

def text_of(value):
    """Plain text from either a Y.Text rendered as a string, or an AppFlowy delta ({"delta":[{"insert":"…"}]})."""
    if isinstance(value, str): return value
    if isinstance(value, dict): value = value.get('delta', [])
    if isinstance(value, list): return ''.join(op.get('insert', '') for op in value if isinstance(op, dict) and isinstance(op.get('insert'), str))
    return ''

def render(document):
    blocks = document.get('blocks', {})
    meta = document.get('meta', {})
    children = meta.get('children_map', {})
    texts = meta.get('text_map', {})
    lines = []

    def walk(bid, depth, counter):
        b = blocks.get(bid)
        if not b: return
        ty = b.get('ty', 'paragraph')
        try: data = json.loads(b.get('data') or '{}')
        except Exception: data = {}
        text = text_of(texts.get(b.get('external_id'))) if b.get('external_id') in texts else text_of(data)
        indent = '  ' * depth
        if ty == 'heading': lines.append(f"{'#' * min(6, int(data.get('level', 1)))} {text}")
        elif ty == 'bulleted_list': lines.append(f'{indent}- {text}')
        elif ty == 'numbered_list': counter[depth] = counter.get(depth, 0) + 1; lines.append(f'{indent}{counter[depth]}. {text}')
        elif ty == 'todo_list': lines.append(f"{indent}- [{'x' if data.get('checked') else ' '}] {text}")
        elif ty == 'quote': lines.append(f'> {text}')
        elif ty == 'code': lines.append(f"```{data.get('language', '') or ''}\n{text}\n```")
        elif ty == 'divider': lines.append('---')
        elif ty == 'page': pass
        else: lines.append(f'{indent}{text}' if text else '')
        if ty != 'numbered_list': counter.pop(depth, None)
        for c in children.get(b.get('children') or bid, []): walk(c, depth + (1 if ty in ('bulleted_list', 'numbered_list', 'todo_list') else 0), counter)

    for c in children.get(document.get('page_id'), []): walk(c, 0, {})
    md = '\n'.join(lines).strip()
    return re.sub(r'\n{3,}', '\n\n', md)

def main(src, out):
    db = Rdict(os.path.join(src, 'collab_db'), Options(raw_mode=True), access_type=AccessType.read_only())
    mapping = {}
    for k, v in db.items():
        if bytes(k)[:2] == b'\x01\x00':
            found = re.findall(UUID, bytes(k))
            if found: mapping[found[-1].decode()] = bytes(v)
    sq = sqlite3.connect(os.path.join(src, 'flowy-database.db'))
    rows = sq.execute('select row_document_id, row_id from db_row_document_context_cache where coalesce(known_document_empty,0)=0').fetchall()
    notes, missing = {}, 0
    for doc_id, row_id in rows:
        num = mapping.get(doc_id)
        if not num: missing += 1; continue
        try:
            data = json.loads(load_doc(db, num).get_map('data').to_json())
            md = render(data.get('document', {}))
        except Exception:
            continue
        if md: notes[row_id] = md
    json.dump(notes, open(out, 'w'), ensure_ascii=False, indent=1)
    print(f'{len(notes)} rows with notes, {missing} documents not found locally, {len(rows)} candidates')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
