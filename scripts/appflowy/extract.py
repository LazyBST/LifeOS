#!/usr/bin/env python3
"""Reads an AppFlowy local data folder (a COPY of it) and writes a normalised JSON dump.

usage: extract.py <copy-of-appflowy-user-dir> <out.json>

Reads flowy-database.db (SQLite): the database schemas (field names, types, select options) and every
cell. Nothing is written back to AppFlowy.
"""
import json, sqlite3, sys, os

def varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1
        r |= (c & 0x7F) << s; s += 7
        if not c & 0x80: return r, i

def decode(b):
    i, out = 0, []
    while i < len(b):
        try:
            k, i = varint(b, i); f, t = k >> 3, k & 7
            if t == 0: v, i = varint(b, i); out.append((f, v))
            elif t == 2:
                l, i = varint(b, i); out.append((f, b[i:i + l])); i += l
            elif t == 1: out.append((f, b[i:i + 8])); i += 8
            elif t == 5: out.append((f, b[i:i + 4])); i += 4
            else: return []
        except Exception:
            return []
    return out

def s(b):
    try: return b.decode('utf-8')
    except Exception: return ''

FIELD_TYPES = {0: 'text', 1: 'number', 2: 'date', 3: 'select', 4: 'multiselect', 5: 'checkbox', 6: 'url',
               7: 'checklist', 8: 'last_edited', 9: 'created', 10: 'relation', 11: 'summary', 12: 'translate',
               13: 'time', 14: 'media', 15: 'person'}

def schema(blob):
    fields = {}
    for f, v in decode(blob):
        if f != 6 or not isinstance(v, bytes): continue
        d = decode(v); fid = name = None; ftype = None; options = {}
        for ff, vv in d:
            if ff == 1: fid = s(vv)
            elif ff == 2: name = s(vv)
            elif ff == 4: ftype = vv
            elif ff == 6 and isinstance(vv, bytes):
                for f3, v3 in decode(vv):
                    if f3 == 1 and isinstance(v3, bytes):
                        o = dict(decode(v3)); 
                        if 1 in o and 2 in o: options[s(o[1])] = s(o[2])
        if fid: fields[fid] = {'id': fid, 'name': name or fid, 'type': FIELD_TYPES.get(ftype, str(ftype)), 'options': options}
    return fields

def main(src, out):
    db = sqlite3.connect(os.path.join(src, 'flowy-database.db'))
    views = {r[0]: r[1:] for r in db.execute('select view_id, name, parent_view_id from outline_view')}
    names = {r[0]: r[1] for r in db.execute('select view_id, name from outline_view')}
    dbs = {}
    for view_id, database_id, blob in db.execute('select view_id, database_id, value from db_view_schema_cache'):
        d = dbs.setdefault(database_id, {'id': database_id, 'views': [], 'fields': {}})
        d['views'].append(names.get(view_id, ''))
        d['fields'].update(schema(blob))
    rows = {}
    for database_id, row_id, field_id, ftype, vt, vn, vb, ts, vj in db.execute(
            'select database_id,row_id,field_id,field_type,value_text,value_number,value_bool,value_timestamp,value_json from db_database_cell_index'):
        r = rows.setdefault((database_id, row_id), {})
        j = {}
        try: j = json.loads(vj) if vj else {}
        except Exception: pass
        r[field_id] = {'type': ftype, 'text': vt, 'number': vn, 'bool': vb, 'ts': ts, 'json': j}
    meta = {r[0]: (r[1], r[2]) for r in db.execute('select row_id, created_at, modified_at from db_database_row_index')}
    result = []
    for database_id, d in dbs.items():
        mine = {rid: cells for (dbid, rid), cells in rows.items() if dbid == database_id}
        if not mine: continue
        fields = d['fields']
        out_rows = []
        for rid, cells in mine.items():
            row = {'id': rid}
            if rid in meta: row['_created_at'], row['_modified_at'] = meta[rid]
            for fid, c in cells.items():
                f = fields.get(fid, {'name': fid, 'type': 'unknown', 'options': {}})
                j = c['json'] or {}
                t = f['type']
                if t == 'date':
                    row[f['name']] = {'start': c['ts'], 'end': int(j['end_timestamp']) if str(j.get('end_timestamp', '')).isdigit() else None,
                                      'has_time': bool(j.get('include_time'))}
                elif t == 'number': row[f['name']] = c['number']
                elif t == 'checkbox': row[f['name']] = bool(c['bool'])
                elif t == 'multiselect': row[f['name']] = [x.strip() for x in (c['text'] or '').split(',') if x.strip()]
                elif t == 'relation': row[f['name']] = [x for x in (j.get('data') or []) if isinstance(x, str)]
                elif t == 'checklist': row[f['name']] = c['text']
                elif t in ('created', 'last_edited'): row[f['name']] = c['ts']
                else: row[f['name']] = c['text']
            out_rows.append(row)
        result.append({'database_id': database_id, 'views': sorted(set(v for v in d['views'] if v)),
                       'fields': [{'name': f['name'], 'type': f['type'], 'options': list(f['options'].values())} for f in fields.values()],
                       'rows': out_rows})
    with open(out, 'w') as fh: json.dump({'databases': result}, fh, ensure_ascii=False, indent=1)
    for d in sorted(result, key=lambda x: -len(x['rows'])):
        print(f"{len(d['rows']):4d} rows  {', '.join(d['views'])[:60]:60s}  fields: {', '.join(f['name'] for f in d['fields'])[:110]}")

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
