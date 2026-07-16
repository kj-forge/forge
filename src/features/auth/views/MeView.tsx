import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const route = getRouteApi("/_shell/me/konto");

export function MeView() {
  const { session } = route.useRouteContext();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Link
        to="/me"
        className="inline-flex items-center gap-0.5 pt-2 text-muted-foreground text-xs transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        Profil
      </Link>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Dane konta</CardTitle>
          <CardDescription>Zalogowany jako…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="space-y-2">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{session.user.email}</dd>
            </div>
            {session.user.name && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Imię</dt>
                <dd className="font-medium">{session.user.name}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Sesja wygasa</dt>
              {/* Server renders the time in UTC (Workers runtime), client in the user's
                  local timezone — guaranteed mismatch on the time portion. Until we wire
                  athlete.timezone through SSR, suppress the warning and let the client
                  re-render with local time on hydration. */}
              <dd className="font-medium" suppressHydrationWarning>
                {new Date(session.session.expiresAt).toLocaleString("pl-PL")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </main>
  );
}
