import { useEffect, useState } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (red) — use for deletes and other
   * irreversible actions. */
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

let requestConfirm: ((options: ConfirmOptions) => Promise<boolean>) | null = null;

/** App-styled replacement for window.confirm() — resolves true if the user confirms,
 * false on cancel or on dismissing the dialog any other way (Esc, overlay click, the
 * X button). Requires <ConfirmDialogHost /> mounted once near the app root (see
 * AppShell.tsx); if it's somehow not mounted, fails safe to "cancelled" rather than
 * letting a destructive action proceed unconfirmed. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (!requestConfirm) return Promise.resolve(false);
  return requestConfirm(options);
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    requestConfirm = (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      });
    return () => {
      requestConfirm = null;
    };
  }, []);

  function close(result: boolean) {
    pending?.resolve(result);
    setPending(null);
  }

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && close(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          {pending?.description && <DialogDescription>{pending.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            {pending?.cancelLabel ?? "Cancel"}
          </Button>
          <Button variant={pending?.destructive ? "destructive" : "default"} onClick={() => close(true)}>
            {pending?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
