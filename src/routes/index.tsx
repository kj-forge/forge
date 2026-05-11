import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

// In-memory counter — purely a demo of the server-function pattern.
// Resets on server restart and won't survive horizontal scaling.
// To be replaced with Postgres + Drizzle (FRG-* in a later PR).
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
    <main>
      <h1>Forge</h1>
      <p>Hybrid strength, forged daily.</p>
      <p>Server-function demo (in-memory, to be replaced with Postgres):</p>
      <button
        type="button"
        onClick={() => {
          updateCount({ data: 1 }).then(() => {
            router.invalidate();
          });
        }}
      >
        Add 1 to {value}
      </button>
    </main>
  );
}
