// Polish letters NFD-decompose except ł/Ł, which needs its own mapping.
const POLISH_L = /[łŁ]/g;

/**
 * URL-safe slug for a user-typed exercise name: lowercase ASCII, hyphens for
 * separators. Slugs only need to be unique per athlete (partial index) and
 * readable in /stats/$slug URLs — collisions get suffixed by the caller.
 */
export function slugify(name: string): string {
  const slug = name
    .replace(POLISH_L, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "cwiczenie";
}
