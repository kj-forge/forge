import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { parseInput } from "@/lib/validate";
import { db } from "../../../../db/client";
import { createPool } from "../../../../db/pool";
import { blockMovements, sessionBlocks, sessionSegments, sessions, sets } from "../../../../db/schema";

const segmentInput = z
  .object({
    roundNumber: z.number().int().min(1).max(99),
    orderIndex: z.number().int().min(0).max(9999),
    kind: z.enum(["STATION", "ROX_ZONE", "REST"]),
    blockMovementId: z.uuid().optional(),
    durationMs: z.number().int().min(0).max(86_400_000),
  })
  .refine((s) => (s.kind === "STATION" ? !!s.blockMovementId : !s.blockMovementId), {
    message: "Segment stacji musi wskazywać ćwiczenie, pozostałe nie mogą.",
  });

const saveHyroxSegmentsInput = z.object({
  sessionId: z.uuid(),
  blockId: z.uuid(),
  segments: z.array(segmentInput).min(1).max(200),
});

// NOT exported — keeps the pool import out of the client bundle (same pattern
// as runCreateSession). Idempotent: the unique (blockId, roundNumber,
// orderIndex) index absorbs retries; sets mirror rows are written only for
// segments actually inserted this call, so a retry never doubles them.
async function runSaveHyroxSegments(args: {
  athleteId: string;
  sessionId: string;
  blockId: string;
  segments: z.infer<typeof segmentInput>[];
}): Promise<{ inserted: number }> {
  const { db: tx_db, end } = await createPool();
  try {
    return await tx_db.transaction(async (tx) => {
      const inserted = await tx
        .insert(sessionSegments)
        .values(
          args.segments.map((s) => ({
            athleteId: args.athleteId,
            sessionId: args.sessionId,
            blockId: args.blockId,
            roundNumber: s.roundNumber,
            orderIndex: s.orderIndex,
            kind: s.kind,
            blockMovementId: s.blockMovementId ?? null,
            durationMs: s.durationMs,
          })),
        )
        .onConflictDoNothing({
          target: [sessionSegments.blockId, sessionSegments.roundNumber, sessionSegments.orderIndex],
        })
        .returning({ roundNumber: sessionSegments.roundNumber, orderIndex: sessionSegments.orderIndex });
      // Composite key: the client's orderIndex is per-block monotonic, but the mirror must stay correct for any client.
      const insertedKeys = new Set(inserted.map((r) => `${r.roundNumber}:${r.orderIndex}`));
      const mirror = args.segments.filter(
        (s) => s.kind === "STATION" && insertedKeys.has(`${s.roundNumber}:${s.orderIndex}`),
      );
      if (mirror.length > 0) {
        await tx.insert(sets).values(
          mirror.map((s) => ({
            athleteId: args.athleteId,
            blockMovementId: s.blockMovementId as string,
            setNumber: s.roundNumber,
            durationSeconds: Math.round(s.durationMs / 1000),
            kind: "WORK" as const,
          })),
        );
      }
      return { inserted: inserted.length };
    });
  } finally {
    await end();
  }
}

export const saveHyroxSegments = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(saveHyroxSegmentsInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [block] = await db
      .select({ id: sessionBlocks.id, sessionId: sessionBlocks.sessionId })
      .from(sessionBlocks)
      .where(and(eq(sessionBlocks.id, data.blockId), eq(sessionBlocks.athleteId, athleteId)));
    if (!block || block.sessionId !== data.sessionId) throw new Error("Nie znaleziono bloku sesji.");
    const [session] = await db
      .select({ endedAt: sessions.endedAt })
      .from(sessions)
      .where(and(eq(sessions.id, data.sessionId), eq(sessions.athleteId, athleteId)));
    if (!session) throw new Error("Nie znaleziono sesji.");
    if (session.endedAt) throw new Error("Sesja jest już zakończona.");
    const movementIds = data.segments.flatMap((s) => (s.blockMovementId ? [s.blockMovementId] : []));
    if (movementIds.length > 0) {
      const owned = await db
        .select({ id: blockMovements.id })
        .from(blockMovements)
        .where(and(eq(blockMovements.blockId, data.blockId), inArray(blockMovements.id, movementIds)));
      if (owned.length !== new Set(movementIds).size) throw new Error("Segment wskazuje ćwiczenie spoza bloku.");
    }
    return runSaveHyroxSegments({ athleteId, ...data });
  });
