"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionState } from "@/lib/use-session-state";
import { useSupabase } from "@/lib/use-supabase";
import {
  fetchStock,
  setStockQuantity,
  setProductMinStock,
  fetchProducts,
  fetchElementTypes,
  fetchDrawingModels,
  fetchOrders,
} from "@/lib/db";
import {
  type ElementType,
  type DrawingModel,
  type Product,
  type Stock,
  type Order,
  drawingModelImageSrc,
} from "@/lib/types";


function StockCell({
  value,
  onChange,
  inputClassName,
}: {
  value: number;
  onChange: (value: number) => void;
  inputClassName?: string;
}) {
  const [draft, setDraft] = useState<string>("");
  const [isEditing, setIsEditing] = useState<boolean>(false);

  const displayValue: string = isEditing ? draft : String(value);

  function commit(): void {
    setIsEditing(false);

    if (draft === "") {
      return;
    }

    const parsed: number = Number(draft);

    if (!Number.isFinite(parsed)) {
      return;
    }

    const clamped: number = Math.max(0, Math.floor(parsed));

    if (clamped !== value) {
      onChange(clamped);
    }
  }

  const inputClasses: string =
    "no-spin w-12 rounded bg-transparent px-1 py-1 text-center font-mono text-sm hover:bg-foreground/5 focus:bg-foreground/5 focus:outline-none focus:ring-1 focus:ring-foreground/20" +
    (inputClassName !== undefined ? ` ${inputClassName}` : "");

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
        value={displayValue}
        onFocus={() => {
          setDraft(String(value));
          setIsEditing(true);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setIsEditing(false);
          }
        }}
        className={inputClasses}
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

interface TypeTab {
  id: string;
  name: string;
}

const VIERGE_FILTER: string = "vierge";

export default function StoragePage() {
  const router = useRouter();
  const [dbStock, refetchStock] = useSupabase<Stock>(fetchStock, {});
  const [products, refetchProducts] = useSupabase<Product[]>(fetchProducts, []);
  const [types] = useSupabase<ElementType[]>(fetchElementTypes, []);
  const [models] = useSupabase<DrawingModel[]>(fetchDrawingModels, []);
  const [orders] = useSupabase<Order[]>(fetchOrders, []);
  const [pendingWrites, setPendingWrites] = useState<Record<string, number>>(
    {}
  );
  const [pendingMinStock, setPendingMinStock] = useState<
    Record<string, number>
  >({});
  const [typeFilter, setTypeFilter] = useSessionState<string>(
    "storage-typeFilter",
    ""
  );

  const typeIdsWithProducts: Set<string> = new Set(
    products.map((product: Product) => product.elementTypeId)
  );

  const typeTabs: TypeTab[] = types
    .filter((elementType: ElementType) =>
      typeIdsWithProducts.has(elementType.id)
    )
    .map((elementType: ElementType) => ({
      id: elementType.id,
      name: elementType.name,
    }));

  function isViergeProduct(product: Product): boolean {
    const model: DrawingModel | undefined = models.find(
      (item: DrawingModel) => item.id === product.drawingModelId
    );

    if (model === undefined) {
      return false;
    }

    return model.name.trim().toLowerCase() === "vierge";
  }

  function matchesFilter(product: Product): boolean {
    if (typeFilter === "") {
      return true;
    }

    if (typeFilter === VIERGE_FILTER) {
      return isViergeProduct(product);
    }

    return product.elementTypeId === typeFilter;
  }

  const visibleProducts: Product[] = products.filter(matchesFilter);

  const pendingByType: Map<string, number> = new Map();

  for (const order of orders) {
    if (order.deliveredAt !== null) continue;
    for (const item of order.items) {
      const product = products.find((p) => p.id === item.productId);
      if (product === undefined) continue;
      const model = models.find((m) => m.id === product.drawingModelId);
      if (model === undefined) continue;
      if (model.name.trim().toLowerCase() !== "vierge") continue;
      const currentTotal = pendingByType.get(product.elementTypeId) ?? 0;
      pendingByType.set(product.elementTypeId, currentTotal + item.quantity);
    }
  }

  function getType(id: string): ElementType | undefined {
    return types.find((item: ElementType) => item.id === id);
  }

  function getModel(id: string): DrawingModel | undefined {
    return models.find((item: DrawingModel) => item.id === id);
  }

  function getStockValue(productId: string): number {
    const key: string = `${productId}|Stock`;
    const pending: number | undefined = pendingWrites[key];

    if (pending !== undefined) {
      return pending;
    }

    return dbStock[productId]?.["Stock"] ?? 0;
  }

  function getMinStockValue(product: Product): number {
    const pending: number | undefined = pendingMinStock[product.id];

    if (pending !== undefined) {
      return pending;
    }

    return product.minStock;
  }

  async function updateQuantity(productId: string, value: number): Promise<void> {
    const key: string = `${productId}|Stock`;

    setPendingWrites((prev: Record<string, number>) => ({
      ...prev,
      [key]: value,
    }));

    try {
      await setStockQuantity(productId, "Stock", value);
      await refetchStock();
    } finally {
      setPendingWrites((prev: Record<string, number>) => {
        if (prev[key] !== value) {
          return prev;
        }

        const next: Record<string, number> = { ...prev };
        delete next[key];

        return next;
      });
    }
  }

  async function updateMinStock(productId: string, value: number): Promise<void> {
    setPendingMinStock((prev: Record<string, number>) => ({
      ...prev,
      [productId]: value,
    }));

    try {
      await setProductMinStock(productId, value);
      await refetchProducts();
    } finally {
      setPendingMinStock((prev: Record<string, number>) => {
        if (prev[productId] !== value) {
          return prev;
        }

        const next: Record<string, number> = { ...prev };
        delete next[productId];

        return next;
      });
    }
  }


  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Stockage</h1>
      </div>

      <div className="mb-6 flex flex-wrap gap-0.5 border-b border-foreground/10 sm:gap-1">
        <button
          type="button"
          onClick={() => setTypeFilter("")}
          className={`shrink-0 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 sm:py-3 ${
            typeFilter === ""
              ? "border-b-2 border-foreground text-foreground"
              : "text-foreground/65 hover:text-foreground/80"
          }`}
        >
          Tout
        </button>
        <button
          type="button"
          onClick={() => setTypeFilter(VIERGE_FILTER)}
          className={`shrink-0 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 sm:py-3 ${
            typeFilter === VIERGE_FILTER
              ? "border-b-2 border-foreground text-foreground"
              : "text-foreground/65 hover:text-foreground/80"
          }`}
        >
          Vierge
        </button>
        {typeTabs.map((tab: TypeTab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTypeFilter(tab.id)}
            className={`shrink-0 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 sm:py-3 ${
              typeFilter === tab.id
                ? "border-b-2 border-foreground text-foreground"
                : "text-foreground/65 hover:text-foreground/80"
            }`}
          >
            {tab.name}
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
                <th className="px-4 py-3 text-center font-medium">Stock</th>
                <th className="px-4 py-3 text-center font-medium">Stock min</th>
                <th className="px-4 py-3 text-center font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product: Product) => {
                const elementType: ElementType | undefined = getType(
                  product.elementTypeId
                );
                const model: DrawingModel | undefined = getModel(
                  product.drawingModelId
                );

                if (elementType === undefined || model === undefined) {
                  return null;
                }

                const currentStock: number = getStockValue(product.id);
                const minStock: number = getMinStockValue(product);
                const isLow: boolean = currentStock < minStock;
                const isVierge: boolean = isViergeProduct(product);

                return (
                  <tr
                    key={product.id}
                    className="border-b border-foreground/5 last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={drawingModelImageSrc(model)}
                          alt={model.name}
                          className="h-8 w-8 rounded object-cover"
                        />
                        <div>
                          <span>
                            {elementType.name} &mdash; {model.name}
                          </span>
                          {pendingByType.get(product.elementTypeId) ? (
                            <div className="text-xs text-foreground/55 italic">
                              +{" "}
                              {String(
                                pendingByType.get(product.elementTypeId)
                              )}{" "}
                              en cours de livraison
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StockCell
                        value={currentStock}
                        onChange={(value: number) => {
                          void updateQuantity(product.id, value);
                        }}
                        inputClassName={isLow ? "text-red-600" : undefined}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StockCell
                        value={minStock}
                        onChange={(value: number) => {
                          void updateMinStock(product.id, value);
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isVierge && (
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/commandes?productId=${product.id}`)
                          }
                          className="btn-secondary rounded-md border border-foreground/20 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
                        >
                          Commander
                        </button>
                      )}
                    </td>
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
