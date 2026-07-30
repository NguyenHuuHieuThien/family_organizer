/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
}

export function useConfirm() {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const isDanger = options?.tone !== "default";
  const ConfirmDialog = options ? (
    <Dialog open onOpenChange={(open) => !open && close(false)}>
      <DialogContent id="confirm-dialog" showCloseButton={false} className="max-w-md">
        <DialogHeader className="flex-row items-start gap-3 text-left">
          <div className={isDanger ? "rounded-md bg-red-500/10 p-2 text-red-500" : "rounded-md bg-sky-500/10 p-2 text-sky-500"}>
            <AlertTriangle className="size-5" />
          </div>
          <div className="space-y-2">
            <DialogTitle>{options.title}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">{options.message}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="default" onClick={() => close(false)}>
            {options.cancelLabel || t("confirmDialog.cancelLabel")}
          </Button>
          <Button variant={isDanger ? "destructive" : "default"} size="default" onClick={() => close(true)}>
            {options.confirmLabel || t("confirmDialog.confirmLabel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return { confirm, ConfirmDialog };
}
