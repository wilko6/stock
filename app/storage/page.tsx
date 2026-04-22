"use client";

import { useState, useEffect } from "react";
import { useSessionState } from "@/lib/use-session-state";
import { useSupabase } from "@/lib/use-supabase";
import {
  fetchStock,
  setStockQuantity,
  fetchProducts,
  fetchElementTypes,
  fetchDrawingModels,
} from "@/lib/db";
import {
  type ElementType,
  type DrawingModel,
  type Product,
  type Stock,
  type StorageLocation,
  STORAGE_LOCATIONS,
} from "@/lib/types";


function StockCell({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="flex h-7 w-7 items-center justify-center rounded text-sm text-foreground/55 transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        &minus;
      </button>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="no-spin w-12 rounded bg-transparent px-1 py-1 text-center font-mono text-sm hover:bg-foreground/5 focus:bg-foreground/5 focus:outline-none focus:ring-1 focus:ring-foreground/20"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex h-7 w-7 items-center justify-center rounded text-sm text-foreground/55 transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        +
      </button>
    </div>
  );
}

export default function StoragePage() {
  const [dbStock] = useSupabase<Stock>(fetchStock, {});
  const [products] = useSupabase<Product[]>(fetchProducts, []);
  const [types] = useSupabase<ElementType[]>(fetchElementTypes, []);
  const [models] = useSupabase<DrawingModel[]>(fetchDrawingModels, []);
  const [localStock, setLocalStock] = useState<Stock>({});
  const [locationFilter, setLocationFilter] = useSessionState<
    StorageLocation | "all"
  >("storage-locationFilter", "all");

  useEffect(() => {
    setLocalStock(dbStock);
  }, [dbStock]);

  const stock: Stock = localStock;

  const visibleLocations: readonly StorageLocation[] =
    locationFilter === "all"
      ? STORAGE_LOCATIONS
      : [locationFilter];

  function getType(id: string): ElementType | undefined {
    return types.find((item: ElementType) => item.id === id);
  }

  function getModel(id: string): DrawingModel | undefined {
    return models.find((item: DrawingModel) => item.id === id);
  }

  function updateQuantity(
    productId: string,
    location: StorageLocation,
    value: number
  ): void {
    setLocalStock((prev: Stock) => ({
      ...prev,
      [productId]: { ...prev[productId], [location]: value },
    }));
    setStockQuantity(productId, location, value);
  }


  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Stockage</h1>
      </div>

      <div className="mb-6 flex gap-0.5 border-b border-foreground/10 overflow-x-auto sm:gap-1">
        <button
          type="button"
          onClick={() => setLocationFilter("all")}
          className={`shrink-0 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 sm:py-3 ${
            locationFilter === "all"
              ? "border-b-2 border-foreground text-foreground"
              : "text-foreground/65 hover:text-foreground/80"
          }`}
        >
          Tout
        </button>
        {STORAGE_LOCATIONS.map((location: StorageLocation) => (
          <button
            key={location}
            type="button"
            onClick={() => setLocationFilter(location)}
            className={`shrink-0 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 sm:py-3 ${
              locationFilter === location
                ? "border-b-2 border-foreground text-foreground"
                : "text-foreground/65 hover:text-foreground/80"
            }`}
          >
            {location}
          </button>
        ))}
      </div>

      {products.length === 0 ? (
        <p className="py-12 text-center text-sm text-foreground/55">
          Créez des produits pour commencer le suivi du stock.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-foreground/10">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="thead-row border-b border-foreground/10">
                <th className="px-4 py-3 font-medium">Produit</th>
                {visibleLocations.map((location: StorageLocation) => (
                  <th
                    key={location}
                    className="px-4 py-3 text-center font-medium"
                  >
                    {location}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((product: Product) => {
                const elementType: ElementType | undefined = getType(
                  product.elementTypeId
                );
                const model: DrawingModel | undefined = getModel(
                  product.drawingModelId
                );

                if (elementType === undefined || model === undefined) {
                  return null;
                }

                return (
                  <tr
                    key={product.id}
                    className="border-b border-foreground/5 last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={model.imageData}
                          alt={model.name}
                          className="h-8 w-8 rounded object-cover"
                        />
                        <span>
                          {elementType.name} &mdash; {model.name}
                        </span>
                      </div>
                    </td>
                    {visibleLocations.map((location: StorageLocation) => (
                      <td key={location} className="px-4 py-3 text-center">
                        <StockCell
                          value={stock[product.id]?.[location] ?? 0}
                          onChange={(value: number) =>
                            updateQuantity(product.id, location, value)
                          }
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
