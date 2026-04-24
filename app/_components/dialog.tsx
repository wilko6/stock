"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";

type DialogVariant = "default" | "danger";

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
}

interface AlertOptions {
  title?: string;
  okLabel?: string;
}

interface ConfirmRequest {
  kind: "confirm";
  message: string;
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

interface AlertRequest {
  kind: "alert";
  message: string;
  options: AlertOptions;
  resolve: () => void;
}

type DialogRequest = ConfirmRequest | AlertRequest;

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;
type AlertFn = (message: string, options?: AlertOptions) => Promise<void>;

interface DialogContextValue {
  confirm: ConfirmFn;
  alert: AlertFn;
}

const DialogContext = createContext<DialogContextValue | null>(null);

const FOCUSABLE_SELECTOR: string = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface DialogStore {
  queue: DialogRequest[];
  listeners: Set<() => void>;
}

function createDialogStore(): DialogStore {
  return { queue: [], listeners: new Set() };
}

function subscribe(store: DialogStore, listener: () => void): () => void {
  store.listeners.add(listener);

  return (): void => {
    store.listeners.delete(listener);
  };
}

function notify(store: DialogStore): void {
  for (const listener of store.listeners) {
    listener();
  }
}

function enqueue(store: DialogStore, request: DialogRequest): void {
  store.queue = [...store.queue, request];
  notify(store);
}

function dequeue(store: DialogStore): void {
  store.queue = store.queue.slice(1);
  notify(store);
}

function getCurrent(store: DialogStore): DialogRequest | null {
  return store.queue[0] ?? null;
}

function createContextValue(store: DialogStore): DialogContextValue {
  const confirm: ConfirmFn = (
    message: string,
    options?: ConfirmOptions
  ): Promise<boolean> => {
    return new Promise<boolean>((resolve: (value: boolean) => void) => {
      enqueue(store, {
        kind: "confirm",
        message,
        options: options ?? {},
        resolve,
      });
    });
  };

  const alert: AlertFn = (
    message: string,
    options?: AlertOptions
  ): Promise<void> => {
    return new Promise<void>((resolve: () => void) => {
      enqueue(store, {
        kind: "alert",
        message,
        options: options ?? {},
        resolve,
      });
    });
  };

  return { confirm, alert };
}

export function DialogProvider({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const [store] = useState<DialogStore>(createDialogStore);
  const [contextValue] = useState<DialogContextValue>((): DialogContextValue =>
    createContextValue(store)
  );

  const current: DialogRequest | null = useSyncExternalStore(
    (listener: () => void): (() => void) => subscribe(store, listener),
    (): DialogRequest | null => getCurrent(store),
    (): DialogRequest | null => null
  );

  function handleResolve(request: DialogRequest, confirmed: boolean): void {
    if (request.kind === "confirm") {
      request.resolve(confirmed);
    } else {
      request.resolve();
    }

    dequeue(store);
  }

  const portalTarget: HTMLElement | null =
    typeof document === "undefined" ? null : document.body;

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
      {current !== null && portalTarget !== null
        ? createPortal(
            <DialogView
              key={getRequestKey(current)}
              request={current}
              onResolve={handleResolve}
            />,
            portalTarget
          )
        : null}
    </DialogContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context: DialogContextValue | null = useContext(DialogContext);

  if (context === null) {
    throw new Error("useConfirm must be used within DialogProvider");
  }

  return context.confirm;
}

export function useAlert(): AlertFn {
  const context: DialogContextValue | null = useContext(DialogContext);

  if (context === null) {
    throw new Error("useAlert must be used within DialogProvider");
  }

  return context.alert;
}

function getRequestKey(request: DialogRequest): string {
  return `${request.kind}:${request.message}`;
}

function DialogView({
  request,
  onResolve,
}: {
  request: DialogRequest;
  onResolve: (request: DialogRequest, confirmed: boolean) => void;
}): JSX.Element {
  const titleId: string = useId();
  const messageId: string = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState<boolean>(false);

  const isConfirm: boolean = request.kind === "confirm";
  const variant: DialogVariant =
    request.kind === "confirm" ? request.options.variant ?? "default" : "default";
  const title: string | undefined = request.options.title;
  const confirmLabel: string =
    request.kind === "confirm"
      ? request.options.confirmLabel ?? "Confirmer"
      : request.options.okLabel ?? "OK";
  const cancelLabel: string =
    request.kind === "confirm"
      ? request.options.cancelLabel ?? "Annuler"
      : "";

  useEffect((): (() => void) => {
    const previouslyFocused: HTMLElement | null =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow: string = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const raf: number = window.requestAnimationFrame((): void => {
      setVisible(true);
      primaryRef.current?.focus();
    });

    return (): void => {
      window.cancelAnimationFrame(raf);
      document.body.style.overflow = previousOverflow;

      if (previouslyFocused !== null && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, []);

  function handleCancel(): void {
    onResolve(request, false);
  }

  function handleConfirm(): void {
    onResolve(request, true);
  }

  function handleBackdropClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();

      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const container: HTMLDivElement | null = dialogRef.current;

    if (container === null) {
      return;
    }

    const focusables: HTMLElement[] = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );

    if (focusables.length === 0) {
      event.preventDefault();

      return;
    }

    const first: HTMLElement = focusables[0];
    const last: HTMLElement = focusables[focusables.length - 1];
    const active: Element | null = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();

      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const primaryClass: string =
    variant === "danger" ? "dialog-btn-danger" : "dialog-btn-primary";

  return (
    <div
      className={`dialog-backdrop ${visible ? "dialog-visible" : ""}`}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        aria-describedby={messageId}
        className={`dialog ${visible ? "dialog-visible" : ""}`}
      >
        {title !== undefined && (
          <h2 id={titleId} className="dialog-title">
            {title}
          </h2>
        )}
        <p id={messageId} className="dialog-message">
          {request.message}
        </p>
        <div className="dialog-actions">
          {isConfirm && (
            <button
              type="button"
              onClick={handleCancel}
              className="dialog-btn-secondary"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            onClick={handleConfirm}
            className={primaryClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
