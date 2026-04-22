"use client";

import { useState, useCallback, useSyncExternalStore } from "react";

function getServerSnapshot(): boolean {
  return false;
}

function subscribeToHydration(onStoreChange: () => void): () => void {
  onStoreChange();

  return () => {};
}

function getHydrationSnapshot(): boolean {
  return true;
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((previous: T) => T)) => void] {
  const isClient: boolean = useSyncExternalStore(
    subscribeToHydration,
    getHydrationSnapshot,
    getServerSnapshot
  );

  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }

    try {
      const item: string | null = window.localStorage.getItem(key);

      if (item !== null) {
        return JSON.parse(item) as T;
      }
    } catch {
      // If parsing fails, keep the initial value
    }

    return initialValue;
  });

  const setValue = useCallback(
    (value: T | ((previous: T) => T)) => {
      setStoredValue((current: T) => {
        const nextValue: T =
          typeof value === "function"
            ? (value as (previous: T) => T)(current)
            : value;

        try {
          window.localStorage.setItem(key, JSON.stringify(nextValue));
        } catch {
          // If storage is full or unavailable, state still updates
        }

        return nextValue;
      });
    },
    [key]
  );

  if (!isClient) {
    return [initialValue, setValue];
  }

  return [storedValue, setValue];
}
