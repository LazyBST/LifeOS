// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Celebration } from '@/components/pomodoro/Celebration';

afterEach(cleanup);

describe('Celebration', () => {
  it.each(['sparkle', 'confetti', 'lanterns', 'rocket', 'diwali'] as const)('%s mounts without throwing and finishes cleanly when a canvas is unavailable', (kind) => {
    const onDone = vi.fn();
    const { container } = render(<Celebration kind={kind} onDone={onDone} />);
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(onDone).toHaveBeenCalled(); // jsdom has no 2d canvas, so it bows out instead of crashing
  });
});
