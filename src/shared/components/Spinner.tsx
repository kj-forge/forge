import { cn } from "@/lib/utils";

interface SpinnerProps {
  /** "sm" ≈ 16px (inline buttons), "md" ≈ 32px (page-level loader). */
  size?: "sm" | "md";
  className?: string;
}

export function Spinner({ size = "md", className }: SpinnerProps) {
  const sizeClass = size === "sm" ? "size-4" : "size-8";
  return (
    <svg
      className={cn("animate-spin", sizeClass, className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
