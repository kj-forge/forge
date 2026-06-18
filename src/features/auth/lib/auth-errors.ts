// Better Auth surfaces raw Zod paths in `message` (e.g. "[body.email] Invalid
// input"). Never render those verbatim — they read as debug output to a Polish
// user. This mapper is the chokepoint that converts raw errors into UI copy.

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
