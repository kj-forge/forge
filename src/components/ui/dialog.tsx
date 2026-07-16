import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Responsive modal on a single radix tree: a full-screen page on mobile, a
// centered panel on desktop. Bottom sheets with inputs are deliberately gone —
// iOS never resizes the layout viewport for the software keyboard, so any
// sheet that repositions itself via VisualViewport math (vaul) fights the
// browser's native scroll-into-view and loses unpredictably. A fixed inset-0
// page has no geometry to adjust: the keyboard overlays it and the focused
// input scrolls into view natively inside the consumer's scroll region.
// Keyboard-free confirmations can opt back into a (static, non-draggable)
// bottom card via `mobileSheet`.
// Consumers control height/scroll via className on DialogContent — typically
// a `flex-1 min-h-0 overflow-y-auto` middle section between header/footer.

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
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
  mobileSheet = false,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  // Static bottom card instead of the full-screen page — only for content
  // that never opens the keyboard (confirmations).
  mobileSheet?: boolean;
}) {
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        // No focus-first-tabbable on open: it lands on destructive buttons
        // (delete set / delete session) where Enter fires them.
        onOpenAutoFocus={onOpenAutoFocus ?? ((e) => e.preventDefault())}
        className={cn(
          "data-closed:fade-out-0 data-open:fade-in-0 max-md:data-closed:slide-out-to-bottom-10 max-md:data-open:slide-in-from-bottom-10 fixed z-50 flex flex-col bg-popover text-popover-foreground text-sm outline-none data-closed:animate-out data-open:animate-in",
          mobileSheet
            ? "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t pb-[max(0px,calc(env(safe-area-inset-bottom)-1rem))]"
            : "inset-0 h-dvh pt-[env(safe-area-inset-top)]",
          "md:data-closed:zoom-out-95 md:data-open:zoom-in-95 md:inset-auto md:top-1/2 md:left-1/2 md:h-auto md:max-h-[85vh] md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:overflow-y-auto md:rounded-xl md:border-none md:pt-0 md:pb-0 md:ring-1 md:ring-foreground/10",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "absolute right-3",
                mobileSheet ? "top-3" : "top-[calc(env(safe-area-inset-top)+0.75rem)] md:top-3",
              )}
            >
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
      className={cn("flex flex-col gap-0.5 p-4 px-10 text-center md:px-4 md:pr-12 md:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)-1rem))]", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading font-medium text-base text-foreground", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle };
