import confetti from "canvas-confetti";

// Ember-family palette on the library's tuned physics — two side cannons
// plus a center burst, like the celebration patterns the pros ship.
const COLORS = ["#ff6a00", "#ffb25c", "#ffd166", "#f5f2ee"];

export function fireConfetti(): void {
  if (typeof window === "undefined") return;

  const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 9999, ticks: 220 };
  confetti({ ...base, particleCount: 55, angle: 60, spread: 60, startVelocity: 55, origin: { x: 0, y: 0.85 } });
  confetti({ ...base, particleCount: 55, angle: 120, spread: 60, startVelocity: 55, origin: { x: 1, y: 0.85 } });
  // A softer, wider follow-up from the bottom center fills the middle.
  confetti({
    ...base,
    particleCount: 45,
    angle: 90,
    spread: 100,
    startVelocity: 45,
    origin: { x: 0.5, y: 1 },
    scalar: 0.9,
  });
}
