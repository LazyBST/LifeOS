'use client';
import { useEffect, useRef } from 'react';
import type { Celebration as Kind } from '@/lib/domain/pomodoro-math';

type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; shape: 'star' | 'rect' | 'dot' | 'lantern'; rot: number; vr: number; g: number; sway?: number };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const GOLD = ['#fde68a', '#fbbf24', '#fff', '#fcd34d', '#f9a8d4', '#a5f3fc'];
const FIRE = ['#fbbf24', '#f97316', '#ef4444', '#ec4899', '#a78bfa', '#34d399', '#fde047'];

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = (Math.PI / 4) * i, rr = i % 2 ? r * 0.28 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}

/** A full-screen, click-through celebration drawn on a canvas. Stops by itself; skipped for people who prefer reduced motion. */
export function Celebration({ kind, onDone }: { kind: Kind; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) { onDone(); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { onDone(); return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = window.innerWidth, H = window.innerHeight;
    const resize = () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    window.addEventListener('resize', resize);

    const ps: P[] = [];
    const T0 = performance.now();
    const duration = { sparkle: 2600, confetti: 4500, lanterns: 7000, diwali: 6500, rocket: 6200 }[kind];
    let last = T0, spawnAcc = 0, burstAcc = 0, burst = false, raf = 0;

    const twinkle = () => ps.push({ x: rnd(0, W), y: rnd(0, H), vx: rnd(-8, 8), vy: rnd(-14, 4), life: 0, max: rnd(0.7, 1.5), size: rnd(5, 15), color: pick(GOLD), shape: 'star', rot: rnd(0, 6), vr: rnd(-1.5, 1.5), g: 0 });
    const explode = (x: number, y: number, n = 70, colors = FIRE) => {
      const c = pick(colors);
      for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), v = rnd(60, 260); ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(0.9, 1.7), size: rnd(2, 4.5), color: Math.random() < 0.25 ? '#fff' : c, shape: 'dot', rot: 0, vr: 0, g: 140 }); }
    };

    const rocketPath = (t: number) => { // quadratic curve from the bottom to the moon
      const sx = W * 0.35, sy = H + 60, cx = W * 0.2, cy = H * 0.45, ex = W * 0.8, ey = H * 0.2;
      const u = 1 - t;
      return { x: u * u * sx + 2 * u * t * cx + t * t * ex, y: u * u * sy + 2 * u * t * cy + t * t * ey, dx: 2 * u * (cx - sx) + 2 * t * (ex - cx), dy: 2 * u * (cy - sy) + 2 * t * (ey - cy) };
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const el = now - T0;
      ctx.clearRect(0, 0, W, H);

      // night sky and moon for the rocket
      if (kind === 'rocket') {
        const a = Math.min(1, el / 500) * Math.min(1, (duration - el) / 700);
        ctx.fillStyle = `rgba(6,10,32,${0.82 * Math.max(0, a)})`;
        ctx.fillRect(0, 0, W, H);
        const mx = W * 0.8, my = H * 0.2, mr = Math.min(W, H) * 0.075, glow = el > 3000 && el < 3700 ? 1 + (el - 3000) / 700 : 1;
        const g = ctx.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 3 * glow);
        g.addColorStop(0, `rgba(254,243,199,${0.5 * a})`); g.addColorStop(1, 'rgba(254,243,199,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, mr * 3 * glow, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(254,252,232,${a})`; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(214,211,190,${a})`;
        [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.1, 0.35, 0.12]].forEach(([cx, cy, r]) => { ctx.beginPath(); ctx.arc(mx + cx * mr, my + cy * mr, r * mr, 0, 7); ctx.fill(); });
        if (el < 3000) spawnAcc += dt * 20; // stars
        const t = Math.min(1, el / 3000), p = rocketPath(t);
        if (el < 3100) {
          const ang = Math.atan2(p.dy, p.dx) + Math.PI / 2;
          for (let i = 0; i < 2; i++) ps.push({ x: p.x - Math.sin(ang) * -26, y: p.y + Math.cos(ang) * 26, vx: rnd(-30, 30), vy: rnd(40, 110), life: 0, max: rnd(0.4, 0.9), size: rnd(4, 9), color: pick(['#fb923c', '#fbbf24', '#fef3c7', '#f87171']), shape: 'dot', rot: 0, vr: 0, g: 0 });
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
          ctx.fillStyle = '#e5e7eb'; ctx.beginPath(); ctx.moveTo(0, -34); ctx.quadraticCurveTo(15, -10, 11, 24); ctx.lineTo(-11, 24); ctx.quadraticCurveTo(-15, -10, 0, -34); ctx.fill();
          ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(0, -34); ctx.quadraticCurveTo(8, -26, 10, -16); ctx.lineTo(-10, -16); ctx.quadraticCurveTo(-8, -26, 0, -34); ctx.fill();
          ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(0, -4, 6, 0, 7); ctx.fill();
          ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(-11, 10); ctx.lineTo(-24, 28); ctx.lineTo(-11, 22); ctx.fill(); ctx.beginPath(); ctx.moveTo(11, 10); ctx.lineTo(24, 28); ctx.lineTo(11, 22); ctx.fill();
          ctx.restore();
        } else if (!burst) { burst = true; explode(mx, my, 90, ['#fde68a', '#fff', '#fbbf24']); explode(mx - 40, my + 30, 50, FIRE); }
      }

      if (kind === 'sparkle') { if (el < 1800) spawnAcc += dt * 34; }
      if (kind === 'confetti' && el < 2600) spawnAcc += dt * 55;
      if (kind === 'lanterns' && el < 4200) spawnAcc += dt * 6;
      if (kind === 'diwali' && el < 4800) { burstAcc += dt; if (burstAcc > 0.32) { burstAcc = 0; explode(rnd(W * 0.1, W * 0.9), rnd(H * 0.12, H * 0.55), 60); } spawnAcc += dt * 8; }

      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        if (kind === 'confetti') ps.push({ x: rnd(0, W), y: -12, vx: rnd(-40, 40), vy: rnd(60, 180), life: 0, max: 5, size: rnd(6, 11), color: pick(['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#fde047']), shape: 'rect', rot: rnd(0, 6), vr: rnd(-6, 6), g: 40, sway: rnd(0, 6) });
        else if (kind === 'lanterns') ps.push({ x: rnd(W * 0.05, W * 0.95), y: H + 30, vx: 0, vy: rnd(-70, -40), life: 0, max: rnd(6, 9), size: rnd(16, 28), color: pick(['#fb923c', '#fbbf24', '#f97316']), shape: 'lantern', rot: 0, vr: 0, g: 0, sway: rnd(0, 6) });
        else twinkle();
      }

      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life += dt;
        if (p.life >= p.max) { ps.splice(i, 1); continue; }
        p.vy += p.g * dt;
        p.x += (p.vx + (p.sway !== undefined ? Math.sin(p.life * 2 + p.sway) * 30 : 0)) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const k = p.life / p.max;
        const alpha = p.shape === 'star' ? Math.sin(Math.PI * k) : p.shape === 'lantern' ? Math.min(1, p.life) * Math.min(1, (p.max - p.life) / 1.5) : 1 - k * k;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = p.color;
        if (p.shape === 'dot') { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, 7); ctx.fill(); }
        else if (p.shape === 'rect') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); }
        else if (p.shape === 'star') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.shadowColor = p.color; ctx.shadowBlur = 12; star(ctx, p.size * (0.6 + 0.6 * Math.sin(Math.PI * k))); ctx.restore(); }
        else { // paper lantern with a warm glow
          ctx.save(); ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 26;
          ctx.beginPath(); ctx.roundRect(p.x - p.size * 0.5, p.y - p.size * 0.7, p.size, p.size * 1.4, p.size * 0.35); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(p.x - p.size * 0.12, p.y - p.size * 0.7, p.size * 0.24, p.size * 1.4); ctx.restore();
        }
      }
      ctx.globalAlpha = 1;

      if (el < duration || ps.length > 0) raf = requestAnimationFrame(frame);
      else onDone();
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [kind, onDone]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[80] h-full w-full" />;
}
