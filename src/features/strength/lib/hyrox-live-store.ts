import type { HyroxTimerState } from "./hyrox-timer";

interface LiveStateEnvelope {
  v: 1;
  sessionId: string;
  state: HyroxTimerState;
}

export function serializeLiveState(sessionId: string, state: HyroxTimerState): string {
  const envelope: LiveStateEnvelope = {
    v: 1,
    sessionId,
    state,
  };
  return JSON.stringify(envelope);
}

export function parseLiveState(sessionId: string, raw: string | null): HyroxTimerState | null {
  if (raw === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const envelope = parsed as Record<string, unknown>;

    if (envelope.v !== 1) {
      return null;
    }

    if (envelope.sessionId !== sessionId) {
      return null;
    }

    const state = envelope.state;
    if (!state || typeof state !== "object") {
      return null;
    }

    return state as HyroxTimerState;
  } catch {
    return null;
  }
}

export const liveStateKey = (sessionId: string) => `forge:hyrox-live:${sessionId}`;
