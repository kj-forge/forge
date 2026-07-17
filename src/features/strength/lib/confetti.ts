// Hand-rolled ember confetti — two bottom-corner cannons, ~1.6s, then the
// canvas removes itself. Deliberately dependency-free.

const COLORS = ["#ff6a00", "#ffb25c", "#ffd166", "#f5f2ee"];
const COUNT = 90;
const DURATION_MS = 1600;
const GRAVITY = 0.05;
const DRAG = 0.992;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
};

export function fireConfetti(): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999";
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const w = window.innerWidth;
  const h = window.innerHeight;
  const particles: Particle[] = Array.from({ length: COUNT }, (_, i) => {
    // Alternate cannons: bottom-left fires up-right, bottom-right up-left.
    const fromLeft = i % 2 === 0;
    const angle = (fromLeft ? -60 : -120) + (Math.random() - 0.5) * 50;
    const rad = (angle * Math.PI) / 180;
    const speed = 9 + Math.random() * 8;
    return {
      x: fromLeft ? -10 : w + 10,
      y: h * (0.75 + Math.random() * 0.2),
      vx: Math.cos(rad) * speed * (fromLeft ? 1 : -1) * -1,
      vy: Math.sin(rad) * speed,
      size: 5 + Math.random() * 5,
      color: COLORS[i % COLORS.length] as string,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
    };
  });

  const start = performance.now();
  const frame = (now: number) => {
    const elapsed = now - start;
    ctx.clearRect(0, 0, w, h);
    const fade = elapsed > DURATION_MS - 400 ? Math.max(0, (DURATION_MS - elapsed) / 400) : 1;
    for (const p of particles) {
      p.vx *= DRAG;
      p.vy = p.vy * DRAG + GRAVITY * 16;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (elapsed < DURATION_MS) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
