"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSessionState } from "@/lib/use-session-state";
import { useSupabase } from "@/lib/use-supabase";
import ProductGrid from "@/app/_components/product-grid";
import {
  fetchOrders,
  insertOrder,
  updateOrderDelivered,
  deleteOrder,
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
  type Order,
  type OrderItem,
  createOrder,
} from "@/lib/types";
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

function isViergeModel(model: DrawingModel): boolean {
  return model.name.trim().toLowerCase() === "vierge";
}

function formatDisplayDate(iso: string): string {
  const date: Date = new Date(iso);

  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getFullYear()),
  ].join("/");
}

function CommandesPageInner() {
  const searchParams = useSearchParams();
  const [orders, refetchOrders] = useSupabase<Order[]>(fetchOrders, []);
  const [stock, refetchStock] = useSupabase<Stock>(fetchStock, {});
  const [products] = useSupabase<Product[]>(fetchProducts, []);
  const [types] = useSupabase<ElementType[]>(fetchElementTypes, []);
  const [models] = useSupabase<DrawingModel[]>(fetchDrawingModels, []);

  const [quantities, setQuantities] = useSessionState<Record<string, number>>(
    "order-quantities",
    {}
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const confirm = useConfirm();
  const alert = useAlert();

  const prefillAppliedRef = useRef<boolean>(false);

  const typesMap: Map<string, ElementType> = new Map(
    types.map((item: ElementType) => [item.id, item])
  );
  const modelsMap: Map<string, DrawingModel> = new Map(
    models.map((item: DrawingModel) => [item.id, item])
  );

  const viergeProducts: Product[] = products.filter((product: Product) => {
    const model: DrawingModel | undefined = modelsMap.get(
      product.drawingModelId
    );

    if (model === undefined) {
      return false;
    }

    return isViergeModel(model);
  });

  useEffect(() => {
    if (prefillAppliedRef.current) {
      return;
    }

    if (products.length === 0 || models.length === 0) {
      return;
    }

    const productId: string | null = searchParams.get("productId");

    if (productId === null) {
      prefillAppliedRef.current = true;

      return;
    }

    const product: Product | undefined = products.find(
      (item: Product) => item.id === productId
    );

    if (product === undefined) {
      prefillAppliedRef.current = true;

      return;
    }

    const model: DrawingModel | undefined = models.find(
      (item: DrawingModel) => item.id === product.drawingModelId
    );

    if (model === undefined || !isViergeModel(model)) {
      prefillAppliedRef.current = true;

      return;
    }

    setSelectedTypeId(product.elementTypeId);
    prefillAppliedRef.current = true;
  }, [searchParams, products, models]);

  function updateQuantity(productId: string, value: number): void {
    setQuantities((previous: Record<string, number>) => ({
      ...previous,
      [productId]: Math.max(0, value),
    }));
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

  const draftItems: OrderItem[] = viergeProducts
    .filter((product: Product) => (quantities[product.id] ?? 0) > 0)
    .map((product: Product) => ({
      productId: product.id,
      productName: getProductName(product, typesMap, modelsMap),
      quantity: quantities[product.id],
    }));

  const totalDraftItems: number = draftItems.reduce(
    (sum: number, item: OrderItem) => sum + item.quantity,
    0
  );

  function isDraftValid(): boolean {
    return draftItems.length > 0;
  }

  async function handleSubmitOrder(): Promise<void> {
    if (submitting || !isDraftValid()) {
      return;
    }

    if (!(await confirm("Valider cette commande ?"))) {
      return;
    }

    const order: Order = createOrder({ items: draftItems });

    try {
      setSubmitting(true);
      await insertOrder(order);
      await refetchOrders();

      setQuantities({});
    } catch {
      await alert("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkDelivered(order: Order): Promise<void> {
    if (!(await confirm("Marquer la commande comme livrée ?"))) {
      return;
    }

    const deltas: {
      productId: string;
      location: StorageLocation;
      delta: number;
    }[] = order.items.map((item: OrderItem) => ({
      productId: item.productId,
      location: "Stock",
      delta: item.quantity,
    }));

    const deliveredAt: string = new Date().toISOString();

    try {
      await applyStockDeltas(deltas);
    } catch {
      await alert("Une erreur est survenue. Veuillez réessayer.");

      return;
    }

    try {
      await updateOrderDelivered(order.id, deliveredAt);
    } catch {
      const inverseDeltas: {
        productId: string;
        location: StorageLocation;
        delta: number;
      }[] = deltas.map((entry) => ({
        productId: entry.productId,
        location: entry.location,
        delta: -entry.delta,
      }));

      try {
        await applyStockDeltas(inverseDeltas);
      } catch {
        // Stock rollback failed — surface the original error anyway.
      }

      await alert("Erreur lors de la mise à jour. Veuillez réessayer.");

      return;
    }

    await refetchOrders();
    await refetchStock();
  }

  async function handleDeletePendingOrder(order: Order): Promise<void> {
    if (
      !(await confirm("Supprimer cette commande ?", {
        variant: "danger",
        confirmLabel: "Supprimer",
      }))
    ) {
      return;
    }

    try {
      await deleteOrder(order.id);
    } catch {
      await alert("Erreur lors de la suppression. Veuillez réessayer.");

      return;
    }

    await refetchOrders();
  }

  async function handleDeleteDeliveredOrder(order: Order): Promise<void> {
    if (
      !(await confirm("Supprimer cette commande livrée ?", {
        variant: "danger",
        confirmLabel: "Supprimer",
      }))
    ) {
      return;
    }

    const deltas: {
      productId: string;
      location: StorageLocation;
      delta: number;
    }[] = order.items.map((item: OrderItem) => ({
      productId: item.productId,
      location: "Stock",
      delta: -item.quantity,
    }));

    for (const entry of deltas) {
      const currentStock: number = stock[entry.productId]?.[entry.location] ?? 0;
      const projected: number = currentStock + entry.delta;

      if (projected < 0) {
        await alert(
          `Stock insuffisant à ${entry.location} pour annuler cette commande. Disponible : ${String(currentStock)}`
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
      await deleteOrder(order.id);
    } catch {
      const inverseDeltas: {
        productId: string;
        location: StorageLocation;
        delta: number;
      }[] = deltas.map((entry) => ({
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

    await refetchOrders();
    await refetchStock();
  }

  const pendingOrders: Order[] = orders.filter(
    (order: Order) => order.deliveredAt === null
  );
  const deliveredOrders: Order[] = orders
    .filter((order: Order) => order.deliveredAt !== null)
    .sort(
      (a: Order, b: Order) =>
        new Date(b.deliveredAt ?? 0).getTime() -
        new Date(a.deliveredAt ?? 0).getTime()
    );

  if (products.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Commandes</h1>
        </div>
        <p className="py-12 text-center text-sm text-foreground/55">
          Cr&eacute;ez des produits Vierge pour commencer les commandes.
        </p>
      </div>
    );
  }

  if (viergeProducts.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Commandes</h1>
        </div>
        <p className="py-12 text-center text-sm text-foreground/55">
          Aucun produit Vierge disponible.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Commandes</h1>
      </div>

      <div className="card mb-8 rounded-lg border border-foreground/10 p-6">
        <div>
          <ProductGrid
            products={viergeProducts}
            types={types}
            models={models}
            quantities={quantities}
            onQuantityChange={updateQuantity}
            selectedTypeId={selectedTypeId}
            onTypeChange={setSelectedTypeId}
          />
        </div>

        {draftItems.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-foreground/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="thead-row border-b border-foreground/10">
                  <th className="px-4 py-3 font-medium">Produit</th>
                  <th className="px-4 py-3 text-right font-medium">Qt&eacute;</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {draftItems.map((item: OrderItem) => {
                  const product: Product | undefined = viergeProducts.find(
                    (candidate: Product) => candidate.id === item.productId
                  );
                  const targetTypeId: string | undefined =
                    product?.elementTypeId;
                  const activateRow = (): void => {
                    if (targetTypeId === undefined) {
                      return;
                    }

                    setSelectedTypeId(targetTypeId);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  };

                  return (
                    <tr
                      key={item.productId}
                      role="button"
                      tabIndex={0}
                      onClick={activateRow}
                      onKeyDown={(
                        event: React.KeyboardEvent<HTMLTableRowElement>
                      ) => {
                        if (event.key === "Enter") {
                          activateRow();

                          return;
                        }

                        if (event.key === " ") {
                          event.preventDefault();
                          activateRow();
                        }
                      }}
                      className="cursor-pointer border-b border-foreground/5 last:border-b-0 hover:bg-foreground/5"
                    >
                      <td className="px-4 py-3">{item.productName}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {item.quantity}
                      </td>
                      <td
                        className="px-4 py-3 text-right"
                        onClick={(event: React.MouseEvent<HTMLTableCellElement>) =>
                          event.stopPropagation()
                        }
                        onKeyDown={(event: React.KeyboardEvent<HTMLTableCellElement>) =>
                          event.stopPropagation()
                        }
                      >
                        <button
                          type="button"
                          aria-label="Supprimer"
                          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                            event.stopPropagation();
                            updateQuantity(item.productId, 0);
                          }}
                          className="btn-danger text-red-500/70 transition-colors hover:text-red-500"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" /></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-foreground/10 pt-4">
          <span className="text-sm text-foreground/65">
            {totalDraftItems} article(s)
          </span>
          <button
            type="button"
            onClick={handleSubmitOrder}
            disabled={!isDraftValid() || submitting}
            className="btn-primary rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            Commander
          </button>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="mb-6 text-lg font-semibold">Commandes en cours</h2>

        {pendingOrders.length === 0 ? (
          <p className="py-12 text-center text-sm text-foreground/55">
            Aucune commande en cours.
          </p>
        ) : (
          <div className="space-y-3">
            {pendingOrders.map((order: Order) => {
              const isExpanded: boolean = expandedIds.has(order.id);
              const itemCount: number = order.items.reduce(
                (sum: number, item: OrderItem) => sum + item.quantity,
                0
              );

              return (
                <div
                  key={order.id}
                  className="rounded-lg border border-foreground/10"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpanded(order.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpanded(order.id);
                      }
                    }}
                    className="flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left text-sm transition-colors hover:bg-foreground/5"
                  >
                    <span className="font-mono text-foreground">
                      {formatDisplayDate(order.orderedAt)}
                    </span>
                    <span className="text-foreground/80">
                      {itemCount} article(s)
                    </span>
                    <span className="ml-auto text-foreground/60">
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-foreground/10 px-4 pb-4 pt-2">
                      <div className="overflow-x-auto rounded-lg border border-foreground/10">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="thead-row border-b border-foreground/10">
                              <th className="px-4 py-3 font-medium">Produit</th>
                              <th className="px-4 py-3 text-right font-medium">
                                Qt&eacute;
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items.map((item: OrderItem) => (
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
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleMarkDelivered(order)}
                          className="btn-primary rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80"
                        >
                          Marquer comme livr&eacute;
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePendingOrder(order)}
                          className="btn-danger rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-red-500/80 transition-colors hover:bg-red-500/5 hover:text-red-500"
                        >
                          Supprimer
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

      <div className="mt-12">
        <h2 className="mb-6 text-lg font-semibold">Historique</h2>

        {deliveredOrders.length === 0 ? (
          <p className="py-12 text-center text-sm text-foreground/55">
            Aucune commande livr&eacute;e.
          </p>
        ) : (
          <div className="space-y-3">
            {deliveredOrders.map((order: Order) => {
              const isExpanded: boolean = expandedIds.has(order.id);
              const itemCount: number = order.items.reduce(
                (sum: number, item: OrderItem) => sum + item.quantity,
                0
              );
              const deliveredAt: string = order.deliveredAt ?? order.orderedAt;

              return (
                <div
                  key={order.id}
                  className="rounded-lg border border-foreground/10"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpanded(order.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpanded(order.id);
                      }
                    }}
                    className="flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left text-sm transition-colors hover:bg-foreground/5"
                  >
                    <span className="font-mono text-foreground">
                      {formatDisplayDate(order.orderedAt)}
                    </span>
                    <span className="text-foreground/60">&rarr;</span>
                    <span className="font-mono text-foreground">
                      {formatDisplayDate(deliveredAt)}
                    </span>
                    <span className="text-foreground/80">
                      {itemCount} article(s)
                    </span>
                    <span className="ml-auto text-foreground/60">
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-foreground/10 px-4 pb-4 pt-2">
                      <div className="overflow-x-auto rounded-lg border border-foreground/10">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="thead-row border-b border-foreground/10">
                              <th className="px-4 py-3 font-medium">Produit</th>
                              <th className="px-4 py-3 text-right font-medium">
                                Qt&eacute;
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items.map((item: OrderItem) => (
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
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-3 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => handleDeleteDeliveredOrder(order)}
                          className="btn-danger rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-red-500/80 transition-colors hover:bg-red-500/5 hover:text-red-500"
                        >
                          Supprimer
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

export default function CommandesPage() {
  return (
    <Suspense fallback={null}>
      <CommandesPageInner />
    </Suspense>
  );
}
