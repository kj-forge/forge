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
  pendingComponent: SessionListSkeleton,
  component: NoteEditorView,
});
