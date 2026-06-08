import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";

// In-memory counter — purely a demo of the server-function pattern.
// Resets on server restart and won't survive horizontal scaling.
// To be replaced with Postgres + Drizzle in a later PR.
let count = 0;

const getCount = createServerFn({ method: "GET" }).handler(() => count);

const updateCount = createServerFn({ method: "POST" })
  .inputValidator((d: number) => d)
  .handler(({ data }) => {
    count += data;
  });

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => await getCount(),
});

function Home() {
  const router = useRouter();
  const value = Route.useLoaderData();

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <header className="space-y-2">
        <h1 className="font-bold text-4xl tracking-tight">Forge</h1>
        <p className="text-muted-foreground">Hybrid strength, forged daily.</p>
      </header>
      <p className="text-muted-foreground text-sm">Server-function demo (in-memory, to be replaced with Postgres):</p>
      <Button
        size="lg"
        onClick={() => {
          updateCount({ data: 1 }).then(() => {
            router.invalidate();
          });
        }}
      >
        Add 1 to {value}
      </Button>
    </main>
  );
}
