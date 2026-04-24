"use client";

import { useEffect } from "react";

const SELECTABLE_INPUT_TYPES: Set<string> = new Set([
  "text",
  "number",
  "tel",
  "email",
  "url",
  "search",
  "password",
]);

export default function InputSelectOnFocus(): null {
  useEffect((): (() => void) => {
    function handleFocusIn(event: FocusEvent): void {
      const target: EventTarget | null = event.target;

      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
      ) {
        return;
      }

      if (
        target instanceof HTMLInputElement &&
        !SELECTABLE_INPUT_TYPES.has(target.type)
      ) {
        return;
      }

      if (target.readOnly || target.disabled) {
        return;
      }

      // Defer to next frame to avoid conflicts with focus handlers that also
      // modify the value (e.g., the draft-on-focus pattern on StockCell inputs)
      requestAnimationFrame((): void => {
        target.select();
      });
    }

    document.addEventListener("focusin", handleFocusIn);

    return (): void => {
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, []);

  return null;
}
