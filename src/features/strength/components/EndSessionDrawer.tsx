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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>Zakończ sesję?</DrawerTitle>
            <DrawerDescription>
              {movementCount} {movementCount === 1 ? "ćwiczenie" : "ćwiczeń"}
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-3 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notatki (opcjonalne)</Label>
              <textarea
                id="notes"
                className="min-h-24 w-full rounded-md border border-border bg-background p-2 text-sm"
                placeholder="Wnioski z dzisiejszego treningu..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
          </div>

          <DrawerFooter className="gap-2">
            <Button className="w-full" disabled={ending} onClick={handleConfirm}>
              {ending ? "Zakańczam..." : "Zakończ i zapisz"}
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
