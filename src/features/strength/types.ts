import type { SESSION_TYPES, SET_KINDS } from "./constants";
import type { listManagedExercises } from "./server/exercises";
import type { getSessionDetails } from "./server/sessions";

export type SetKind = (typeof SET_KINDS)[number];
export type SessionType = (typeof SESSION_TYPES)[number];

export type SessionDetails = Awaited<ReturnType<typeof getSessionDetails>>;
export type Movement = SessionDetails["movements"][number];
export type SetRow = Movement["sets"][number];
export type ManagedExercise = Awaited<ReturnType<typeof listManagedExercises>>[number];
