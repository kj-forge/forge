import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";
import { mapAuthError } from "@/lib/auth-errors";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/login/")({
  // If the user already has a session, skip the login form.
  beforeLoad: async () => {
    const session = await getSession();
    if (session) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

// Polish messages live with the schema, not the JSX. zodResolver is the only
// validator (HTML5 `type="email"` is too permissive, so we noValidate the form
// below). Validators run in declaration order: .min(1) first catches the empty
// case with the "required" message, .email() then validates format. If we
// reversed it (or used the v4-preferred top-level `z.email()`), an empty
// string would fail the email format check first and surface the wrong
// message ("invalid email" instead of "required").
const loginSchema = z.object({
  email: z.string().min(1, "Email jest wymagany.").email("Nieprawidłowy adres email. Sprawdź pisownię."),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginPage() {
  const navigate = useNavigate();

  // Google is OUTSIDE the <form> element (different flow — kicks off an OAuth
  // redirect, no email field). Its loading state cannot ride on
  // form.formState.isSubmitting, so keep it as a local useState.
  const [isSubmittingGoogle, setIsSubmittingGoogle] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "" }, // keeps the input controlled from first render
    mode: "onSubmit", // validation runs on submit, not while typing
  });

  const isSubmitting = form.formState.isSubmitting;
  const anySubmitting = isSubmitting || isSubmittingGoogle;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    // Better Auth resolves with { data, error } and does NOT throw on
    // validation / rate-limit errors. The try/catch only catches genuine
    // network failures (offline, DNS error, etc.).
    try {
      const result = await signIn.magicLink({ email, callbackURL: "/me" });
      if (result.error) {
        // `root.serverError` is RHF's documented namespace for form-level
        // errors. It auto-clears on the next submit and does NOT block
        // isValid or subsequent submission attempts.
        form.setError("root.serverError", {
          type: String(result.error.status ?? "server"),
          message: mapAuthError(result.error),
        });
        return;
      }
      navigate({ to: "/login/check-email", search: { email } });
    } catch (err) {
      form.setError("root.serverError", {
        type: "network",
        message: mapAuthError(err),
      });
    }
  });

  const handleGoogle = async () => {
    form.clearErrors("root.serverError");
    setIsSubmittingGoogle(true);
    // Fallback reset — if the redirect fires successfully, the page tears down
    // and the timer is irrelevant. But on iOS Safari + PWA, the OS can show an
    // AutoFill prompt that intercepts the redirect; if the user dismisses it,
    // `signIn.social`'s promise neither resolves nor rejects, and the button
    // would stay disabled forever. 5s lets the user retry without reload.
    // Goes away when passkeys land (PR-C) — at that point Google OAuth becomes
    // a fallback and this stuck-state path stops mattering.
    const resetTimer = setTimeout(() => setIsSubmittingGoogle(false), 5000);
    try {
      await signIn.social({ provider: "google", callbackURL: "/me" });
    } catch (err) {
      clearTimeout(resetTimer);
      form.setError("root.serverError", {
        type: "google",
        message: err instanceof Error ? err.message : "Logowanie przez Google nie powiodło się.",
      });
      setIsSubmittingGoogle(false);
    }
    // No finally clearing the timer on success: when navigation succeeds the
    // page tears down and the timer becomes irrelevant.
  };

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Zaloguj się do Forge</CardTitle>
          <CardDescription>Wpisz email — wyślemy Ci link do logowania. Bez hasła.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            {/* noValidate disables the native browser email check — Zod is the only validator. */}
            <form className="space-y-3" onSubmit={onSubmit} noValidate>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="ty@example.com"
                        disabled={anySubmitting}
                        {...field}
                      />
                    </FormControl>
                    {/* Per-field Zod error — auto-wired via useFormField() context. */}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={anySubmitting}>
                {isSubmitting ? "Wysyłam..." : "Wyślij link do logowania"}
              </Button>

              {/* Form-level server error (rate limit, network, Better Auth response).
                  Must live inside <Form> for useFormState() context, but OUTSIDE any FormField. */}
              <FormRootMessage />
            </form>
          </Form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">albo</span>
            </div>
          </div>

          {/* type="button" is belt-and-suspenders so a stray click can't submit the email form. */}
          <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={anySubmitting}>
            {isSubmittingGoogle ? "Przekierowuję..." : "Kontynuuj przez Google"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
