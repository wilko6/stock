"use client";

import { useState } from "react";
import { useSessionState } from "@/lib/use-session-state";
import { useSupabase } from "@/lib/use-supabase";
import ProductGrid from "@/app/_components/product-grid";
import SelectionSummary, { type SummaryItem } from "@/app/_components/selection-summary";
import {
  fetchDeliveries,
  insertDelivery,
  updateDelivery,
  updateDeliveryDate as updateDeliveryDateDb,
  deleteDelivery,
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
  isSelectableProduct,
} from "@/lib/types";
import DatePicker from "@/app/_components/date-picker";
import { generateInvoiceHtml } from "@/lib/invoice";
import { useConfirm, useAlert } from "@/app/_components/dialog";

function getProductName(
  product: Product,
  typesMap: Map<string, ElementType>,
  modelsMap: Map<string, DrawingModel>
): string {
  const typeName: string = typesMap.get(product.elementTypeId)?.name ?? "—";
  const modelName: string =
    modelsMap.get(product.drawingModelId)?.name ?? "—";

  return `${typeName} — ${modelName}`;
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
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDestination, setEditDestination] = useState<string>("");
  const [editQuantities, setEditQuantities] = useState<Record<string, number>>({});
  const [editPriceOverrides, setEditPriceOverrides] = useState<Record<string, string>>({});
  const [editDescriptions, setEditDescriptions] = useState<Record<string, string>>({});
  const [editSubmitting, setEditSubmitting] = useState<boolean>(false);
  const confirm = useConfirm();
  const alert = useAlert();

  const typesMap: Map<string, ElementType> = new Map(
    types.map((item: ElementType) => [item.id, item])
  );
  const modelsMap: Map<string, DrawingModel> = new Map(
    models.map((item: DrawingModel) => [item.id, item])
  );
  const productsMap: Map<string, Product> = new Map(
    products.map((item: Product) => [item.id, item])
  );

  const source: string = "Stock";

  const deliverableProducts: Product[] = products.filter(
    (product: Product) => {
      const elementType: ElementType | undefined = typesMap.get(
        product.elementTypeId
      );

      return (
        elementType !== undefined &&
        elementType.intermediarySalePrice > 0 &&
        isSelectableProduct(product, modelsMap)
      );
    }
  );

  function getSourceStock(productId: string): number {
    return stock[productId]?.["Stock"] ?? 0;
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

    if (!(await confirm("Valider cette livraison ?"))) {
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
      await alert(
        `Stock insuffisant. Disponible : ${String(available)}`
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
      await alert("Une erreur est survenue. Veuillez réessayer.");
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

  async function handleDeleteDelivery(delivery: Delivery): Promise<void> {
    if (!(await confirm("Supprimer cette livraison ?", { variant: "danger", confirmLabel: "Supprimer" }))) {
      return;
    }

    const deltas: { productId: string; location: StorageLocation; delta: number }[] = [];

    for (const item of delivery.items) {
      deltas.push({
        productId: item.productId,
        location: delivery.source,
        delta: item.quantity,
      });
      deltas.push({
        productId: item.productId,
        location: delivery.destination,
        delta: -item.quantity,
      });
    }

    for (const entry of deltas) {
      if (entry.delta >= 0) {
        continue;
      }

      const currentStock: number = stock[entry.productId]?.[entry.location] ?? 0;
      const projected: number = currentStock + entry.delta;

      if (projected < 0) {
        await alert(
          `Stock insuffisant à ${entry.location} pour annuler cette livraison. Disponible : ${String(currentStock)}`
        );

        return;
      }
    }

    try {
      await applyStockDeltas(deltas);
    } catch {
      await alert("Une erreur est survenue. Veuillez réessayer.");

      return;
    }

    try {
      await deleteDelivery(delivery.id);
    } catch {
      const inverseDeltas: { productId: string; location: StorageLocation; delta: number }[] =
        deltas.map((entry) => ({
          productId: entry.productId,
          location: entry.location,
          delta: -entry.delta,
        }));

      try {
        await applyStockDeltas(inverseDeltas);
      } catch {
        // Stock rollback failed — surface the original error anyway.
      }

      await alert("Erreur lors de la suppression. Veuillez réessayer.");

      return;
    }

    if (editingId === delivery.id) {
      resetEditState();
    }

    await refetchDeliveries();
    await refetchStock();
  }

  function resetEditState(): void {
    setEditingId(null);
    setEditDestination("");
    setEditQuantities({});
    setEditPriceOverrides({});
    setEditDescriptions({});
  }

  async function enterEditMode(delivery: Delivery): Promise<void> {
    if (editingId !== null && editingId !== delivery.id) {
      if (!(await confirm("Annuler les modifications en cours ?"))) {
        return;
      }
    }

    const nextQuantities: Record<string, number> = {};
    const nextPriceOverrides: Record<string, string> = {};
    const nextDescriptions: Record<string, string> = {};

    for (const item of delivery.items) {
      nextQuantities[item.productId] = item.quantity;

      const product: Product | undefined = productsMap.get(item.productId);
      const elementType: ElementType | undefined = product !== undefined
        ? typesMap.get(product.elementTypeId)
        : undefined;
      const autoPrice: number = elementType?.intermediarySalePrice ?? 0;

      if (item.unitPriceCents !== autoPrice) {
        nextPriceOverrides[item.productId] = (item.unitPriceCents / 100).toString();
      }

      if (item.description !== undefined) {
        nextDescriptions[item.productId] = item.description;
      }
    }

    setEditingId(delivery.id);
    setEditDestination(delivery.destination);
    setEditQuantities(nextQuantities);
    setEditPriceOverrides(nextPriceOverrides);
    setEditDescriptions(nextDescriptions);
  }

  function updateEditQuantity(productId: string, value: number): void {
    setEditQuantities((previous: Record<string, number>) => ({
      ...previous,
      [productId]: Math.max(0, value),
    }));
  }

  function buildEditSummaryItems(): SummaryItem[] {
    return deliverableProducts
      .filter((product: Product) => (editQuantities[product.id] ?? 0) > 0)
      .map((product: Product): SummaryItem => {
        const elementType: ElementType | undefined = typesMap.get(
          product.elementTypeId
        );
        const autoPrice: number = elementType?.intermediarySalePrice ?? 0;
        const override: string | undefined = editPriceOverrides[product.id];
        const unitPriceCents: number =
          override !== undefined && override !== ""
            ? Math.round(Number(override) * 100)
            : autoPrice;

        return {
          productId: product.id,
          productName: getProductName(product, typesMap, modelsMap),
          quantity: editQuantities[product.id],
          unitPriceCents,
          autoPrice,
        };
      });
  }

  async function handleSaveEdit(original: Delivery): Promise<void> {
    if (editSubmitting) {
      return;
    }

    const editSummary: SummaryItem[] = buildEditSummaryItems();

    if (editSummary.length === 0) {
      await alert("Aucun article sélectionné");

      return;
    }

    const newDestination: StorageLocation = editDestination as StorageLocation;
    const originalSource: StorageLocation = original.source;

    if (originalSource === newDestination) {
      await alert("La source et la destination doivent être différentes");

      return;
    }

    type DeltaEntry = { productId: string; location: StorageLocation; delta: number };
    const deltaMap: Map<string, DeltaEntry> = new Map();

    function addDelta(productId: string, location: StorageLocation, amount: number): void {
      const key: string = `${productId}|${location}`;
      const existing: DeltaEntry | undefined = deltaMap.get(key);

      if (existing === undefined) {
        deltaMap.set(key, { productId, location, delta: amount });

        return;
      }

      existing.delta += amount;
    }

    for (const item of original.items) {
      addDelta(item.productId, original.source, item.quantity);
      addDelta(item.productId, original.destination, -item.quantity);
    }

    for (const item of editSummary) {
      addDelta(item.productId, originalSource, -item.quantity);
      addDelta(item.productId, newDestination, item.quantity);
    }

    const deltas: DeltaEntry[] = [];

    for (const entry of deltaMap.values()) {
      if (entry.delta === 0) {
        continue;
      }

      deltas.push(entry);
    }

    for (const entry of deltas) {
      const currentStock: number = stock[entry.productId]?.[entry.location] ?? 0;
      const projected: number = currentStock + entry.delta;

      if (projected < 0) {
        await alert(
          `Stock insuffisant à ${entry.location}. Manquant : ${String(-projected)}`
        );

        return;
      }
    }

    const items: TransactionItem[] = editSummary.map(
      (item: SummaryItem): TransactionItem => {
        const description: string | undefined = editDescriptions[item.productId];
        const trimmed: string | undefined = description !== undefined && description !== ""
          ? description
          : undefined;

        return {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          ...(trimmed !== undefined ? { description: trimmed } : {}),
        };
      }
    );

    const totalCents: number = items.reduce(
      (sum: number, item: TransactionItem) =>
        sum + item.quantity * item.unitPriceCents,
      0
    );

    const updated: Delivery = {
      ...original,
      source: originalSource,
      destination: newDestination,
      items,
      totalCents,
    };

    try {
      setEditSubmitting(true);
      await applyStockDeltas(deltas);
      await updateDelivery(updated);
      await refetchDeliveries();
      await refetchStock();
      resetEditState();
    } catch {
      await alert("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setEditSubmitting(false);
    }
  }

  function hasMissingProducts(delivery: Delivery): boolean {
    return delivery.items.some(
      (item: TransactionItem) => !productsMap.has(item.productId)
    );
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

  const editSummaryItems: SummaryItem[] = editingId !== null ? buildEditSummaryItems() : [];

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
            selectedTypeId={selectedTypeId}
            onTypeChange={setSelectedTypeId}
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
              onItemClick={(productId: string) => {
                const product: Product | undefined = productsMap.get(productId);

                if (product !== undefined) {
                  setSelectedTypeId(product.elementTypeId);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              onItemRemove={(productId: string) => updateQuantity(productId, 0)}
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
              const isEditing: boolean = editingId === delivery.id;
              const missingProducts: boolean = hasMissingProducts(delivery);
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
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </div>

                  {isExpanded && !isEditing && (
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
                      {missingProducts && (
                        <p className="mt-3 text-sm text-foreground/65">
                          Cette livraison contient des produits supprim&eacute;s. Modification indisponible.
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Total&nbsp;: {centsToDisplay(delivery.totalCents)}
                          &nbsp;&euro;
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleInvoice(delivery)}
                            className="btn-secondary rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
                          >
                            Facture
                          </button>
                          <button
                            type="button"
                            onClick={() => enterEditMode(delivery)}
                            disabled={missingProducts}
                            className="btn-secondary rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-40"
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDelivery(delivery)}
                            className="btn-danger rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-red-500/80 transition-colors hover:bg-red-500/5 hover:text-red-500"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isExpanded && isEditing && (
                    <div className="border-t border-foreground/10 px-4 pb-4 pt-4">
                      <div>
                        <span className="mb-2 block text-sm text-foreground/70">
                          Destination
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {STORAGE_LOCATIONS.filter(
                            (location: StorageLocation) => location !== delivery.source
                          ).map((location: StorageLocation) => (
                            <button
                              key={location}
                              type="button"
                              onClick={() => setEditDestination(location)}
                              className={`rounded-md border px-3 py-1.5 text-sm transition-all ${
                                editDestination === location
                                  ? "btn-selected"
                                  : "border-foreground/15 bg-white/80 text-foreground/60 hover:bg-white hover:text-foreground"
                              }`}
                            >
                              {location}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4">
                        <ProductGrid
                          products={deliverableProducts}
                          types={types}
                          models={models}
                          quantities={editQuantities}
                          onQuantityChange={updateEditQuantity}
                          selectedTypeId={selectedTypeId}
                          onTypeChange={setSelectedTypeId}
                        />
                      </div>

                      {editSummaryItems.length > 0 && (
                        <div className="mt-4">
                          <SelectionSummary
                            items={editSummaryItems}
                            priceOverrides={editPriceOverrides}
                            onPriceOverrideChange={(productId: string, value: string) =>
                              setEditPriceOverrides((previous: Record<string, string>) => ({
                                ...previous,
                                [productId]: value,
                              }))
                            }
                            descriptions={editDescriptions}
                            onDescriptionChange={(productId: string, value: string) =>
                              setEditDescriptions((previous: Record<string, string>) => ({
                                ...previous,
                                [productId]: value,
                              }))
                            }
                            onItemClick={(productId: string) => {
                              const product: Product | undefined =
                                productsMap.get(productId);

                              if (product !== undefined) {
                                setSelectedTypeId(product.elementTypeId);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }
                            }}
                            onItemRemove={(productId: string) =>
                              updateEditQuantity(productId, 0)
                            }
                          />
                        </div>
                      )}

                      <div className="mt-4 flex items-center justify-end gap-2 border-t border-foreground/10 pt-4">
                        <button
                          type="button"
                          onClick={resetEditState}
                          disabled={editSubmitting}
                          className="btn-secondary rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-40"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(delivery)}
                          disabled={editSubmitting}
                          className="btn-primary rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40"
                        >
                          Enregistrer
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
