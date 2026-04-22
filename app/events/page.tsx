"use client";

import { useState } from "react";
import { useSupabase } from "@/lib/use-supabase";
import ProductGrid from "@/app/_components/product-grid";
import SelectionSummary, { type SummaryItem } from "@/app/_components/selection-summary";
import { useLocalStorage } from "@/lib/use-local-storage";
import {
  fetchProducts,
  fetchElementTypes,
  fetchDrawingModels,
  fetchStock,
  insertPayment,
  applyStockDeltas,
} from "@/lib/db";
import {
  type ElementType,
  type DrawingModel,
  type Product,
  type Stock,
  type StorageLocation,
  type TransactionItem,
  createPayment,
  centsToDisplay,
} from "@/lib/types";

export default function EventsPage() {
  const [products] = useSupabase<Product[]>(fetchProducts, []);
  const [types] = useSupabase<ElementType[]>(fetchElementTypes, []);
  const [models] = useSupabase<DrawingModel[]>(fetchDrawingModels, []);

  const typesMap: Map<string, ElementType> = new Map(
    types.map((item: ElementType) => [item.id, item])
  );
  const modelsMap: Map<string, DrawingModel> = new Map(
    models.map((item: DrawingModel) => [item.id, item])
  );

  const [quantities, setQuantities] = useLocalStorage<Record<string, number>>(
    "event-quantities",
    {}
  );
  const [priceOverrides, setPriceOverrides] = useLocalStorage<Record<string, string>>(
    "event-price-overrides",
    {}
  );
  const [descriptions, setDescriptions] = useLocalStorage<Record<string, string>>(
    "event-descriptions",
    {}
  );
  const [sales, setSales] = useLocalStorage<
    { id: string; items: TransactionItem[]; totalCents: number }[]
  >("event-sales", []);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const itemsWithQuantity: {
    product: Product;
    typeName: string;
    modelName: string;
    quantity: number;
    unitPriceCents: number;
  }[] = products
    .filter((product: Product) => (quantities[product.id] ?? 0) > 0)
    .map((product: Product) => {
      const elementType: ElementType | undefined = typesMap.get(
        product.elementTypeId
      );
      const model: DrawingModel | undefined = modelsMap.get(
        product.drawingModelId
      );

      return {
        product,
        typeName: elementType?.name ?? "\u2014",
        modelName: model?.name ?? "\u2014",
        quantity: quantities[product.id] ?? 0,
        unitPriceCents: elementType?.directSalePrice ?? 0,
      };
    });

  const summaryItems: SummaryItem[] = itemsWithQuantity.map((item) => {
    const autoPrice: number = item.unitPriceCents;
    const override: string | undefined = priceOverrides[item.product.id];
    const unitPriceCents: number =
      override !== undefined && override !== ""
        ? Math.round(Number(override) * 100)
        : autoPrice;

    return {
      productId: item.product.id,
      productName: `${item.typeName} \u2014 ${item.modelName}`,
      quantity: item.quantity,
      unitPriceCents,
      autoPrice,
    };
  });

  const hasItems: boolean = itemsWithQuantity.length > 0;

  function updateQuantity(productId: string, value: number): void {
    const clamped: number = Math.max(0, value);

    setQuantities((previous: Record<string, number>) => ({
      ...previous,
      [productId]: clamped,
    }));
  }

  function handleValidateSale(): void {
    if (!hasItems) {
      return;
    }

    const items: TransactionItem[] = summaryItems.map(
      (item: SummaryItem): TransactionItem => {
        const description: string | undefined = descriptions[item.productId];

        return {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          ...(description !== undefined && description !== ""
            ? { description }
            : {}),
        };
      }
    );

    const saleTotalCents: number = items.reduce(
      (sum: number, item: TransactionItem) =>
        sum + item.quantity * item.unitPriceCents,
      0
    );

    if (
      !window.confirm(
        `Montant d\u00fb\u00a0: ${centsToDisplay(saleTotalCents)}\u00a0\u20ac \u2014 Confirmer la vente\u00a0?`
      )
    ) {
      return;
    }

    setSales((previous) => [
      ...previous,
      { id: crypto.randomUUID(), items, totalCents: saleTotalCents },
    ]);

    setQuantities({});
    setPriceOverrides({});
    setDescriptions({});
  }

  function handleEditSale(id: string): void {
    const sale = sales.find((s) => s.id === id);

    if (sale === undefined) {
      return;
    }

    const restored: Record<string, number> = {};
    const restoredPrices: Record<string, string> = {};
    const restoredDescriptions: Record<string, string> = {};

    for (const item of sale.items) {
      restored[item.productId] = (restored[item.productId] ?? 0) + item.quantity;

      const autoPrice: number =
        typesMap.get(
          products.find((p: Product) => p.id === item.productId)
            ?.elementTypeId ?? ""
        )?.directSalePrice ?? 0;

      if (item.unitPriceCents !== autoPrice) {
        restoredPrices[item.productId] = (item.unitPriceCents / 100).toString();
      }

      if (item.description !== undefined && item.description !== "") {
        restoredDescriptions[item.productId] = item.description;
      }
    }

    setQuantities(restored);
    setPriceOverrides(restoredPrices);
    setDescriptions(restoredDescriptions);
    setSales((previous) => previous.filter((s) => s.id !== id));
  }

  function handleDeleteSale(id: string): void {
    if (!window.confirm("Supprimer cette vente\u00a0?")) {
      return;
    }

    setSales((previous) => previous.filter((s) => s.id !== id));
  }

  async function handleFinishEvent(): Promise<void> {
    if (submitting || sales.length === 0) {
      return;
    }

    if (
      !window.confirm(
        "Terminer l'\u00e9v\u00e9nement et enregistrer toutes les ventes\u00a0?"
      )
    ) {
      return;
    }

    const allItems: TransactionItem[] = [];

    for (const sale of sales) {
      for (const item of sale.items) {
        const existing: TransactionItem | undefined = allItems.find(
          (i: TransactionItem) => i.productId === item.productId && i.unitPriceCents === item.unitPriceCents
        );

        if (existing !== undefined) {
          existing.quantity += item.quantity;
        } else {
          allItems.push({ ...item });
        }
      }
    }

    const currentStock: Stock = await fetchStock();

    for (const item of allItems) {
      const available: number = currentStock[item.productId]?.["Usine"] ?? 0;

      if (item.quantity > available) {
        window.alert(`Stock insuffisant pour ${item.productName}. Disponible\u00a0: ${String(available)}`);

        return;
      }
    }

    try {
      setSubmitting(true);

      const paymentTotalCents: number = allItems.reduce(
        (sum: number, item: TransactionItem) =>
          sum + item.quantity * item.unitPriceCents,
        0
      );

      const sourceLocation: StorageLocation = "Usine";

      const payment = createPayment({
        source: sourceLocation,
        items: allItems,
        totalCents: paymentTotalCents,
      });

      await insertPayment(payment);

      const deltas: { productId: string; location: StorageLocation; delta: number }[] =
        allItems.map((item: TransactionItem) => ({
          productId: item.productId,
          location: sourceLocation,
          delta: -item.quantity,
        }));

      await applyStockDeltas(deltas);

      setQuantities({});
      setPriceOverrides({});
      setDescriptions({});
      setSales([]);
    } catch {
      window.alert("Une erreur est survenue. Veuillez r\u00e9essayer.");
    } finally {
      setSubmitting(false);
    }
  }

  const eventTotalCents: number = sales.reduce(
    (sum: number, sale) => sum + sale.totalCents,
    0
  );

  if (products.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">&Eacute;v&eacute;nement</h1>
        </div>
        <p className="py-12 text-center text-sm text-foreground/55">
          Cr&eacute;ez des produits pour utiliser le mode &eacute;v&eacute;nement.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-8">
      <div className="mb-4 flex items-center justify-between sm:mb-6">
        <h1 className="text-lg font-semibold sm:text-xl">&Eacute;v&eacute;nement</h1>
      </div>

      <ProductGrid
        products={products}
        types={types}
        models={models}
        quantities={quantities}
        onQuantityChange={updateQuantity}
      />

      {hasItems && (
        <div className="mt-6 space-y-4 sm:mt-8">
          <h2 className="text-sm font-semibold">Panier client</h2>
          <SelectionSummary
            items={summaryItems}
            priceOverrides={priceOverrides}
            onPriceOverrideChange={(productId: string, value: string) =>
              setPriceOverrides((previous: Record<string, string>) => ({
                ...previous,
                [productId]: value,
              }))
            }
            descriptions={descriptions}
            onDescriptionChange={(productId: string, value: string) =>
              setDescriptions((previous: Record<string, string>) => ({
                ...previous,
                [productId]: value,
              }))
            }
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleValidateSale}
              className="btn-primary w-full rounded-md bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-80 sm:w-auto sm:py-2.5"
            >
              Valider la vente
            </button>
          </div>
        </div>
      )}

      {sales.length > 0 && (
        <div className="mt-8 sm:mt-10">
          <h2 className="mb-3 text-sm font-semibold sm:mb-4">
            Ventes de l&apos;&eacute;v&eacute;nement ({sales.length})
          </h2>
          <div className="space-y-2">
            {sales.map(
              (
                sale: { id: string; items: TransactionItem[]; totalCents: number },
                index: number,
              ) => (
                <div
                  key={sale.id ?? index}
                  className="card flex flex-col gap-1 rounded-lg border border-foreground/10 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3"
                >
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground/70 sm:text-sm">
                    {sale.items.map((item: TransactionItem) => (
                      <span key={item.productId}>
                        {item.productName}
                        <span className="ml-1 text-foreground/55">
                          &times;{item.quantity}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono font-medium">
                      {centsToDisplay(sale.totalCents)}&nbsp;&euro;
                    </span>
                    <button
                      type="button"
                      onClick={() => handleEditSale(sale.id)}
                      className="text-foreground/65 transition-colors hover:text-foreground"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSale(sale.id)}
                      className="btn-danger text-red-500/70 transition-colors hover:text-red-500"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" /></svg>
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t border-foreground/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium">
              Total &eacute;v&eacute;nement&nbsp;:
              <span className="ml-2 font-mono text-base">
                {centsToDisplay(eventTotalCents)}&nbsp;&euro;
              </span>
            </span>
            <button
              type="button"
              onClick={handleFinishEvent}
              disabled={submitting}
              className="btn-primary w-full rounded-md bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40 sm:w-auto"
            >
              Fin de l&apos;&eacute;v&eacute;nement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
