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
import { Spinner } from "@/shared/components/Spinner";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  error?: string | null;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
}

// Shared destructive confirmation sheet — replaces per-component two-tap
// inline confirm toggles.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  error,
  confirmLabel,
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent mobileSheet showCloseButton={false} {...(description ? {} : { "aria-describedby": undefined })}>
        <div className="mx-auto w-full max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>

          {error ? (
            <p className="px-4 text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? <Spinner size="sm" /> : confirmLabel}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="w-full" disabled={pending}>
                Anuluj
              </Button>
            </DialogClose>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
