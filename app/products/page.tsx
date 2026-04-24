"use client";

import { useState } from "react";
import { useSessionState } from "@/lib/use-session-state";
import { useSupabase } from "@/lib/use-supabase";
import { useConfirm, useAlert } from "@/app/_components/dialog";
import {
  fetchProducts,
  insertProduct,
  deleteProduct,
  fetchElementTypes,
  fetchDrawingModels,
} from "@/lib/db";
import {
  type ElementType,
  type DrawingModel,
  type Product,
  createProduct,
  centsToDisplay,
  drawingModelImageSrc,
} from "@/lib/types";

function deriveName(
  product: Product,
  typesMap: Map<string, ElementType>,
  modelsMap: Map<string, DrawingModel>
): string {
  const typeName: string = typesMap.get(product.elementTypeId)?.name ?? "\u2014";
  const modelName: string =
    modelsMap.get(product.drawingModelId)?.name ?? "\u2014";

  return `${typeName} \u2014 ${modelName}`;
}

export default function ProductsPage() {
  const [products, refetchProducts] = useSupabase<Product[]>(fetchProducts, []);
  const [types] = useSupabase<ElementType[]>(fetchElementTypes, []);
  const [models] = useSupabase<DrawingModel[]>(fetchDrawingModels, []);
  const [selectedTypeIds, setSelectedTypeIds] = useSessionState<string[]>(
    "product-selectedTypeIds",
    []
  );
  const [selectedModelIds, setSelectedModelIds] = useSessionState<string[]>(
    "product-selectedModelIds",
    []
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const confirm = useConfirm();
  const alert = useAlert();

  const typesMap: Map<string, ElementType> = new Map(
    types.map((item: ElementType) => [item.id, item])
  );
  const modelsMap: Map<string, DrawingModel> = new Map(
    models.map((item: DrawingModel) => [item.id, item])
  );

  const existingPairs: Set<string> = new Set(
    products.map(
      (p: Product) => `${p.elementTypeId}|${p.drawingModelId}`
    )
  );

  const newCombinations: { elementTypeId: string; drawingModelId: string }[] =
    [];

  for (const typeId of selectedTypeIds) {
    for (const modelId of selectedModelIds) {
      if (!existingPairs.has(`${typeId}|${modelId}`)) {
        newCombinations.push({ elementTypeId: typeId, drawingModelId: modelId });
      }
    }
  }

  function toggleType(id: string): void {
    setSelectedTypeIds((previous: string[]) =>
      previous.includes(id)
        ? previous.filter((item: string) => item !== id)
        : [...previous, id]
    );
  }

  function toggleModel(id: string): void {
    setSelectedModelIds((previous: string[]) =>
      previous.includes(id)
        ? previous.filter((item: string) => item !== id)
        : [...previous, id]
    );
  }

  function resetSelection(): void {
    setSelectedTypeIds([]);
    setSelectedModelIds([]);
  }

  async function handleCreate(): Promise<void> {
    if (submitting || newCombinations.length === 0) {
      return;
    }

    try {
      setSubmitting(true);

      for (const combo of newCombinations) {
        const newProduct: Product = createProduct(combo);
        await insertProduct(newProduct);
      }

      await refetchProducts();
      resetSelection();
    } catch {
      await alert("Une erreur est survenue. Veuillez r\u00e9essayer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(product: Product): Promise<void> {
    const name: string = deriveName(product, typesMap, modelsMap);

    if (!(await confirm(`Supprimer le produit ${name} et son stock\u00a0?`, { variant: "danger", confirmLabel: "Supprimer" }))) {
      return;
    }

    await deleteProduct(product.id);
    await refetchProducts();
  }

  const alreadyExistingCount: number =
    selectedTypeIds.length * selectedModelIds.length - newCombinations.length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Produits</h1>
      </div>

      <div className="card mb-8 rounded-lg border border-foreground/10 p-6">
        <h2 className="mb-4 text-sm font-semibold">Cr&eacute;er des produits</h2>

        <div>
          <span className="mb-2 block text-sm text-foreground/70">
            Types (support)
          </span>
          <div className="flex flex-wrap gap-2">
            {types.map((elementType: ElementType) => (
              <button
                key={elementType.id}
                type="button"
                onClick={() => toggleType(elementType.id)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-all ${
                  selectedTypeIds.includes(elementType.id)
                    ? "btn-selected"
                    : "border-foreground/15 bg-white/80 text-foreground/60 hover:bg-white hover:text-foreground"
                }`}
              >
                {elementType.name}
              </button>
            ))}
          </div>
          {types.length === 0 && (
            <p className="py-2 text-sm text-foreground/55">
              Aucun type disponible
            </p>
          )}
        </div>

        <div className="mt-4">
          <span className="mb-2 block text-sm text-foreground/70">
            Mod&egrave;les (dessin)
          </span>
          {models.length === 0 ? (
            <p className="py-2 text-sm text-foreground/55">
              Aucun mod&egrave;le disponible
            </p>
          ) : (
            <div className="flex flex-wrap gap-3 py-2">
              {models.map((model: DrawingModel) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => toggleModel(model.id)}
                  className={`rounded-lg border p-2 flex-shrink-0 w-24 transition-all ${
                    selectedModelIds.includes(model.id)
                      ? "btn-selected"
                      : "border-foreground/10 hover:border-foreground/30"
                  }`}
                >
                  <img
                    src={drawingModelImageSrc(model)}
                    alt={model.name}
                    className="h-20 w-20 rounded object-cover"
                  />
                  <span className="mt-1 block text-xs text-center truncate">
                    {model.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {(selectedTypeIds.length > 0 || selectedModelIds.length > 0) && (
          <div className="mt-4 border-t border-foreground/10 pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-foreground/70">
                {newCombinations.length > 0 && (
                  <span>
                    {newCombinations.length} produit(s) &agrave; cr&eacute;er
                  </span>
                )}
                {alreadyExistingCount > 0 && (
                  <span className="ml-2 text-foreground/40">
                    ({alreadyExistingCount} d&eacute;j&agrave; existant(s))
                  </span>
                )}
                {newCombinations.length === 0 &&
                  selectedTypeIds.length > 0 &&
                  selectedModelIds.length > 0 && (
                    <span className="text-foreground/40">
                      Tous les produits existent d&eacute;j&agrave;
                    </span>
                  )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={resetSelection}
                  className="btn-secondary rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={newCombinations.length === 0 || submitting}
                  className="btn-primary rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40"
                >
                  Cr&eacute;er {newCombinations.length > 0 ? `(${newCombinations.length})` : ""}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <p className="py-12 text-center text-sm text-foreground/55">
          Aucun produit enregistr&eacute;.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-foreground/10">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="thead-row border-b border-foreground/10">
                <th className="px-4 py-3 font-medium">Mod&egrave;le</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">
                  Prix d&apos;achat
                </th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product: Product) => {
                const elementType: ElementType | undefined = typesMap.get(
                  product.elementTypeId
                );
                const model: DrawingModel | undefined = modelsMap.get(
                  product.drawingModelId
                );

                return (
                  <tr
                    key={product.id}
                    className="border-b border-foreground/5 last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {model !== undefined ? (
                          <img
                            src={drawingModelImageSrc(model)}
                            alt={model.name}
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-foreground/10" />
                        )}
                        <span>{model?.name ?? "\u2014"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {elementType?.name ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground/70">
                      {elementType !== undefined
                        ? `${centsToDisplay(elementType.purchasePrice)}\u00a0\u20ac`
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(product)}
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
    </div>
  );
}
