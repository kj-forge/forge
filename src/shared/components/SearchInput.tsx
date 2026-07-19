import { Search } from "lucide-react";
import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// One look for every "filter this list" surface (plans, notes): a search
// input with the leading glyph. Drawer pickers with result dropdowns keep
// their plain inputs — different context, tighter space.
export function SearchInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" className={cn("pl-8", className)} {...props} />
    </div>
  );
}
