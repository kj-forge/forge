import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";

interface BackLinkProps {
  to: LinkProps["to"];
  label: string;
  className?: string;
  // Note editor flushes a pending autosave before the route change.
  onNavigate?: () => void;
}

// Fixed destination, not history.back() — predictable regardless of entry point.
export function BackLink({ to, label, className, onNavigate }: BackLinkProps) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={cn(
        "inline-flex items-center gap-0.5 text-muted-foreground text-xs transition-colors hover:text-foreground",
        className,
      )}
    >
      <ChevronLeft className="size-3.5" />
      {label}
    </Link>
  );
}
