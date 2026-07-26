// Synthesized WebAudio cues for the rest countdown — no audio files, so
// there's nothing for CSP to block and nothing to fetch offline. Every method
// is wrapped in try/catch: a sound failure must never break the stopwatch.

export interface HyroxSounds {
  unlock(): void;
  warnBeep(): void;
  endBell(): void;
  roundGong(): void;
}

// Boxing-ring gong: low fundamental + inharmonic partials with a slow decay —
// this is what makes it read as struck metal instead of a beep.
const GONG_PARTIALS: readonly [freq: number, amp: number][] = [
  [180, 1],
  [277, 0.6],
  [412, 0.35],
  [739, 0.2],
];

function gongStrike(ctx: AudioContext, atOffsetSec: number, gain = 0.5): void {
  const t0 = ctx.currentTime + atOffsetSec;
  const decayEnd = t0 + 1.4;
  for (const [freq, amp] of GONG_PARTIALS) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain * amp, t0);
    g.gain.exponentialRampToValueAtTime(0.001, decayEnd);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(decayEnd + 0.1);
  }
}

export function createHyroxSounds(): HyroxSounds {
  let ctx: AudioContext | null = null;

  function getContext(): AudioContext | null {
    if (ctx) return ctx;
    const Ctor = typeof window !== "undefined" ? window.AudioContext : undefined;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  }

  return {
    // Call on the first user gesture (a tap) — iOS suspends new AudioContexts
    // until a gesture resumes them.
    unlock() {
      try {
        const audio = getContext();
        if (audio && audio.state === "suspended") void audio.resume();
      } catch {
        // Unsupported or blocked by autoplay policy — timer keeps running regardless.
      }
    },
    // 15s-to-go warning: a single, quieter gong strike.
    warnBeep() {
      try {
        const audio = getContext();
        if (!audio) return;
        gongStrike(audio, 0, 0.35);
      } catch {
        // Never let a sound failure break the countdown.
      }
    },
    // Rest countdown hits 0: a single full-strength gong strike.
    endBell() {
      try {
        const audio = getContext();
        if (!audio) return;
        gongStrike(audio, 0, 0.5);
      } catch {
        // Never let a sound failure break the countdown.
      }
    },
    // Round complete (entering rest or blockDone): three strikes, boxing-round style.
    roundGong() {
      try {
        const audio = getContext();
        if (!audio) return;
        gongStrike(audio, 0);
        gongStrike(audio, 0.45);
        gongStrike(audio, 0.9);
      } catch {
        // Never let a sound failure break the countdown.
      }
    },
  };
}
