import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SESSION_TYPE_LABEL_PL_ADJ } from "@/features/strength/constants";
import { createSession } from "@/features/strength/server/sessions";
import { getErrorMessage } from "@/lib/error-message";

const route = getRouteApi("/sessions/new");

// "czwartek, 12 czerwca" → "Czwartek, 12 czerwca". A date-only string at UTC
// midnight + Poland's positive offset stays on the same calendar day, so SSR
// (UTC) and client (local) agree — no hydration mismatch.
function formatTemplateDate(dateStr: string): string {
  const formatted = new Date(dateStr).toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function NewSessionView() {
  const { type } = route.useSearch();
  const templates = route.useLoaderData();
  const navigate = useNavigate();
  // Tracks which action is in flight: a template's sessionId, "blank", or none.
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (fromTemplateSessionId?: string) => {
    setError(null);
    setCreating(fromTemplateSessionId ?? "blank");
    try {
      const result = await createSession({
        // Local calendar date at click time (client tz), not UTC — `dayjs()`
        // defaults to local, so a session started after local midnight gets
        // today's date, not yesterday's.
        data: { type, date: dayjs().format("YYYY-MM-DD"), fromTemplateSessionId },
      });
      navigate({ to: "/sessions/$sessionId", params: { sessionId: result.sessionId } });
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się utworzyć sesji."));
      setCreating(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between pt-2">
        <Link to="/" className="text-muted-foreground text-sm">
          ← Wróć
        </Link>
      </header>

      <div className="space-y-1 pt-2">
        <h1 className="font-bold text-2xl tracking-tight">Nowa sesja {SESSION_TYPE_LABEL_PL_ADJ[type]}</h1>
        {templates.length > 0 ? (
          <p className="text-muted-foreground text-sm">Zacznij od ostatniej sesji albo od zera.</p>
        ) : null}
      </div>

      {templates.map((t) => (
        <Card key={t.sessionId}>
          <CardHeader>
            <CardTitle className="text-base">{formatTemplateDate(t.date)}</CardTitle>
            <CardDescription>{t.exercises.join(" · ")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => start(t.sessionId)} disabled={creating !== null}>
              {creating === t.sessionId ? "Tworzę..." : "Użyj jako bazę"}
            </Button>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">🆕 Pusta sesja</CardTitle>
          <CardDescription>Zacznij od zera — sam dodajesz ćwiczenia.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant={templates.length > 0 ? "outline" : "default"}
            className="w-full"
            onClick={() => start()}
            disabled={creating !== null}
          >
            {creating === "blank" ? "Tworzę..." : "Pusta sesja"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
