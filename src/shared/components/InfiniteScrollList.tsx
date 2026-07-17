import { useEffect, useRef } from "react";

import { Spinner } from "./Spinner";

interface InfiniteScrollListProps {
  // Structural subset of UseInfiniteQueryResult — any useInfiniteQuery /
  // useSuspenseInfiniteQuery result fits, whatever its data type.
  query: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  };
  children: React.ReactNode;
  className?: string;
}

// Declarative infinite scroll: render the list (flat or grouped) as children;
// the sentinel below calls fetchNextPage as it nears the viewport. While a
// page is in flight the observer is detached — no double-fire — and if the
// sentinel is still visible when loading ends, the next page chains.
export function InfiniteScrollList({ query, children, className }: InfiniteScrollListProps) {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) fetchNextPage();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className={className}>
      {children}
      {hasNextPage && (
        <div ref={sentinelRef} className="flex justify-center py-3">
          {isFetchingNextPage && <Spinner size="sm" className="text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}
