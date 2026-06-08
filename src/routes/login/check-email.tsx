import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const searchSchema = z.object({
  email: z.string().optional(),
});

export const Route = createFileRoute("/login/check-email")({
  validateSearch: searchSchema,
  component: CheckEmailPage,
});

function CheckEmailPage() {
  const { email } = Route.useSearch();

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>Sprawdź skrzynkę</CardTitle>
          <CardDescription>
            {email ? (
              <>
                Wysłaliśmy link do logowania na <strong>{email}</strong>.
              </>
            ) : (
              <>Wysłaliśmy link do logowania na Twój email.</>
            )}
            <br />
            Link wygasa po 5 minutach.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Nie widzisz maila? Sprawdź spam lub spróbuj ponownie.</p>
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Wróć do logowania
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
