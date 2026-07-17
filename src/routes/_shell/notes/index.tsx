import { createFileRoute, redirect } from "@tanstack/react-router";

import { listNotes } from "@/features/notes/server/notes";
import { NotesListView } from "@/features/notes/views/NotesListView";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

export const Route = createFileRoute("/_shell/notes/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: () => listNotes(),
  pendingComponent: SessionListSkeleton,
  component: NotesListView,
});
