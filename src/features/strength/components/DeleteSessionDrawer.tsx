import { TriangleAlert } from "lucide-react";
import { useState } from "react";

import { getErrorMessage } from "@/lib/error-message";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";

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
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Usunąć sesję?"
      titleIcon={<TriangleAlert className="size-5 text-destructive" />}
      description={
        isEnded
          ? "Sesja zostanie nieodwracalnie usunięta wraz ze wszystkimi seriami."
          : "Sesja jest w trakcie. Usunięcie skasuje całość — nie da się tego cofnąć."
      }
      error={error}
      confirmLabel="Tak, usuń"
      pending={deleting}
      onConfirm={() => void handleConfirm()}
    />
  );
}
