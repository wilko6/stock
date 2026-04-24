"use client";

import { useState, useEffect } from "react";

const sessionCache: Map<string, unknown> = new Map();

export function useSessionState<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((previous: T) => T)) => void] {
  const [state, setState] = useState<T>(initialValue);

  useEffect(() => {
    if (sessionCache.has(key)) {
      setState(sessionCache.get(key) as T);
    }
  }, [key]);

  function setSessionState(value: T | ((previous: T) => T)): void {
    setState((current: T) => {
      const next: T =
        typeof value === "function"
          ? (value as (previous: T) => T)(current)
          : value;

      sessionCache.set(key, next);

      return next;
    });
  }

  return [state, setSessionState];
}
