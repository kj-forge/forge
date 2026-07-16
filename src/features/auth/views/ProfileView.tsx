import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/client";
import { getErrorMessage } from "@/lib/error-message";
import { MANAGE_SECTIONS } from "@/shared/lib/nav";
import { userInitials } from "@/shared/lib/user-initials";

const route = getRouteApi("/_shell/me/");

export function ProfileView() {
  const { session } = route.useRouteContext();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
      navigate({ to: "/login" });
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się wylogować."));
      setSigningOut(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <h1 className="pt-2 font-bold text-2xl tracking-tight">Profil</h1>

      <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
        <Avatar className="size-11">
          <AvatarImage src={session.user.image ?? undefined} alt={session.user.name ?? "Avatar"} />
          <AvatarFallback>{userInitials(session.user.name, session.user.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          {session.user.name && <p className="truncate font-semibold text-sm">{session.user.name}</p>}
          <p className="truncate text-muted-foreground text-sm">{session.user.email}</p>
        </div>
      </div>

      {MANAGE_SECTIONS.map((section) => (
        <section key={section.label} className="flex flex-col gap-1.5">
          <h2 className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">{section.label}</h2>
          <ul className="overflow-hidden rounded-xl border bg-card">
            {section.items.map((item) => (
              <li key={item.to} className="border-b last:border-b-0">
                <Link
                  to={item.to}
                  className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent"
                >
                  <item.icon className="size-4.5 text-muted-foreground" />
                  <span className="flex-1 font-medium">{item.label}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Button type="button" variant="outline" className="w-full" onClick={handleSignOut} disabled={signingOut}>
        {signingOut ? "Wylogowuję..." : "Wyloguj"}
      </Button>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
