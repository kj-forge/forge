import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/login/")({
  // If the user already has a session, skip the login form.
  beforeLoad: async () => {
    const session = await getSession();
    if (session) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isSubmittingMagic, setIsSubmittingMagic] = useState(false);
  const [isSubmittingGoogle, setIsSubmittingGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmittingMagic(true);
    try {
      const result = await signIn.magicLink({
        email,
        callbackURL: "/me",
      });
      if (result.error) {
        setError(result.error.message ?? "Nie udało się wysłać linka. Spróbuj ponownie.");
        return;
      }
      navigate({ to: "/login/check-email", search: { email } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
    } finally {
      setIsSubmittingMagic(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setIsSubmittingGoogle(true);
    try {
      await signIn.social({
        provider: "google",
        callbackURL: "/me",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logowanie przez Google nie powiodło się.");
      setIsSubmittingGoogle(false);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Zaloguj się do Forge</CardTitle>
          <CardDescription>Wpisz email — wyślemy Ci link do logowania. Bez hasła.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-3" onSubmit={handleMagicLink}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="ty@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmittingMagic || isSubmittingGoogle}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmittingMagic || isSubmittingGoogle}>
              {isSubmittingMagic ? "Wysyłam..." : "Wyślij link do logowania"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">albo</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogle}
            disabled={isSubmittingMagic || isSubmittingGoogle}
          >
            {isSubmittingGoogle ? "Przekierowuję..." : "Kontynuuj przez Google"}
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
