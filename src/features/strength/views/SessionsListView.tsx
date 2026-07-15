import { getRouteApi } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { SessionListItem } from "@/features/strength/components/SessionListItem";

const route = getRouteApi("/_shell/sessions/");

export function SessionsListView() {
  const sessionsList = route.useLoaderData();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="pt-2 font-bold text-2xl tracking-tight">Historia sesji</h1>

      {sessionsList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground text-sm">
            <BookOpen className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
            Brak zakończonych sesji.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {sessionsList.map((s) => (
            <SessionListItem key={s.id} session={s} detail="names" />
          ))}
        </ul>
      )}
    </main>
  );
}
