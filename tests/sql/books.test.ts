import { describe, expect, test } from 'vitest';
import { freshDb, row, rows } from './harness';

describe('books', () => {
  test('default status is to_read and book statuses come from the statuses table', async () => {
    const db = await freshDb();
    const b = await row<{ status: string }>(db, `insert into books (title) values ('Deep Work') returning status`);
    expect(b!.status).toBe('to_read');
    const s = await rows<{ key: string }>(db, `select key from statuses where 'book' = any(applies_to) order by sort_order`);
    expect(s.map((x) => x.key).sort()).toEqual(['dropped', 'finished', 'reading', 'to_read']);
  });
  test('a task status cannot be used on a book, and a book status cannot be used on a task', async () => {
    const db = await freshDb();
    await expect(db.query(`insert into books (title, status) values ('x', 'doing')`)).rejects.toThrow(/not valid for a book/);
    await expect(db.query(`insert into tasks (title, status) values ('x', 'reading')`)).rejects.toThrow(/not valid for a task/);
  });
  test('current page cannot pass the total, and rating is 1 to 5', async () => {
    const db = await freshDb();
    await expect(db.query(`insert into books (title, total_pages, current_page) values ('x', 100, 101)`)).rejects.toThrow();
    await expect(db.query(`insert into books (title, rating) values ('x', 6)`)).rejects.toThrow();
  });
  test('the first agreed finish date never moves and changes are logged', async () => {
    const db = await freshDb();
    const b = await row<{ id: string }>(db, `insert into books (title, target_date) values ('x', '2026-11-30') returning id`);
    await db.query(`update books set target_date='2026-12-15' where id=$1`, [b!.id]);
    const r = await row<{ original_target_date: string }>(db, `select original_target_date::text from books where id=$1`, [b!.id]);
    expect(r!.original_target_date).toBe('2026-11-30');
    expect(await rows(db, `select 1 from deadline_changes where entity='book' and entity_id=$1`, [b!.id])).toHaveLength(1);
  });
  test('links to goals, projects, tasks and habits are unique and cascade with the book', async () => {
    const db = await freshDb();
    const b = await row<{ id: string }>(db, `insert into books (title) values ('x') returning id`);
    const g = await row<{ id: string }>(db, `insert into goals (title) values ('g') returning id`);
    await db.query(`insert into book_links (book_id, entity_type, entity_id) values ($1,'goal',$2)`, [b!.id, g!.id]);
    await expect(db.query(`insert into book_links (book_id, entity_type, entity_id) values ($1,'goal',$2)`, [b!.id, g!.id])).rejects.toThrow();
    await expect(db.query(`insert into book_links (book_id, entity_type, entity_id) values ($1,'area',$2)`, [b!.id, g!.id])).rejects.toThrow();
    await db.query(`delete from books where id=$1`, [b!.id]);
    expect(await rows(db, `select 1 from book_links`)).toHaveLength(0);
  });
});
