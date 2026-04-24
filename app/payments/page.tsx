"use client";

import { useState } from "react";
import { useSessionState } from "@/lib/use-session-state";
import { useSupabase } from "@/lib/use-supabase";
import { useConfirm, useAlert } from "@/app/_components/dialog";
import {
  fetchPayments,
  fetchStock,
  fetchProducts,
  fetchElementTypes,
  fetchDrawingModels,
  insertPayment,
  applyStockDeltas,
  updatePayment,
  updatePaymentDate as updatePaymentDateDb,
  deletePayment,
} from "@/lib/db";
import {
  type ElementType,
  type DrawingModel,
  type Product,
  type Stock,
  type StorageLocation,
  type Payment,
  type TransactionItem,
  STORAGE_LOCATIONS,
  createPayment,
  centsToDisplay,
  isSelectableProduct,
} from "@/lib/types";
import DatePicker from "@/app/_components/date-picker";
import ProductGrid from "@/app/_components/product-grid";
import SelectionSummary, { type SummaryItem } from "@/app/_components/selection-summary";
import { generateInvoiceHtml } from "@/lib/invoice";

function getUnitPrice(
  elementType: ElementType,
  source: StorageLocation
): number {
  if (source === "Stock") {
    return elementType.directSalePrice;
  }

  return elementType.intermediarySalePrice;
}

export default function PaymentsPage() {
  const [payments, refetchPayments] = useSupabase<Payment[]>(fetchPayments, []);
  const [stock, refetchStock] = useSupabase<Stock>(fetchStock, {});
  const [products] = useSupabase<Product[]>(fetchProducts, []);
  const [types] = useSupabase<ElementType[]>(fetchElementTypes, []);
  const [models] = useSupabase<DrawingModel[]>(fetchDrawingModels, []);

  const [source, setSource] = useSessionState<string>("payment-source", "");
  const [quantities, setQuantities] = useSessionState<Record<string, number>>("payment-quantities", {});
  const [priceOverrides, setPriceOverrides] = useSessionState<Record<string, string>>("payment-priceOverrides", {});
  const [descriptions, setDescriptions] = useSessionState<Record<string, string>>("payment-descriptions", {});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSource, setEditSource] = useState<string>("");
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

  const selectableProducts: Product[] = products.filter((product: Product) =>
    isSelectableProduct(product, modelsMap)
  );

  function getProductName(product: Product): string {
    const typeName: string =
      typesMap.get(product.elementTypeId)?.name ?? "—";
    const modelName: string =
      modelsMap.get(product.drawingModelId)?.name ?? "—";

    return `${typeName} — ${modelName}`;
  }

  function updateQuantity(productId: string, value: number): void {
    setQuantities((previous: Record<string, number>) => ({
      ...previous,
      [productId]: Math.max(0, value),
    }));
  }

  function handleSourceChange(newSource: string): void {
    setSource(newSource);
    setQuantities({});
    setPriceOverrides({});
    setDescriptions({});
  }

  const summaryItems: SummaryItem[] = products
    .filter((product: Product) => (quantities[product.id] ?? 0) > 0)
    .map((product: Product): SummaryItem => {
      const elementType: ElementType | undefined = typesMap.get(product.elementTypeId);
      const autoPrice: number = elementType !== undefined
        ? getUnitPrice(elementType, source as StorageLocation)
        : 0;
      const override: string | undefined = priceOverrides[product.id];
      const unitPriceCents: number =
        override !== undefined && override !== ""
          ? Math.round(Number(override) * 100)
          : autoPrice;

      return {
        productId: product.id,
        productName: getProductName(product),
        quantity: quantities[product.id],
        unitPriceCents,
        autoPrice,
      };
    });

  async function handleSubmitPayment(): Promise<void> {
    if (submitting || source === "" || summaryItems.length === 0) {
      return;
    }

    if (!(await confirm("Valider ce paiement ?"))) {
      return;
    }

    const sourceLocation: StorageLocation = source as StorageLocation;

    for (const entry of summaryItems) {
      const available: number =
        stock[entry.productId]?.[sourceLocation] ?? 0;

      if (entry.quantity > available) {
        await alert(
          `Stock insuffisant pour ${entry.productName}. Disponible : ${String(available)}`
        );

        return;
      }
    }

    const items: TransactionItem[] = summaryItems.map(
      (entry: SummaryItem): TransactionItem => {
        const description: string | undefined = descriptions[entry.productId]?.trim() || undefined;

        return {
          productId: entry.productId,
          productName: entry.productName,
          quantity: entry.quantity,
          unitPriceCents: entry.unitPriceCents,
          ...(description !== undefined ? { description } : {}),
        };
      }
    );

    const totalCents: number = items.reduce(
      (sum: number, item: TransactionItem) =>
        sum + item.quantity * item.unitPriceCents,
      0
    );

    const payment: Payment = createPayment({
      source: sourceLocation,
      items,
      totalCents,
    });

    try {
      setSubmitting(true);
      await insertPayment(payment);

      const deltas: { productId: string; location: StorageLocation; delta: number }[] =
        items.map((item: TransactionItem) => ({
          productId: item.productId,
          location: sourceLocation,
          delta: -item.quantity,
        }));

      await applyStockDeltas(deltas);
      await refetchPayments();
      await refetchStock();

      setSource("");
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

  async function handleUpdatePaymentDate(id: string, dateStr: string): Promise<void> {
    await updatePaymentDateDb(id, new Date(dateStr).toISOString());
    await refetchPayments();
  }

  function handleInvoice(payment: Payment): void {
    const html: string = generateInvoiceHtml(payment);
    const win: Window | null = window.open("", "_blank");

    if (win !== null) {
      win.document.write(html);
      win.document.close();
    }
  }

  async function handleDeletePayment(payment: Payment): Promise<void> {
    if (!(await confirm("Supprimer ce paiement ?", { variant: "danger", confirmLabel: "Supprimer" }))) {
      return;
    }

    const deltas: { productId: string; location: StorageLocation; delta: number }[] =
      payment.items.map((item: TransactionItem) => ({
        productId: item.productId,
        location: payment.source,
        delta: item.quantity,
      }));

    try {
      await applyStockDeltas(deltas);
    } catch {
      await alert("Une erreur est survenue. Veuillez réessayer.");

      return;
    }

    try {
      await deletePayment(payment.id);
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

    if (editingId === payment.id) {
      resetEditState();
    }

    await refetchPayments();
    await refetchStock();
  }

  function resetEditState(): void {
    setEditingId(null);
    setEditSource("");
    setEditQuantities({});
    setEditPriceOverrides({});
    setEditDescriptions({});
  }

  async function enterEditMode(payment: Payment): Promise<void> {
    if (editingId !== null && editingId !== payment.id) {
      if (!(await confirm("Annuler les modifications en cours ?"))) {
        return;
      }
    }

    const nextQuantities: Record<string, number> = {};
    const nextPriceOverrides: Record<string, string> = {};
    const nextDescriptions: Record<string, string> = {};

    for (const item of payment.items) {
      nextQuantities[item.productId] = item.quantity;

      const product: Product | undefined = productsMap.get(item.productId);
      const elementType: ElementType | undefined = product !== undefined
        ? typesMap.get(product.elementTypeId)
        : undefined;
      const autoPrice: number = elementType !== undefined
        ? getUnitPrice(elementType, payment.source)
        : 0;

      if (item.unitPriceCents !== autoPrice) {
        nextPriceOverrides[item.productId] = (item.unitPriceCents / 100).toString();
      }

      if (item.description !== undefined) {
        nextDescriptions[item.productId] = item.description;
      }
    }

    setEditingId(payment.id);
    setEditSource(payment.source);
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
    if (editSource === "") {
      return [];
    }

    const editSourceLocation: StorageLocation = editSource as StorageLocation;

    return products
      .filter((product: Product) => (editQuantities[product.id] ?? 0) > 0)
      .map((product: Product): SummaryItem => {
        const elementType: ElementType | undefined = typesMap.get(product.elementTypeId);
        const autoPrice: number = elementType !== undefined
          ? getUnitPrice(elementType, editSourceLocation)
          : 0;
        const override: string | undefined = editPriceOverrides[product.id];
        const unitPriceCents: number =
          override !== undefined && override !== ""
            ? Math.round(Number(override) * 100)
            : autoPrice;

        return {
          productId: product.id,
          productName: getProductName(product),
          quantity: editQuantities[product.id],
          unitPriceCents,
          autoPrice,
        };
      });
  }

  async function handleSaveEdit(original: Payment): Promise<void> {
    if (editSubmitting) {
      return;
    }

    const editSummary: SummaryItem[] = buildEditSummaryItems();

    if (editSummary.length === 0) {
      await alert("Aucun article sélectionné");

      return;
    }

    if (editSource === "") {
      return;
    }

    const newSourceLocation: StorageLocation = editSource as StorageLocation;

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
    }

    for (const item of editSummary) {
      addDelta(item.productId, newSourceLocation, -item.quantity);
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
        const description: string | undefined = editDescriptions[item.productId]?.trim() || undefined;

        return {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          ...(description !== undefined ? { description } : {}),
        };
      }
    );

    const totalCents: number = items.reduce(
      (sum: number, item: TransactionItem) =>
        sum + item.quantity * item.unitPriceCents,
      0
    );

    const updated: Payment = {
      ...original,
      source: newSourceLocation,
      items,
      totalCents,
    };

    try {
      setEditSubmitting(true);
      await applyStockDeltas(deltas);
      await updatePayment(updated);
      await refetchPayments();
      await refetchStock();
      resetEditState();
    } catch {
      await alert("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setEditSubmitting(false);
    }
  }

  function hasMissingProducts(payment: Payment): boolean {
    return payment.items.some(
      (item: TransactionItem) => !productsMap.has(item.productId)
    );
  }

  const draftItemCount: number = summaryItems.reduce(
    (sum: number, entry: SummaryItem) => sum + entry.quantity,
    0
  );

  const sortedPayments: Payment[] = [...payments].sort(
    (a: Payment, b: Payment) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (products.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Paiements</h1>
        </div>
        <p className="py-12 text-center text-sm text-foreground/55">
          Cr&eacute;ez des produits pour commencer les paiements.
        </p>
      </div>
    );
  }

  const editSummary: SummaryItem[] = editingId !== null ? buildEditSummaryItems() : [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Paiements</h1>
      </div>

      <div className="card mb-8 rounded-lg border border-foreground/10 p-6">
        <div>
          <span className="mb-2 block text-sm text-foreground/70">
            Source
          </span>
          <div className="flex flex-wrap gap-2">
            {STORAGE_LOCATIONS.map((location: StorageLocation) => (
              <button
                key={location}
                type="button"
                onClick={() => {
                  if (location !== source) {
                    handleSourceChange(location);
                  }
                }}
                className={`rounded-md border px-3 py-1.5 text-sm transition-all ${
                  source === location
                    ? "btn-selected"
                    : "border-foreground/15 bg-white/80 text-foreground/60 hover:bg-white hover:text-foreground"
                }`}
              >
                {location}
              </button>
            ))}
          </div>
        </div>

        {source !== "" && (
          <div className="mt-6">
            <ProductGrid
              products={selectableProducts}
              types={types}
              models={models}
              quantities={quantities}
              onQuantityChange={updateQuantity}
              selectedTypeId={selectedTypeId}
              onTypeChange={setSelectedTypeId}
            />
          </div>
        )}

        {summaryItems.length > 0 && (
          <div className="mt-6">
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
            {draftItemCount} article(s)
          </span>
          <button
            type="button"
            onClick={handleSubmitPayment}
            disabled={source === "" || summaryItems.length === 0 || submitting}
            className="btn-primary rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            Valider le paiement
          </button>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="mb-6 text-lg font-semibold">Historique</h2>

        {sortedPayments.length === 0 ? (
          <p className="py-12 text-center text-sm text-foreground/55">
            Aucun paiement enregistr&eacute;.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedPayments.map((payment: Payment) => {
              const isExpanded: boolean = expandedIds.has(payment.id);
              const isEditing: boolean = editingId === payment.id;
              const missingProducts: boolean = hasMissingProducts(payment);
              const itemCount: number = payment.items.reduce(
                (sum: number, item: TransactionItem) => sum + item.quantity,
                0
              );

              function getPurchasePriceCents(item: TransactionItem): number {
                const product: Product | undefined = productsMap.get(item.productId);

                if (product === undefined) {
                  return 0;
                }

                return typesMap.get(product.elementTypeId)?.purchasePrice ?? 0;
              }

              const totalBenefitCents: number = payment.items.reduce(
                (sum: number, item: TransactionItem) => {
                  const purchasePriceCents: number = getPurchasePriceCents(item);

                  return (
                    sum + item.quantity * (item.unitPriceCents - purchasePriceCents)
                  );
                },
                0
              );

              return (
                <div
                  key={payment.id}
                  className="rounded-lg border border-foreground/10"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpanded(payment.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpanded(payment.id);
                      }
                    }}
                    className="flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left text-sm transition-colors hover:bg-foreground/5"
                  >
                    <DatePicker
                      value={payment.createdAt}
                      onChange={(dateStr) =>
                        handleUpdatePaymentDate(payment.id, dateStr)
                      }
                    />
                    <span className="text-foreground">{payment.source}</span>
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
                                Prix d&rsquo;achat
                              </th>
                              <th className="px-4 py-3 text-right font-medium">
                                Prix unitaire
                              </th>
                              <th className="px-4 py-3 text-right font-medium">
                                B&eacute;n&eacute;fice
                              </th>
                              <th className="px-4 py-3 text-right font-medium">
                                Sous-total
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {payment.items.map((item: TransactionItem) => {
                              const purchasePriceCents: number = getPurchasePriceCents(item);
                              const benefitCents: number = item.unitPriceCents - purchasePriceCents;

                              return (
                                <tr
                                  key={item.productId}
                                  className="border-b border-foreground/5 last:border-b-0"
                                >
                                  <td className="px-4 py-3">
                                    {item.productName}
                                    {item.description !== undefined && (
                                      <span className="ml-2 text-xs text-foreground/55">
                                        ({item.description})
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono">
                                    {item.quantity}
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono text-foreground/70">
                                    {centsToDisplay(purchasePriceCents)}
                                    &nbsp;&euro;
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono text-foreground/70">
                                    {centsToDisplay(item.unitPriceCents)}
                                    &nbsp;&euro;
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono text-foreground/70">
                                    {centsToDisplay(benefitCents)}
                                    &nbsp;&euro;
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono text-foreground/70">
                                    {centsToDisplay(item.quantity * item.unitPriceCents)}
                                    &nbsp;&euro;
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {missingProducts && (
                        <p className="mt-3 text-sm text-foreground/65">
                          Ce paiement contient des produits supprim&eacute;s. Modification indisponible.
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium">
                            Total&nbsp;: {centsToDisplay(payment.totalCents)}
                            &nbsp;&euro;
                          </span>
                          <span className="text-sm font-medium">
                            Total b&eacute;n&eacute;fice&nbsp;: {centsToDisplay(totalBenefitCents)}
                            &nbsp;&euro;
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleInvoice(payment)}
                            className="btn-secondary rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
                          >
                            Facture
                          </button>
                          <button
                            type="button"
                            onClick={() => enterEditMode(payment)}
                            disabled={missingProducts}
                            className="btn-secondary rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-40"
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePayment(payment)}
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
                          Source
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {STORAGE_LOCATIONS.map((location: StorageLocation) => (
                            <button
                              key={location}
                              type="button"
                              onClick={() => setEditSource(location)}
                              className={`rounded-md border px-3 py-1.5 text-sm transition-all ${
                                editSource === location
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
                          products={selectableProducts}
                          types={types}
                          models={models}
                          quantities={editQuantities}
                          onQuantityChange={updateEditQuantity}
                          selectedTypeId={selectedTypeId}
                          onTypeChange={setSelectedTypeId}
                        />
                      </div>

                      {editSummary.length > 0 && (
                        <div className="mt-4">
                          <SelectionSummary
                            items={editSummary}
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
                          onClick={() => handleSaveEdit(payment)}
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
