import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SESSION_TYPE_LABEL_PL_ADJ } from "@/features/strength/constants";
import { createSession } from "@/features/strength/server/sessions";
import { getErrorMessage } from "@/lib/error-message";

const route = getRouteApi("/sessions/new");

const DAY_OF_WEEK_PL = ["niedzielna", "poniedziałkowa", "wtorkowa", "środowa", "czwartkowa", "piątkowa", "sobotnia"];

export function NewSessionView() {
  const { type } = route.useSearch();
  const lastSession = route.useLoaderData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<"template" | "blank" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayDow = new Date().getDay();

  const start = async (fromTemplateSessionId?: string) => {
    setError(null);
    setCreating(fromTemplateSessionId ? "template" : "blank");
    try {
      const result = await createSession({
        data: { type, date: todayIso, fromTemplateSessionId },
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
        {/* `todayDow` and the toLocaleDateString below derive from `new Date()` evaluated
            during render, which uses UTC on the server (Workers runtime) and local
            timezone on the client. Near midnight in the user's TZ the displayed day can
            differ from the SSR-rendered one — suppress hydration warning, the client
            re-renders with the correct local value on mount. */}
        <p className="text-muted-foreground text-sm" suppressHydrationWarning>
          {DAY_OF_WEEK_PL[todayDow]?.replace(/.$/, "y") /* niedzieln-y/wtorkow-y */} ·{" "}
          {new Date().toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}
        </p>
      </div>

      {lastSession ? (
        <Card>
          <CardHeader>
            <CardTitle>🔄 Z poprzedniej sesji</CardTitle>
            <CardDescription>
              {DAY_OF_WEEK_PL[new Date(lastSession.date).getDay()]} sesja ·{" "}
              {new Date(lastSession.date).toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => start(lastSession.id)} disabled={creating !== null}>
              {creating === "template" ? "Tworzę..." : "Użyj jako template"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>🆕 Pusta sesja</CardTitle>
          <CardDescription>Zacznij od zera — sam dodajesz ćwiczenia.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant={lastSession ? "outline" : "default"}
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
