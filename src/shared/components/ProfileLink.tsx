import { Link } from "@tanstack/react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession } from "@/features/auth/client";
import { userInitials } from "@/shared/lib/user-initials";

// The avatar is a plain link to the Profil hub — identity, library and
// account actions all live there (no dropdown to keep in sync with it).
export function ProfileLink() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <Link to="/me" aria-label="Profil" className="rounded-full outline-none focus-visible:ring-2">
      <Avatar className="size-8">
        <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? "Avatar"} />
        <AvatarFallback className="text-xs">{userInitials(user?.name, user?.email)}</AvatarFallback>
      </Avatar>
    </Link>
  );
}
