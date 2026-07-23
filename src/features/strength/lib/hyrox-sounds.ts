// Synthesized WebAudio cues for the rest countdown — no audio files, so
// there's nothing for CSP to block and nothing to fetch offline. Every method
// is wrapped in try/catch: a sound failure must never break the stopwatch.

export interface HyroxSounds {
  unlock(): void;
  warnBeep(): void;
  endBell(): void;
}

function strike(ctx: AudioContext, atOffsetSec: number, freqStart: number, freqEnd: number, peakGain: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t0 = ctx.currentTime + atOffsetSec;
  const duration = 0.5;

  osc.type = "triangle";
  osc.frequency.setValueAtTime(freqStart, t0);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
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
    warnBeep() {
      try {
        const audio = getContext();
        if (!audio) return;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const t0 = audio.currentTime;
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, t0);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(0.25, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(t0);
        osc.stop(t0 + 0.2);
      } catch {
        // Never let a sound failure break the countdown.
      }
    },
    // Boxing-ring bell: two strikes ~600 -> 400 Hz, ~250ms apart.
    endBell() {
      try {
        const audio = getContext();
        if (!audio) return;
        strike(audio, 0, 600, 400, 0.35);
        strike(audio, 0.25, 600, 400, 0.35);
      } catch {
        // Never let a sound failure break the countdown.
      }
    },
  };
}
