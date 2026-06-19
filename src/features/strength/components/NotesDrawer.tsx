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

interface NotesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialNotes: string;
  onSave: (notes: string) => Promise<void>;
}

// Conditional child pattern — the form mounts fresh each time the drawer
// opens, so we never need to manually reset `notes` from `initialNotes`.
export function NotesDrawer({ open, onOpenChange, initialNotes, onSave }: NotesDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>Notatki sesji</DrawerTitle>
            <DrawerDescription>Wnioski, samopoczucie, plan na następny trening.</DrawerDescription>
          </DrawerHeader>

          {open ? <NotesForm initialNotes={initialNotes} onSave={onSave} /> : null}

          <DrawerFooter>
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

function NotesForm({ initialNotes, onSave }: { initialNotes: string; onSave: (notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await onSave(notes);
      setSaving(false);
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się zapisać notatek."));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 px-4">
      <textarea
        className="min-h-32 w-full rounded-md border border-border bg-background p-2 text-sm"
        placeholder="Wnioski z dzisiejszego treningu..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={5000}
      />
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={saving} onClick={handleSave}>
        {saving ? "Zapisuję..." : "Zapisz notatki"}
      </Button>
    </div>
  );
}
