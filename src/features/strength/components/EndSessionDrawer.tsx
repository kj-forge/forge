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
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-message";

interface EndSessionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movementCount: number;
  onConfirm: (notes?: string) => Promise<void>;
}

export function EndSessionDrawer({ open, onOpenChange, movementCount, onConfirm }: EndSessionDrawerProps) {
  const [notes, setNotes] = useState("");
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setEnding(true);
    const payload = notes.trim() || undefined;
    try {
      await onConfirm(payload);
      setEnding(false);
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się zakończyć sesji."));
      setEnding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="mx-auto w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Zakończ sesję?</DialogTitle>
            <DialogDescription>
              {movementCount} {movementCount === 1 ? "ćwiczenie" : "ćwiczeń"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notatki (opcjonalne)</Label>
              <textarea
                id="notes"
                className="min-h-24 w-full resize-none rounded-md border border-border bg-background p-2 text-base md:text-sm"
                placeholder="Wnioski z dzisiejszego treningu..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={5000}
              />
            </div>
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button className="w-full bg-ember shadow-ember" disabled={ending} onClick={handleConfirm}>
              {ending ? "Zakańczam..." : "Zakończ i zapisz"}
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
