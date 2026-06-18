import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";
import { LoginForm } from "@/features/auth/forms/LoginForm";

export function LoginView() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Zaloguj się do Forge</CardTitle>
          <CardDescription>Wpisz email — wyślemy Ci link do logowania. Bez hasła.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoginForm />

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">albo</span>
            </div>
          </div>

          <GoogleSignInButton />
        </CardContent>
      </Card>
    </main>
  );
}
