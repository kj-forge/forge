import { useState } from "react";

import { Button } from "@/components/ui/button";
import { signIn } from "@/features/auth/client";
import { getErrorMessage } from "@/lib/error-message";

export function GoogleSignInButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setError(null);
    setIsSubmitting(true);
    // Fallback reset — iOS AutoFill cancel prevents the redirect, the promise
    // never resolves and the button would stay disabled forever. 5s timer
    // lets the user retry without reloading.
    const resetTimer = setTimeout(() => setIsSubmitting(false), 5000);
    try {
      await signIn.social({ provider: "google", callbackURL: "/me" });
    } catch (err) {
      clearTimeout(resetTimer);
      setError(getErrorMessage(err, "Logowanie przez Google nie powiodło się."));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={isSubmitting}>
        {isSubmitting ? "Przekierowuję..." : "Kontynuuj przez Google"}
      </Button>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
