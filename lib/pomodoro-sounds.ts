// The Pomodoro sounds, synthesised with the Web Audio API so there is nothing to download or license.
// A session starts with a pair of tiny watch clicks and ends with one of a few finishing sounds.

export type SoundId = 'nudge' | 'marimba' | 'gong' | 'bowl' | 'bell' | 'alarm' | 'off';
export const END_SOUNDS: { id: SoundId; name: string; note: string }[] = [
  { id: 'nudge', name: 'Gentle nudge', note: 'two soft notes: done, well played' },
  { id: 'marimba', name: 'Marimba', note: 'a bright, happy run up the scale' },
  { id: 'gong', name: 'Gong', note: 'one deep, satisfying stroke' },
  { id: 'bowl', name: 'Singing bowl', note: 'a long, calm ring' },
  { id: 'bell', name: 'Bell chime', note: 'three soft bells' },
  { id: 'alarm', name: 'Alarm clock', note: 'tut tut tut tut tut' },
  { id: 'off', name: 'Silent', note: 'no sound' },
];

type Ctx = AudioContext;

/** A sine (or other) note with a quick attack and an exponential fade. */
function tone(ctx: Ctx, freq: number, at: number, len: number, peak: number, type: OscillatorType = 'sine', attack = 0.01) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g); g.connect(ctx.destination);
  o.start(at); o.stop(at + len + 0.05);
}

/** A tiny dry click, like a watch ticking: a few milliseconds of noise through a band-pass filter. */
function click(ctx: Ctx, at: number, freq: number, peak = 0.35) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * 0.02));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4);
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 3;
  g.gain.value = peak;
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start(at);
}

/** Start of a work session (and the end of a break): tick, then a slightly lower tock. */
export function playStart(ctx: Ctx) {
  const t = ctx.currentTime + 0.02;
  click(ctx, t, 2600);
  click(ctx, t + 0.16, 1700);
}

/** Start of a break: two soft notes stepping down, like letting out a breath. */
export function playBreak(ctx: Ctx) {
  const t = ctx.currentTime + 0.02;
  tone(ctx, 659.25, t, 0.7, 0.18, 'sine', 0.02);
  tone(ctx, 523.25, t + 0.28, 1.1, 0.18, 'sine', 0.02);
}

/** After the last session: the sound you picked. */
export function playEnd(ctx: Ctx, id: SoundId) {
  const t = ctx.currentTime + 0.02;
  if (id === 'off') return;
  if (id === 'nudge') { tone(ctx, 784, t, 0.5, 0.2, 'sine', 0.01); tone(ctx, 1046.5, t + 0.2, 0.9, 0.2, 'sine', 0.01); return; }
  if (id === 'marimba') {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { tone(ctx, f, t + i * 0.13, 0.55, 0.22, 'triangle', 0.005); tone(ctx, f * 4, t + i * 0.13, 0.12, 0.05, 'sine', 0.002); });
    tone(ctx, 1046.5, t + 0.6, 1.1, 0.2, 'triangle', 0.005); tone(ctx, 1318.5, t + 0.6, 1.1, 0.14, 'triangle', 0.005);
  } else if (id === 'gong') {
    [[110, 0.5], [110 * 2.76, 0.22], [110 * 5.4, 0.1], [110 * 8.93, 0.05]].forEach(([f, p], i) => tone(ctx, f, t, 3.4 - i * 0.5, p, 'sine', 0.02));
  } else if (id === 'bowl') {
    [[528, 0.32], [528 * 2.71, 0.16], [528 * 5.3, 0.06], [531, 0.22]].forEach(([f, p], i) => tone(ctx, f, t, 4.5 - i * 0.6, p, 'sine', 0.08));
  } else if (id === 'bell') {
    [880, 1174.7, 1568].forEach((f, i) => { tone(ctx, f, t + i * 0.28, 1.6, 0.2, 'sine', 0.005); tone(ctx, f * 2.4, t + i * 0.28, 0.5, 0.05, 'sine', 0.005); });
  } else if (id === 'alarm') {
    // a digital watch alarm: two bursts of short, sharp beeps
    [0, 0.14, 0.28, 0.42, 0.56, 1.0, 1.14, 1.28, 1.42, 1.56].forEach((o) => { tone(ctx, 2093, t + o, 0.07, 0.16, 'square', 0.002); });
  }
}
