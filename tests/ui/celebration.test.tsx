// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Celebration } from '@/components/pomodoro/Celebration';

afterEach(cleanup);

describe('Celebration', () => {
  it.each(['sparkle', 'funny', 'productive', 'motivate', 'rocket', 'mega'] as const)('%s mounts without throwing and finishes cleanly when a canvas is unavailable', (kind) => {
    const onDone = vi.fn();
    const { container } = render(<Celebration kind={kind} onDone={onDone} />);
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(onDone).toHaveBeenCalled(); // jsdom has no 2d canvas, so it bows out instead of crashing
  });
});

describe('durations', () => {
  it('everyday celebrations last 3 to 5 seconds and only the big one runs longer', async () => {
    const { DURATION } = await import('@/components/pomodoro/Celebration');
    for (const k of ['sparkle', 'funny', 'productive', 'motivate', 'rocket'] as const) {
      expect(DURATION[k]).toBeGreaterThanOrEqual(3000);
      expect(DURATION[k]).toBeLessThanOrEqual(5000);
    }
    expect(DURATION.mega).toBeGreaterThan(8000);
  });
});
