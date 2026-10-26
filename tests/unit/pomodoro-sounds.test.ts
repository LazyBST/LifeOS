import { describe, expect, it } from 'vitest';
import { END_SOUNDS, playBreak, playEnd, playStart } from '@/lib/pomodoro-sounds';

/** A stand-in for AudioContext that only counts what is scheduled. */
function fakeCtx() {
  const started: number[] = [];
  const node = () => ({ connect: () => undefined, start: (t: number) => { started.push(t); }, stop: () => undefined, frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0, setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined }, type: '', buffer: null as unknown });
  const ctx = {
    currentTime: 10, sampleRate: 8000, destination: {},
    createOscillator: node, createGain: node, createBiquadFilter: node, createBufferSource: node,
    createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }),
  };
  return { ctx: ctx as unknown as AudioContext, started };
}

describe('pomodoro sounds', () => {
  it('starts with two small clicks', () => {
    const { ctx, started } = fakeCtx();
    playStart(ctx);
    expect(started).toHaveLength(2);
    expect(started[1] - started[0]).toBeGreaterThan(0.1);
  });
  it.each(END_SOUNDS.filter((s) => s.id !== 'off').map((s) => s.id))('%s schedules sound in the future', (id) => {
    const { ctx, started } = fakeCtx();
    playEnd(ctx, id);
    expect(started.length).toBeGreaterThan(0);
    expect(Math.min(...started)).toBeGreaterThan(10);
  });
  it('a break starts with two soft notes stepping down', () => {
    const { ctx, started } = fakeCtx();
    playBreak(ctx);
    expect(started).toHaveLength(2);
  });
  it('the default finishing sound is a simple two-note nudge', () => {
    expect(END_SOUNDS[0].id).toBe('nudge');
    const { ctx, started } = fakeCtx();
    playEnd(ctx, 'nudge');
    expect(started).toHaveLength(2);
  });
  it('the alarm is five beeps twice, and silent plays nothing', () => {
    const a = fakeCtx(); playEnd(a.ctx, 'alarm'); expect(a.started).toHaveLength(10);
    const s = fakeCtx(); playEnd(s.ctx, 'off'); expect(s.started).toHaveLength(0);
  });
});
