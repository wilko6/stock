"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchElementTypes,
  fetchDrawingModels,
  fetchProducts,
  fetchStock,
  fetchDeliveries,
  fetchPayments,
  fetchOrders,
} from "@/lib/db";

const cache: Map<string, unknown> = new Map();
let preloaded: boolean = false;

export function preloadAll(): void {
  if (preloaded) {
    return;
  }

  preloaded = true;

  const loaders: { key: string; fn: () => Promise<unknown> }[] = [
    { key: "fetchElementTypes", fn: fetchElementTypes },
    { key: "fetchDrawingModels", fn: fetchDrawingModels },
    { key: "fetchProducts", fn: fetchProducts },
    { key: "fetchStock", fn: fetchStock },
    { key: "fetchDeliveries", fn: fetchDeliveries },
    { key: "fetchPayments", fn: fetchPayments },
    { key: "fetchOrders", fn: fetchOrders },
  ];

  for (const loader of loaders) {
    loader.fn().then((result: unknown) => {
      cache.set(loader.key, result);
    }).catch(() => {});
  }
}

export function useSupabase<T>(
  fetchFn: () => Promise<T>,
  initialValue: T
): [T, () => Promise<void>] {
  const cacheKey: string = fetchFn.name || fetchFn.toString().slice(0, 50);

  const [data, setData] = useState<T>(initialValue);

  const refetch = useCallback(async () => {
    const result: T = await fetchFn();
    cache.set(cacheKey, result);
    setData(result);
  }, [fetchFn, cacheKey]);

  useEffect(() => {
    let isActive: boolean = true;

    const cached: T | undefined = cache.get(cacheKey) as T | undefined;
    if (cached !== undefined) {
      setData(cached);
    }

    fetchFn()
      .then((result: T) => {
        cache.set(cacheKey, result);

        if (isActive) {
          setData(result);
        }
      })
      .catch(() => {
        // Fetch failed — keep cached or initial value
      });

    return () => {
      isActive = false;
    };
  }, [fetchFn, cacheKey]);

  return [data, refetch];
}
