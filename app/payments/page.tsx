"use client";

import { useState } from "react";
import { useSessionState } from "@/lib/use-session-state";
import { useSupabase } from "@/lib/use-supabase";
import {
  fetchPayments,
  fetchStock,
  fetchProducts,
  fetchElementTypes,
  fetchDrawingModels,
  insertPayment,
  applyStockDeltas,
  updatePaymentDate as updatePaymentDateDb,
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
} from "@/lib/types";
import DatePicker from "@/app/_components/date-picker";
import ProductGrid from "@/app/_components/product-grid";
import SelectionSummary, { type SummaryItem } from "@/app/_components/selection-summary";

function getUnitPrice(
  elementType: ElementType,
  source: StorageLocation
): number {
  if (source === "Usine") {
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

  const typesMap: Map<string, ElementType> = new Map(
    types.map((item: ElementType) => [item.id, item])
  );
  const modelsMap: Map<string, DrawingModel> = new Map(
    models.map((item: DrawingModel) => [item.id, item])
  );

  function getProductName(product: Product): string {
    const typeName: string =
      typesMap.get(product.elementTypeId)?.name ?? "\u2014";
    const modelName: string =
      modelsMap.get(product.drawingModelId)?.name ?? "\u2014";

    return `${typeName} \u2014 ${modelName}`;
  }

  function getAvailableStock(productId: string): number {
    if (source === "") {
      return 0;
    }

    return stock[productId]?.[source as StorageLocation] ?? 0;
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

    if (!window.confirm("Valider ce paiement\u00a0?")) {
      return;
    }

    const sourceLocation: StorageLocation = source as StorageLocation;

    for (const entry of summaryItems) {
      const available: number =
        stock[entry.productId]?.[sourceLocation] ?? 0;

      if (entry.quantity > available) {
        window.alert(
          `Stock insuffisant pour ${entry.productName}. Disponible\u00a0: ${String(available)}`
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

  async function handleUpdatePaymentDate(id: string, dateStr: string): Promise<void> {
    await updatePaymentDateDb(id, new Date(dateStr).toISOString());
    await refetchPayments();
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
              products={products}
              types={types}
              models={models}
              quantities={quantities}
              onQuantityChange={updateQuantity}
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
              const itemCount: number = payment.items.reduce(
                (sum: number, item: TransactionItem) =>
                  sum + item.quantity,
                0
              );

              return (
                <PaymentCard
                  key={payment.id}
                  payment={payment}
                  itemCount={itemCount}
                  isExpanded={isExpanded}
                  onToggle={() => toggleExpanded(payment.id)}
                  onDateChange={(dateStr: string) =>
                    handleUpdatePaymentDate(payment.id, dateStr)
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentCard({
  payment,
  itemCount,
  isExpanded,
  onToggle,
  onDateChange,
}: {
  payment: Payment;
  itemCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  onDateChange: (dateStr: string) => void;
}) {
  return (
    <div className="rounded-lg border border-foreground/10">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        className="flex w-full cursor-pointer items-center justify-between rounded-t-lg px-4 py-3 text-left text-sm transition-colors"
        style={{
          background: "linear-gradient(135deg, var(--sage), var(--sage-dark))",
          color: "var(--linen)",
        }}
      >
        <div className="flex items-center gap-6">
          <DatePicker
            value={payment.createdAt}
            onChange={(dateStr) => onDateChange(dateStr)}
          />
          <span className="font-medium">{payment.source}</span>
          <span className="opacity-85">
            {itemCount} article(s)
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono font-semibold" style={{ color: "inherit" }}>
            {centsToDisplay(payment.totalCents)}&nbsp;&euro;
          </span>
          <span className="opacity-60">
            {isExpanded ? "\u25be" : "\u25b8"}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-foreground/10">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="thead-row border-b border-foreground/10">
                <th className="px-4 py-3 font-medium">Produit</th>
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
              {payment.items.map((item: TransactionItem) => (
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
                    {centsToDisplay(item.unitPriceCents)}&nbsp;&euro;
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-foreground/70">
                    {centsToDisplay(item.quantity * item.unitPriceCents)}
                    &nbsp;&euro;
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-foreground/10 font-medium">
                <td className="px-4 py-3" colSpan={3}>
                  Total
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {centsToDisplay(payment.totalCents)}&nbsp;&euro;
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
