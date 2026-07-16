// "system" is the stored value of the "Auto" option: dark on mobile, light on
// desktop (device class, not OS preference — a phone in a gym wants dark, a
// desk browser wants light). Explicit "light"/"dark" are absolute.
export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "forge-theme";

// Complement of Tailwind's md breakpoint — keep in sync with the shell.
export const MOBILE_DEFAULT_DARK_QUERY = "(min-width: 768px)";

export function resolveIsDark(theme: Theme, autoDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && autoDark);
}

export function getStoredTheme(): Theme {
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function applyTheme(theme: Theme): void {
  const autoDark = !window.matchMedia(MOBILE_DEFAULT_DARK_QUERY).matches;
  document.documentElement.classList.toggle("dark", resolveIsDark(theme, autoDark));
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  // Flip every color in ONE frame: elements carry mixed transition
  // durations (cards ~150ms, buttons transition-all, body none), so an
  // unsuppressed class flip repaints staggered and reads as a glitch.
  const suppress = document.createElement("style");
  suppress.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(suppress);
  applyTheme(theme);
  // Force a reflow so the flip lands while transitions are off.
  window.getComputedStyle(document.documentElement).opacity;
  requestAnimationFrame(() => suppress.remove());
}
