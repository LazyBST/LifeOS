import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Event handlers cannot be serialised from a Server Component to the browser; one slipped into
// production once (onMouseDown in WidgetCard). Guard every file that is not a client component.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (f === 'node_modules' || f === '.next') return [];
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('server components', () => {
  const root = path.resolve(__dirname, '../..');
  const files = [...walk(path.join(root, 'components')), ...walk(path.join(root, 'app'))];
  const server = files.filter((f) => !/^\s*(['"])use client\1/m.test(readFileSync(f, 'utf8').slice(0, 200)));
  it('have no JSX event handlers', () => {
    const offenders = server.filter((f) => /\son(Click|Change|Mouse\w+|Key\w+|Submit|Focus|Blur)=\{/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
  it('pass no function props (arrow functions) to other components', () => {
    // `render=`/`children=` aside, any `name={(…) => …}` attribute in a server file cannot be serialised
    const offenders = server.filter((f) => /\s(?!key=)\w+=\{\s*(async\s*)?\([^)]*\)\s*=>/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});
