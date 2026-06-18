import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import { db } from "../../../../db/client";
import { athletes } from "../../../../db/schema";
import { auth } from "./better-auth";

interface CurrentAthlete {
  athleteId: string;
  userId: string;
}

export async function getCurrentAthleteOrThrow(): Promise<CurrentAthlete> {
  const headers = new Headers(getRequestHeaders() as HeadersInit);
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw new Error("Unauthorized — no active session");
  }

  const [athlete] = await db
    .select({ id: athletes.id })
    .from(athletes)
    .where(eq(athletes.userId, session.user.id))
    .limit(1);

  if (!athlete) {
    // Should be impossible after a successful signup hook + ensureAthlete
    // recovery, but surface explicitly rather than silently failing later.
    throw new Error("No athlete row for this user — signup hook may have failed");
  }

  return { athleteId: athlete.id, userId: session.user.id };
}
