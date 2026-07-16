import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/error-message";

interface DeleteSessionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEnded: boolean;
  onConfirm: () => Promise<void>;
}

export function DeleteSessionDrawer({ open, onOpenChange, isEnded, onConfirm }: DeleteSessionDrawerProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setDeleting(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się usunąć sesji."));
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet>
        <div className="mx-auto w-full max-w-md">
          <DialogHeader>
            <DialogTitle>⚠️ Usunąć sesję?</DialogTitle>
            <DialogDescription>
              {isEnded
                ? "Sesja zostanie nieodwracalnie usunięta wraz ze wszystkimi seriami."
                : "Sesja jest w trakcie. Usunięcie skasuje całość — nie da się tego cofnąć."}
            </DialogDescription>
          </DialogHeader>

          <div className="px-4">
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="destructive" className="w-full" disabled={deleting} onClick={handleConfirm}>
              {deleting ? "Usuwam..." : "Tak, usuń"}
            </Button>
            <DialogClose asChild>
              <Button variant="outline" className="w-full">
                Anuluj
              </Button>
            </DialogClose>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
