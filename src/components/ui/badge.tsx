import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "muted" | "destructive";
}) {
  const styles = {
    default: "bg-[var(--color-accent)]/30 text-[var(--color-foreground)]",
    success: "bg-[var(--color-success)]/20 text-[var(--color-success)]",
    warning: "bg-[var(--color-warning)]/20 text-[var(--color-warning)]",
    muted: "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
    destructive: "bg-[var(--color-destructive)]/20 text-[var(--color-destructive)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
