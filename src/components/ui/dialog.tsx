import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

// Responsive modal: a centered radix Dialog on desktop, a vaul Drawer (bottom
// sheet) on mobile — the official shadcn responsive-dialog pattern. Mobile
// MUST stay on vaul: iOS never resizes the layout viewport for the software
// keyboard, so a plain `fixed bottom-0` sheet ends up buried behind it; vaul
// repositions the sheet via the VisualViewport API (repositionInputs) and
// suppresses radix's focus-first-tabbable on open, which we mirror on desktop.
// Consumers control height/scroll via className on DialogContent (e.g. a tall
// mobile sheet: `h-[80dvh] md:h-auto`, with a flex-1 min-h-0 overflow-y-auto
// middle section so the header/footer stay pinned).
// vaul and the `radix-ui` package bundle separate radix contexts, so every
// primitive below must branch on the same useIsDesktop — never mix the two.
// Known tradeoff: crossing the md breakpoint while open (rotation/resize)
// swaps the primitive tree and remounts children — transient form state is
// lost unless the consumer lifts it above DialogContent.

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <Drawer {...props} />;
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <DrawerClose {...props} />;
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 bg-black/10 data-closed:animate-out data-open:animate-in supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  const isDesktop = useIsDesktop();
  if (!isDesktop) {
    return (
      <DrawerContent className={className} onOpenAutoFocus={onOpenAutoFocus} {...props}>
        {children}
      </DrawerContent>
    );
  }
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        // No focus-first-tabbable on open: it lands on destructive buttons
        // (delete set / delete session) where Enter fires them.
        onOpenAutoFocus={onOpenAutoFocus ?? ((e) => e.preventDefault())}
        className={cn(
          "data-closed:fade-out-0 data-closed:zoom-out-95 data-open:fade-in-0 data-open:zoom-in-95 fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-xl bg-popover text-popover-foreground text-sm outline-none ring-1 ring-foreground/10 data-closed:animate-out data-open:animate-in",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3">
              <XIcon />
              <span className="sr-only">Zamknij</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-0.5 p-4 text-center md:pr-12 md:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const isDesktop = useIsDesktop();
  const Title = isDesktop ? DialogPrimitive.Title : DrawerTitle;
  return (
    <Title
      data-slot="dialog-title"
      className={cn("font-heading font-medium text-base text-foreground", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  const isDesktop = useIsDesktop();
  const Description = isDesktop ? DialogPrimitive.Description : DrawerDescription;
  return (
    <Description data-slot="dialog-description" className={cn("text-muted-foreground text-sm", className)} {...props} />
  );
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle };
