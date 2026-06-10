// ============================================================================
// Forge — Better Auth client error mapping
// ============================================================================
// Better Auth's client returns `{ data, error }` shape and does NOT throw on
// HTTP error responses — failures land in `error` with a numeric `status` plus
// a raw `message` string that often contains internal Zod paths (e.g.,
// "[body.email] Invalid input"). Never surface those verbatim — they leak
// implementation details to users and read as garbage in Polish UI.
//
// Branch on numeric status first (stable across versions), fall back to
// substring match only when status doesn't disambiguate. Add new branches
// only when a new auth flow surfaces a distinct status code.
// ============================================================================

type AuthErrorLike = {
  status?: number;
  statusCode?: number;
  message?: string;
  code?: string;
};

export function mapAuthError(err: AuthErrorLike | unknown): string {
  const e = (err ?? {}) as AuthErrorLike;
  const status = e.status ?? e.statusCode;

  if (status === 429) return "Za dużo prób. Spróbuj ponownie za chwilę.";
  if (status === 422 || e.message?.includes("[body.email]")) {
    return "Nieprawidłowy adres email.";
  }
  if (e.message?.toLowerCase().includes("rate")) {
    return "Za dużo prób. Spróbuj ponownie za chwilę.";
  }
  return "Nie udało się wysłać linka. Spróbuj ponownie.";
}
