import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { signIn } from "@/features/auth/client";
import { mapAuthError } from "@/features/auth/lib/auth-errors";

const loginSchema = z.object({
  email: z.email("Podaj prawidłowy adres email (np. ty@example.com)").max(64, "Email jest za długi."),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const navigate = useNavigate();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "" },
    mode: "onSubmit",
  });

  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      const result = await signIn.magicLink({ email, callbackURL: "/me" });
      if (result.error) {
        form.setError("root.serverError", {
          type: String(result.error.status),
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

  return (
    <Form {...form}>
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
                  disabled={isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Wysyłam..." : "Wyślij link do logowania"}
        </Button>

        <FormRootMessage />
      </form>
    </Form>
  );
}
