"use client";

import { useState } from "react";
import type { ElementType, DrawingModel, Product } from "@/lib/types";

interface ProductGridProps {
  products: Product[];
  types: ElementType[];
  models: DrawingModel[];
  quantities: Record<string, number>;
  onQuantityChange: (productId: string, value: number) => void;
}

interface TypeTab {
  id: string;
  name: string;
}

export default function ProductGrid({
  products,
  types,
  models,
  quantities,
  onQuantityChange,
}: ProductGridProps) {
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");

  const modelsMap: Map<string, DrawingModel> = new Map(
    models.map((item: DrawingModel) => [item.id, item])
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

  const activeTypeId: string =
    selectedTypeId !== "" &&
    typeTabs.some((tab: TypeTab) => tab.id === selectedTypeId)
      ? selectedTypeId
      : typeTabs[0]?.id ?? "";

  const filteredProducts: Product[] = products.filter(
    (product: Product) => product.elementTypeId === activeTypeId
  );

  if (typeTabs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-foreground/55">
        Aucun produit disponible.
      </p>
    );
  }

  return (
    <div>
      <div className="-mx-3 mb-4 overflow-x-auto px-3 sm:-mx-0 sm:mb-6 sm:px-0">
        <div className="flex gap-0.5 border-b border-foreground/10 sm:gap-1">
          {typeTabs.map((tab: TypeTab) => {
            const isActive: boolean = tab.id === activeTypeId;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedTypeId(tab.id)}
                className={`shrink-0 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 sm:py-3 ${
                  isActive
                    ? "border-b-2 border-foreground text-foreground"
                    : "text-foreground/65 hover:text-foreground/80"
                }`}
              >
                {tab.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
        {filteredProducts.map((product: Product) => {
          const model: DrawingModel | undefined = modelsMap.get(
            product.drawingModelId
          );

          if (model === undefined) {
            return null;
          }

          const quantity: number = quantities[product.id] ?? 0;

          return (
            <div
              key={product.id}
              className={`flex flex-col rounded-lg border p-2 sm:p-3 ${
                quantity > 0
                  ? "border-foreground/30 bg-foreground/5"
                  : "border-foreground/10"
              }`}
            >
              <div className="flex h-8 items-center justify-center sm:h-10">
                <span className="line-clamp-2 text-center text-xs font-medium leading-tight sm:text-sm">
                  {model.name}
                </span>
              </div>
              <div className="my-1 w-full overflow-hidden rounded-md sm:my-2">
                <img
                  src={model.imageData}
                  alt={model.name}
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
              <div className="flex h-10 items-center justify-center sm:h-11">
                <QuantitySelector
                  value={quantity}
                  onChange={(value: number) =>
                    onQuantityChange(product.id, value)
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuantitySelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex w-full items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-foreground/20 text-lg text-foreground/65 transition-colors hover:bg-foreground/10 hover:text-foreground active:bg-foreground/15 sm:h-9 sm:w-9 sm:text-sm"
      >
        &minus;
      </button>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(event) =>
          onChange(Math.max(0, Math.round(Number(event.target.value) || 0)))
        }
        className="no-spin w-10 bg-transparent py-1 text-center font-mono text-base font-medium hover:bg-foreground/5 focus:bg-foreground/5 focus:outline-none focus:ring-1 focus:ring-foreground/20 sm:w-12 sm:text-sm"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-foreground/20 text-lg text-foreground/65 transition-colors hover:bg-foreground/10 hover:text-foreground active:bg-foreground/15 sm:h-9 sm:w-9 sm:text-sm"
      >
        +
      </button>
    </div>
  );
}
