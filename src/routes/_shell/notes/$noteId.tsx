import { createFileRoute, redirect } from "@tanstack/react-router";

import { getNote } from "@/features/notes/server/notes";
import { NoteEditorView } from "@/features/notes/views/NoteEditorView";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

export const Route = createFileRoute("/_shell/notes/$noteId")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: ({ params }) => getNote({ data: { noteId: params.noteId } }),
  // An editor must open with authoritative content. The router's default
  // stale-while-revalidate would serve the cached body from BEFORE the
  // autosaves of the previous visit (and the textarea seeds once, so the
  // background refresh never reaches it) — no caching for this match.
  gcTime: 0,
  staleTime: 0,
  pendingComponent: SessionListSkeleton,
  component: NoteEditorView,
});
