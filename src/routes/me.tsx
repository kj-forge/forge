import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/lib/auth-client";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/me")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  component: MePage,
});

function MePage() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate({ to: "/login" });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
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
              <dd className="font-medium">{new Date(session.session.expiresAt).toLocaleString("pl-PL")}</dd>
            </div>
          </dl>
          <Button type="button" variant="outline" className="w-full" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? "Wylogowuję..." : "Wyloguj"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
