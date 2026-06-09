import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/session";
import { createSession, getLastSessionLikeByDow } from "@/lib/strength";

const SESSION_TYPES = [
  "STRENGTH",
  "HYROX_EMOM",
  "HYROX_AMRAP",
  "HYROX_WORK",
  "CARDIO",
  "COMPROMISED_RUN",
  "REHAB",
  "MOBILITY",
] as const;

const searchSchema = z.object({
  type: z.enum(SESSION_TYPES).default("STRENGTH"),
});

export const Route = createFileRoute("/sessions/new")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ type: search.type }),
  loader: ({ deps }) => {
    const dayOfWeek = new Date().getDay();
    return getLastSessionLikeByDow({ data: { type: deps.type, dayOfWeek } });
  },
  component: NewSessionPage,
});

const SESSION_TYPE_LABEL_PL: Record<(typeof SESSION_TYPES)[number], string> = {
  STRENGTH: "siłowa",
  HYROX_EMOM: "Hyrox EMOM",
  HYROX_AMRAP: "Hyrox AMRAP",
  HYROX_WORK: "Hyrox WORK",
  CARDIO: "cardio",
  COMPROMISED_RUN: "compromised run",
  REHAB: "rehab",
  MOBILITY: "mobility",
};

const DAY_OF_WEEK_PL = ["niedzielna", "poniedziałkowa", "wtorkowa", "środowa", "czwartkowa", "piątkowa", "sobotnia"];

function NewSessionPage() {
  const { type } = Route.useSearch();
  const lastSession = Route.useLoaderData();
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
      setError(err instanceof Error ? err.message : "Nie udało się utworzyć sesji.");
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
        <h1 className="font-bold text-2xl tracking-tight">Nowa sesja {SESSION_TYPE_LABEL_PL[type]}</h1>
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
