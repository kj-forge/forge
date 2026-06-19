import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/features/auth/client";
import { getErrorMessage } from "@/lib/error-message";

const route = getRouteApi("/me");

export function MeView() {
  const { session } = route.useRouteContext();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
      navigate({ to: "/login" });
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się wylogować."));
      setSigningOut(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between pt-2">
        <Link to="/" className="text-muted-foreground text-sm">
          ← Wróć
        </Link>
      </header>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Twoje konto</CardTitle>
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
          <Button type="button" variant="outline" className="w-full" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? "Wylogowuję..." : "Wyloguj"}
          </Button>
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
