import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// The stock shadcn template reads the theme from next-themes; Forge's theme
// is the `.dark` class + tokens, so the toast colors are bound to tokens
// here and flip with the class — no theme prop needed.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // Clear the notch / status bar in standalone PWA — sonner's default
      // offsets don't know about safe areas.
      offset={{ top: "max(env(safe-area-inset-top), 16px)" }}
      mobileOffset={{ top: "max(env(safe-area-inset-top), 12px)" }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
