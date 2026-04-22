"use client";

import { useRef, type FormEvent } from "react";
import { useSessionState } from "@/lib/use-session-state";
import { useSupabase } from "@/lib/use-supabase";
import {
  fetchElementTypes,
  upsertElementType,
  deleteElementType,
  fetchProducts,
} from "@/lib/db";
import {
  type ElementType,
  type Product,
  createElementType,
  centsToDisplay,
  displayToCents,
} from "@/lib/types";

interface TypeFormFields {
  name: string;
  purchasePrice: string;
  directSalePrice: string;
  intermediarySalePrice: string;
}

const emptyForm: TypeFormFields = {
  name: "",
  purchasePrice: "",
  directSalePrice: "",
  intermediarySalePrice: "",
};

function toTypeFormFields(elementType: ElementType): TypeFormFields {
  return {
    name: elementType.name,
    purchasePrice: centsToDisplay(elementType.purchasePrice),
    directSalePrice: centsToDisplay(elementType.directSalePrice),
    intermediarySalePrice: centsToDisplay(elementType.intermediarySalePrice),
  };
}

function isFormValid(form: TypeFormFields): boolean {
  if (form.name.trim() === "") {
    return false;
  }

  const requiredPrices: string[] = [
    form.purchasePrice,
    form.directSalePrice,
  ];

  if (
    !requiredPrices.every(
      (price: string) =>
        price !== "" && !Number.isNaN(Number(price)) && Number(price) >= 0
    )
  ) {
    return false;
  }

  if (form.intermediarySalePrice !== "") {
    const n: number = Number(form.intermediarySalePrice);

    if (Number.isNaN(n) || n < 0) {
      return false;
    }
  }

  return true;
}

export default function TypesPage() {
  const [types, refetchTypes] = useSupabase<ElementType[]>(fetchElementTypes, []);
  const [products] = useSupabase<Product[]>(fetchProducts, []);
  const [form, setForm] = useSessionState<TypeFormFields>("type-form", emptyForm);
  const [editingId, setEditingId] = useSessionState<string | null>("type-editingId", null);
  const formRef = useRef<HTMLDivElement>(null);

  function openEditForm(elementType: ElementType): void {
    setForm(toTypeFormFields(elementType));
    setEditingId(elementType.id);

    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }

  function resetForm(): void {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!isFormValid(form)) {
      return;
    }

    const payload = {
      name: form.name.trim(),
      purchasePrice: displayToCents(form.purchasePrice),
      directSalePrice: displayToCents(form.directSalePrice),
      intermediarySalePrice: form.intermediarySalePrice !== "" ? displayToCents(form.intermediarySalePrice) : 0,
    };

    if (editingId !== null) {
      const existing: ElementType | undefined = types.find(
        (item: ElementType) => item.id === editingId
      );

      if (existing !== undefined) {
        await upsertElementType({ ...existing, ...payload });
      }
    } else {
      const newType: ElementType = createElementType(payload);
      await upsertElementType(newType);
    }

    await refetchTypes();
    resetForm();
  }

  async function handleDelete(id: string): Promise<void> {
    const referencingCount: number = products.filter(
      (product: Product) => product.elementTypeId === id
    ).length;

    if (referencingCount > 0) {
      window.alert(
        `Ce type est utilisé par ${String(referencingCount)} produit(s). Supprimez d'abord les produits associés.`
      );

      return;
    }

    if (!window.confirm("Supprimer ce type ?")) {
      return;
    }

    await deleteElementType(id);
    await refetchTypes();

    if (editingId === id) {
      resetForm();
    }
  }

  function updateField(field: keyof TypeFormFields, value: string): void {
    setForm((previous: TypeFormFields) => ({ ...previous, [field]: value }));
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Types</h1>
      </div>

      <div
        ref={formRef}
        className="mb-8 rounded-lg border border-foreground/10 p-6"
      >
          <h2 className="mb-4 text-sm font-semibold">
            {editingId !== null ? "Modifier le type" : "Nouveau type"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="mb-1 block text-sm text-foreground/70"
              >
                Nom
              </label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/50"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <PriceField
                id="purchasePrice"
                label="Prix d'achat"
                value={form.purchasePrice}
                onChange={(value: string) =>
                  updateField("purchasePrice", value)
                }
              />
              <PriceField
                id="directSalePrice"
                label="Vente directe"
                value={form.directSalePrice}
                onChange={(value: string) =>
                  updateField("directSalePrice", value)
                }
              />
              <PriceField
                id="intermediarySalePrice"
                label="Vente interm. (optionnel)"
                value={form.intermediarySalePrice}
                onChange={(value: string) =>
                  updateField("intermediarySalePrice", value)
                }
                required={false}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={!isFormValid(form)}
                className="btn-primary rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40"
              >
                {editingId !== null ? "Enregistrer" : "Ajouter"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="btn-secondary rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>

      {types.length === 0 ? (
        <p className="py-12 text-center text-sm text-foreground/55">
          Aucun type enregistré.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-foreground/10">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="thead-row border-b border-foreground/10">
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 text-right font-medium">
                  Prix d&apos;achat
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  Vente directe
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  Vente intermédiaire
                </th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map((elementType: ElementType) => (
                <tr
                  key={elementType.id}
                  className="border-b border-foreground/5 last:border-b-0"
                >
                  <td className="px-4 py-3">{elementType.name}</td>
                  <td className="px-4 py-3 text-right font-mono text-foreground/70">
                    {centsToDisplay(elementType.purchasePrice)}&nbsp;&euro;
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-foreground/70">
                    {centsToDisplay(elementType.directSalePrice)}&nbsp;&euro;
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-foreground/70">
                    {centsToDisplay(elementType.intermediarySalePrice)}
                    &nbsp;&euro;
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(elementType)}
                        className="text-foreground/65 transition-colors hover:text-foreground"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" /></svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(elementType.id)}
                        className="btn-danger text-red-500/70 transition-colors hover:text-red-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PriceField({
  id,
  label,
  value,
  onChange,
  required = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-foreground/70">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 pr-8 text-sm text-foreground outline-none focus:border-foreground/50"
          required={required}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-foreground/55">
          &euro;
        </span>
      </div>
    </div>
  );
}
