// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLegend } from '@/components/money/chart-kit';

describe('clicking a chart legend', () => {
  it('highlights first, hides on the second click, and shows it normally on the third', () => {
    const { result } = renderHook(() => useLegend(['a', 'b']));
    expect(result.current.state('a')).toBe('normal');
    act(() => result.current.cycle('a'));
    expect(result.current.state('a')).toBe('focus');
    expect(result.current.opacity('a')).toBe(1);
    expect(result.current.opacity('b')).toBeLessThan(1); // the others fade while one is highlighted
    act(() => result.current.cycle('a'));
    expect(result.current.hidden('a')).toBe(true);
    expect(result.current.opacity('b')).toBe(1); // nothing highlighted any more
    act(() => result.current.cycle('a'));
    expect(result.current.state('a')).toBe('normal');
    expect(result.current.touched).toBe(false);
  });
  it('lets you highlight several at once, and reset', () => {
    const { result } = renderHook(() => useLegend(['a', 'b', 'c']));
    act(() => { result.current.cycle('a'); });
    act(() => { result.current.cycle('b'); });
    expect(result.current.opacity('a')).toBe(1);
    expect(result.current.opacity('b')).toBe(1);
    expect(result.current.opacity('c')).toBeLessThan(1);
    act(() => result.current.reset());
    expect(result.current.touched).toBe(false);
  });
});
