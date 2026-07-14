export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "forge-theme";

export function resolveIsDark(theme: Theme, systemPrefersDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && systemPrefersDark);
}

export function getStoredTheme(): Theme {
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function applyTheme(theme: Theme): void {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", resolveIsDark(theme, systemDark));
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
