import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { parseInput } from "@/lib/validate";
import { db } from "../../../../db/client";
import { journalEntries } from "../../../../db/schema";

// Loose notebook (Apple Notes style) on the journal_entries table from the
// FRG-6 schema epic — title stays NULL (the first body line acts as the
// title), tags/aiExtracted stay untouched for the future AI epic.

export const listNotes = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  return db
    .select({ id: journalEntries.id, body: journalEntries.body, updatedAt: journalEntries.updatedAt })
    .from(journalEntries)
    .where(eq(journalEntries.athleteId, athleteId))
    .orderBy(desc(journalEntries.updatedAt));
});

const noteIdInput = z.object({ noteId: z.uuid() });

export const getNote = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => parseInput(noteIdInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [note] = await db
      .select({ id: journalEntries.id, body: journalEntries.body, updatedAt: journalEntries.updatedAt })
      .from(journalEntries)
      .where(and(eq(journalEntries.id, data.noteId), eq(journalEntries.athleteId, athleteId)))
      .limit(1);
    return note ?? null;
  });

export const createNote = createServerFn({ method: "POST" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  const [row] = await db.insert(journalEntries).values({ athleteId, body: "" }).returning({ id: journalEntries.id });
  return row;
});

const updateNoteInput = z.object({ noteId: z.uuid(), body: z.string().max(20000) });

export const updateNote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(updateNoteInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .update(journalEntries)
      .set({ body: data.body, updatedAt: new Date() })
      .where(and(eq(journalEntries.id, data.noteId), eq(journalEntries.athleteId, athleteId)))
      .returning({ id: journalEntries.id, updatedAt: journalEntries.updatedAt });
    if (!row) throw new Error("Nie znaleziono notatki.");
    return row;
  });

export const deleteNote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(noteIdInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    // Hard delete — nothing references journal entries.
    const [row] = await db
      .delete(journalEntries)
      .where(and(eq(journalEntries.id, data.noteId), eq(journalEntries.athleteId, athleteId)))
      .returning({ id: journalEntries.id });
    if (!row) throw new Error("Nie znaleziono notatki.");
    return row;
  });
