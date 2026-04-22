"use client";

import { useState } from "react";
import { useSessionState } from "@/lib/use-session-state";
import { useSupabase } from "@/lib/use-supabase";
import ProductGrid from "@/app/_components/product-grid";
import SelectionSummary, { type SummaryItem } from "@/app/_components/selection-summary";
import {
  fetchDeliveries,
  insertDelivery,
  updateDeliveryDate as updateDeliveryDateDb,
  fetchStock,
  applyStockDeltas,
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
  type Delivery,
  type TransactionItem,
  STORAGE_LOCATIONS,
  createDelivery,
  centsToDisplay,
} from "@/lib/types";
import DatePicker from "@/app/_components/date-picker";
import { generateInvoiceHtml } from "@/lib/invoice";

function getProductName(
  product: Product,
  typesMap: Map<string, ElementType>,
  modelsMap: Map<string, DrawingModel>
): string {
  const typeName: string = typesMap.get(product.elementTypeId)?.name ?? "\u2014";
  const modelName: string =
    modelsMap.get(product.drawingModelId)?.name ?? "\u2014";

  return `${typeName} \u2014 ${modelName}`;
}

export default function DeliveriesPage() {
  const [deliveries, refetchDeliveries] = useSupabase<Delivery[]>(fetchDeliveries, []);
  const [stock, refetchStock] = useSupabase<Stock>(fetchStock, {});
  const [products] = useSupabase<Product[]>(fetchProducts, []);
  const [types] = useSupabase<ElementType[]>(fetchElementTypes, []);
  const [models] = useSupabase<DrawingModel[]>(fetchDrawingModels, []);

  const [destination, setDestination] = useSessionState<string>("delivery-destination", "");
  const [quantities, setQuantities] = useSessionState<Record<string, number>>("delivery-quantities", {});
  const [priceOverrides, setPriceOverrides] = useSessionState<Record<string, string>>("delivery-priceOverrides", {});
  const [descriptions, setDescriptions] = useSessionState<Record<string, string>>("delivery-descriptions", {});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<boolean>(false);

  const typesMap: Map<string, ElementType> = new Map(
    types.map((item: ElementType) => [item.id, item])
  );
  const modelsMap: Map<string, DrawingModel> = new Map(
    models.map((item: DrawingModel) => [item.id, item])
  );

  const source: string = "Usine";

  const deliverableProducts: Product[] = products.filter(
    (product: Product) => {
      const elementType: ElementType | undefined = typesMap.get(
        product.elementTypeId
      );

      return elementType !== undefined && elementType.intermediarySalePrice > 0;
    }
  );

  function getSourceStock(productId: string): number {
    return stock[productId]?.["Usine"] ?? 0;
  }

  function updateQuantity(productId: string, value: number): void {
    setQuantities((previous: Record<string, number>) => ({
      ...previous,
      [productId]: Math.max(0, value),
    }));
  }

  const summaryItems: SummaryItem[] = deliverableProducts
    .filter((product: Product) => (quantities[product.id] ?? 0) > 0)
    .map((product: Product) => {
      const elementType: ElementType | undefined = typesMap.get(
        product.elementTypeId
      );
      const autoPrice: number = elementType?.intermediarySalePrice ?? 0;
      const override: string | undefined = priceOverrides[product.id];
      const unitPriceCents: number =
        override !== undefined && override !== ""
          ? Math.round(Number(override) * 100)
          : autoPrice;

      return {
        productId: product.id,
        productName: getProductName(product, typesMap, modelsMap),
        quantity: quantities[product.id],
        unitPriceCents,
        autoPrice,
      };
    });

  function isDraftValid(): boolean {
    return (
      destination !== "" &&
      source !== destination &&
      Object.values(quantities).some((q: number) => q > 0)
    );
  }

  async function handleValidate(): Promise<void> {
    if (submitting || !isDraftValid()) {
      return;
    }

    if (!window.confirm("Valider cette livraison\u00a0?")) {
      return;
    }

    const sourceLocation: StorageLocation = source as StorageLocation;

    const selectedProducts: { product: Product; quantity: number }[] = deliverableProducts
      .filter((product: Product) => (quantities[product.id] ?? 0) > 0)
      .map((product: Product) => ({
        product,
        quantity: quantities[product.id] ?? 0,
      }));

    const insufficientEntry: { product: Product; quantity: number } | undefined =
      selectedProducts.find(
        (entry) => entry.quantity > getSourceStock(entry.product.id)
      );

    if (insufficientEntry !== undefined) {
      const available: number = getSourceStock(insufficientEntry.product.id);
      window.alert(
        `Stock insuffisant. Disponible\u00a0: ${String(available)}`
      );

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

    const totalCents: number = items.reduce(
      (sum: number, item: TransactionItem) =>
        sum + item.quantity * item.unitPriceCents,
      0
    );

    const delivery: Delivery = createDelivery({
      source: sourceLocation,
      destination: destination as StorageLocation,
      items,
      totalCents,
    });

    const deltas: { productId: string; location: StorageLocation; delta: number }[] = [];

    for (const entry of selectedProducts) {
      deltas.push({ productId: entry.product.id, location: sourceLocation, delta: -entry.quantity });
      deltas.push({ productId: entry.product.id, location: destination as StorageLocation, delta: entry.quantity });
    }

    try {
      setSubmitting(true);
      await insertDelivery(delivery);
      await applyStockDeltas(deltas);
      await refetchDeliveries();
      await refetchStock();

      setDestination("");
      setQuantities({});
      setPriceOverrides({});
      setDescriptions({});
    } catch {
      window.alert("Une erreur est survenue. Veuillez r\u00e9essayer.");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleExpanded(id: string): void {
    setExpandedIds((previous: Set<string>) => {
      const next: Set<string> = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function handleInvoice(delivery: Delivery): void {
    const html: string = generateInvoiceHtml(delivery);
    const win: Window | null = window.open("", "_blank");

    if (win !== null) {
      win.document.write(html);
      win.document.close();
    }
  }

  async function updateDeliveryDate(id: string, dateStr: string): Promise<void> {
    await updateDeliveryDateDb(id, new Date(dateStr).toISOString());
    await refetchDeliveries();
  }

  const totalDraftItems: number = summaryItems.reduce(
    (sum: number, item: SummaryItem) => sum + item.quantity,
    0
  );

  const sortedDeliveries: Delivery[] = [...deliveries].sort(
    (a: Delivery, b: Delivery) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (products.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Livraisons</h1>
        </div>
        <p className="py-12 text-center text-sm text-foreground/55">
          Cr&eacute;ez des produits pour commencer les livraisons.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Livraisons</h1>
      </div>

      <div className="card mb-8 rounded-lg border border-foreground/10 p-6">
        <div>
          <div>
            <span className="mb-2 block text-sm text-foreground/70">
              Destination
            </span>
            <div className="flex flex-wrap gap-2">
              {STORAGE_LOCATIONS.filter(
                (location: StorageLocation) => location !== source
              ).map((location: StorageLocation) => (
                <button
                  key={location}
                  type="button"
                  onClick={() => setDestination(location)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-all ${
                    destination === location
                      ? "btn-selected"
                      : "border-foreground/15 bg-white/80 text-foreground/60 hover:bg-white hover:text-foreground"
                  }`}
                >
                  {location}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <ProductGrid
            products={deliverableProducts}
            types={types}
            models={models}
            quantities={quantities}
            onQuantityChange={updateQuantity}
          />
        </div>

        {summaryItems.length > 0 && (
          <div className="mt-4">
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
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-foreground/10 pt-4">
          <span className="text-sm text-foreground/65">
            {totalDraftItems} article(s)
          </span>
          <button
            type="button"
            onClick={handleValidate}
            disabled={!isDraftValid() || submitting}
            className="btn-primary rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            Valider la livraison
          </button>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="mb-6 text-lg font-semibold">Historique</h2>

        {sortedDeliveries.length === 0 ? (
          <p className="py-12 text-center text-sm text-foreground/55">
            Aucune livraison enregistr&eacute;e.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedDeliveries.map((delivery: Delivery) => {
              const isExpanded: boolean = expandedIds.has(delivery.id);
              const itemCount: number = delivery.items.reduce(
                (sum: number, item: TransactionItem) => sum + item.quantity,
                0
              );

              return (
                <div
                  key={delivery.id}
                  className="rounded-lg border border-foreground/10"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpanded(delivery.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpanded(delivery.id);
                      }
                    }}
                    className="flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left text-sm transition-colors hover:bg-foreground/5"
                  >
                    <DatePicker
                      value={delivery.createdAt}
                      onChange={(dateStr) =>
                        updateDeliveryDate(delivery.id, dateStr)
                      }
                    />
                    <span className="text-foreground">
                      {delivery.source} &rarr; {delivery.destination}
                    </span>
                    <span className="text-foreground/80">
                      {itemCount} article(s)
                    </span>
                    <span className="ml-auto text-foreground/60">
                      {isExpanded ? "\u25be" : "\u25b8"}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-foreground/10 px-4 pb-4 pt-2">
                      <div className="overflow-x-auto rounded-lg border border-foreground/10">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="thead-row border-b border-foreground/10">
                              <th className="px-4 py-3 font-medium">
                                Produit
                              </th>
                              <th className="px-4 py-3 text-right font-medium">
                                Qt&eacute;
                              </th>
                              <th className="px-4 py-3 text-right font-medium">
                                Prix unitaire
                              </th>
                              <th className="px-4 py-3 text-right font-medium">
                                Sous-total
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {delivery.items.map(
                              (item: TransactionItem) => (
                                <tr
                                  key={item.productId}
                                  className="border-b border-foreground/5 last:border-b-0"
                                >
                                  <td className="px-4 py-3">
                                    {item.productName}
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono">
                                    {item.quantity}
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono text-foreground/70">
                                    {centsToDisplay(item.unitPriceCents)}
                                    &nbsp;&euro;
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono text-foreground/70">
                                    {centsToDisplay(
                                      item.quantity * item.unitPriceCents
                                    )}
                                    &nbsp;&euro;
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Total&nbsp;: {centsToDisplay(delivery.totalCents)}
                          &nbsp;&euro;
                        </span>
                        <button
                          type="button"
                          onClick={() => handleInvoice(delivery)}
                          className="btn-secondary rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
                        >
                          Facture
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
