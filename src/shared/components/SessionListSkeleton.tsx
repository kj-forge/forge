import { Skeleton } from "@/components/ui/skeleton";

const PLACEHOLDER_CARDS = ["first", "second", "third"];

// Route-level pending state for the session list pages: mirrors the card
// layout so the swap to real content doesn't shift the page.
export function SessionListSkeleton() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4" aria-busy="true">
      <Skeleton className="mt-2 h-7 w-40" />
      {PLACEHOLDER_CARDS.map((id) => (
        <div key={id} className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3 w-28" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </main>
  );
}
