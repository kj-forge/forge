import { Link, useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

// Router's defaultErrorComponent — replaces TanStack's English fallback when a
// loader throws mid-session. router.invalidate() re-runs the failed loaders,
// flipping the errored matches back to pending (the retry).
export function RouteError() {
  const router = useRouter();

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <div className="space-y-1">
        <h1 className="font-bold text-2xl tracking-tight">Coś poszło nie tak</h1>
        <p className="text-muted-foreground text-sm">Nie udało się załadować danych. Spróbuj ponownie.</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={() => router.invalidate()}>
          Spróbuj ponownie
        </Button>
        <Link to="/">
          <Button type="button" variant="outline">
            Strona główna
          </Button>
        </Link>
      </div>
    </main>
  );
}
