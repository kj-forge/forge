import { getRouteApi, Link } from "@tanstack/react-router";

import { Card, CardContent } from "@/components/ui/card";
import { SessionListItem } from "@/features/strength/components/SessionListItem";

const route = getRouteApi("/sessions/");

export function SessionsListView() {
  const sessionsList = route.useLoaderData();

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between pt-2">
        <Link to="/" className="text-muted-foreground text-sm">
          ← Wróć
        </Link>
      </header>

      <h1 className="font-bold text-2xl tracking-tight">Historia sesji</h1>

      {sessionsList.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">Jeszcze brak sesji.</CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {sessionsList.map((s) => (
            <SessionListItem key={s.id} session={s} />
          ))}
        </ul>
      )}
    </main>
  );
}
