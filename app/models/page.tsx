"use client";

import { useState, useRef, type FormEvent, type DragEvent } from "react";
import { useSessionState } from "@/lib/use-session-state";
import { useSupabase } from "@/lib/use-supabase";
import {
  fetchDrawingModels,
  upsertDrawingModel,
  deleteDrawingModel,
  fetchProducts,
} from "@/lib/db";
import {
  type DrawingModel,
  type Product,
  createDrawingModel,
} from "@/lib/types";
import { compressImage } from "@/lib/image";

interface ModelFormFields {
  name: string;
  imageData: string;
}

const emptyForm: ModelFormFields = {
  name: "",
  imageData: "",
};

function toModelFormFields(model: DrawingModel): ModelFormFields {
  return {
    name: model.name,
    imageData: model.imageData,
  };
}

function isFormValid(form: ModelFormFields): boolean {
  return form.name.trim() !== "" && form.imageData !== "";
}

export default function ModelsPage() {
  const [models, refetchModels] = useSupabase<DrawingModel[]>(fetchDrawingModels, []);
  const [products] = useSupabase<Product[]>(fetchProducts, []);
  const [form, setForm] = useSessionState<ModelFormFields>("model-form", emptyForm);
  const [editingId, setEditingId] = useSessionState<string | null>("model-editingId", null);
  const formRef = useRef<HTMLDivElement>(null);

  function openEditForm(model: DrawingModel): void {
    setForm(toModelFormFields(model));
    setEditingId(model.id);

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
      imageData: form.imageData,
    };

    if (editingId !== null) {
      const existing: DrawingModel | undefined = models.find(
        (item: DrawingModel) => item.id === editingId
      );

      if (existing !== undefined) {
        await upsertDrawingModel({ ...existing, ...payload });
      }
    } else {
      const newModel: DrawingModel = createDrawingModel(payload);
      await upsertDrawingModel(newModel);
    }

    await refetchModels();
    resetForm();
  }

  async function handleDelete(id: string): Promise<void> {
    const referencingCount: number = products.filter(
      (product: Product) => product.drawingModelId === id
    ).length;

    if (referencingCount > 0) {
      window.alert(
        `Ce modèle est utilisé par ${String(referencingCount)} produit(s). Supprimez d'abord les produits associés.`
      );

      return;
    }

    if (!window.confirm("Supprimer ce modèle ?")) {
      return;
    }

    await deleteDrawingModel(id);
    await refetchModels();

    if (editingId === id) {
      resetForm();
    }
  }

  function updateField(field: keyof ModelFormFields, value: string): void {
    setForm((previous: ModelFormFields) => ({ ...previous, [field]: value }));
  }

  async function handleImageFile(file: File): Promise<void> {
    const compressed: string = await compressImage(file);
    updateField("imageData", compressed);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Modèles</h1>
      </div>

      <div
        ref={formRef}
        className="mb-8 rounded-lg border border-foreground/10 p-6"
      >
          <h2 className="mb-4 text-sm font-semibold">
            {editingId !== null ? "Modifier le modèle" : "Nouveau modèle"}
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

            <ImageDropZone
              imageData={form.imageData}
              onFile={handleImageFile}
            />

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

      {models.length === 0 ? (
        <p className="py-12 text-center text-sm text-foreground/55">
          Aucun modèle enregistré.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {models.map((model: DrawingModel) => (
            <div
              key={model.id}
              className="rounded-lg border border-foreground/10 p-3"
            >
              <div className="aspect-square overflow-hidden rounded-md">
                <img
                  src={model.imageData}
                  alt={model.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <p className="mt-2 text-sm font-medium">{model.name}</p>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => openEditForm(model)}
                  className="text-sm text-foreground/65 transition-colors hover:text-foreground"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(model.id)}
                  className="btn-danger text-sm text-red-500/70 transition-colors hover:text-red-500"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageDropZone({
  imageData,
  onFile,
}: {
  imageData: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  function handleClick(): void {
    inputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file: File | undefined = event.target.files?.[0];

    if (file !== undefined) {
      onFile(file);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(): void {
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragging(false);

    const file: File | undefined = event.dataTransfer.files[0];

    if (file !== undefined) {
      onFile(file);
    }
  }

  if (imageData !== "") {
    return (
      <div>
        <label className="mb-1 block text-sm text-foreground/70">Image</label>
        <div className="flex h-[200px] items-center justify-center overflow-hidden rounded-lg border border-foreground/10">
          <img
            src={imageData}
            alt="Aperçu"
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <button
          type="button"
          onClick={handleClick}
          className="mt-1 text-sm text-foreground/65 transition-colors hover:text-foreground"
        >
          Changer
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1 block text-sm text-foreground/70">Image</label>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            handleClick();
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex h-[200px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
          isDragging
            ? "border-foreground/40 bg-foreground/5"
            : "border-foreground/20"
        }`}
      >
        <p className="text-sm text-foreground/55">
          Cliquer ou glisser une image
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
