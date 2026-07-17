export type NoteParts = { title: string | null; preview: string | null };

// Apple Notes convention: no separate title column — the first non-empty line
// is the title, the next non-empty line is the list preview.
export function noteParts(body: string): NoteParts {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return { title: lines[0] ?? null, preview: lines[1] ?? null };
}
