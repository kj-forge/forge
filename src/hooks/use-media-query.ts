import { useEffect, useState } from "react";

// SSR-safe media query. Starts false (mobile-first) on the server and the first
// client render, then syncs on mount. A modal's content isn't rendered until
// it opens (post-mount), so the initial false never causes a visible flash.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

// Tailwind's `md` breakpoint. At/above → desktop (centered Dialog); below →
// mobile (bottom sheet).
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
