import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applyTheme, getStoredTheme, MOBILE_DEFAULT_DARK_QUERY, setTheme, type Theme } from "@/shared/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Jasny", icon: Sun },
  { value: "dark", label: "Ciemny", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => (typeof window === "undefined" ? "system" : getStoredTheme()));

  // While on "Auto", live-follow the device default across the breakpoint.
  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia(MOBILE_DEFAULT_DARK_QUERY);
    const onChange = () => applyTheme("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  const pick = (t: Theme) => {
    setTheme(t);
    setThemeState(t);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Zmień motyw">
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onClick={() => pick(o.value)}
            className={theme === o.value ? "text-primary" : undefined}
          >
            <o.icon />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
