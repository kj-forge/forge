import { cn } from "@/lib/utils";

// Wordmark: heavy "Forge" with the g dipped in ember — the single point of
// truth for the logo (mobile header, desktop sidebar, login).
export function ForgeLogo({ className }: { className?: string }) {
  return (
    <span className={cn("font-black font-heading tracking-tight", className)}>
      For
      <span className="bg-linear-to-r from-[#ff6a00] to-[#ffb25c] bg-clip-text text-transparent">g</span>e
    </span>
  );
}
