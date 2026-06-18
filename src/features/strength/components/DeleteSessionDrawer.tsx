import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>⚠️ Usunąć sesję?</DrawerTitle>
            <DrawerDescription>
              {isEnded
                ? "Sesja zostanie nieodwracalnie usunięta wraz ze wszystkimi seriami."
                : "Sesja jest w trakcie. Usunięcie skasuje całość — nie da się tego cofnąć."}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4">
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
          </div>

          <DrawerFooter className="gap-2">
            <Button variant="destructive" className="w-full" disabled={deleting} onClick={handleConfirm}>
              {deleting ? "Usuwam..." : "Tak, usuń"}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">
                Anuluj
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
