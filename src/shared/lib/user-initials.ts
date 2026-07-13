// Avatar fallback: up to two initials from the display name, else the first
// letter of the email, else "?".
export function userInitials(name?: string | null, email?: string | null): string {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length > 0) {
    return words
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }
  const emailFirst = email?.trim()[0];
  return emailFirst ? emailFirst.toUpperCase() : "?";
}
