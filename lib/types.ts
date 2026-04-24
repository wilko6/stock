export interface ElementType {
  id: string;
  name: string;
  purchasePrice: number;
  directSalePrice: number;
  intermediarySalePrice: number;
  createdAt: string;
}

export function createElementType(
  data: Omit<ElementType, "id" | "createdAt">
): ElementType {
  return {
    id: crypto.randomUUID(),
    name: data.name,
    purchasePrice: data.purchasePrice,
    directSalePrice: data.directSalePrice,
    intermediarySalePrice: data.intermediarySalePrice,
    createdAt: new Date().toISOString(),
  };
}

export function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function displayToCents(display: string): number {
  return Math.round(Number(display) * 100);
}

import { SUPABASE_URL } from "@/lib/supabase";

export interface DrawingModel {
  id: string;
  name: string;
  imagePath: string | null;
  createdAt: string;
}

export function createDrawingModel(
  data: Omit<DrawingModel, "id" | "createdAt">
): DrawingModel {
  return {
    id: crypto.randomUUID(),
    name: data.name,
    imagePath: data.imagePath,
    createdAt: new Date().toISOString(),
  };
}

export function drawingModelImageSrc(model: DrawingModel): string {
  if (model.imagePath !== null) {
    return `${SUPABASE_URL}/storage/v1/object/public/drawing-models/${model.imagePath}`;
  }

  return "";
}

export interface Product {
  id: string;
  elementTypeId: string;
  drawingModelId: string;
  minStock: number;
  createdAt: string;
}

export function createProduct(
  data: Omit<Product, "id" | "createdAt" | "minStock"> & { minStock?: number }
): Product {
  return {
    id: crypto.randomUUID(),
    elementTypeId: data.elementTypeId,
    drawingModelId: data.drawingModelId,
    minStock: data.minStock ?? 0,
    createdAt: new Date().toISOString(),
  };
}

export function isSelectableProduct(
  product: Product,
  modelsMap: Map<string, DrawingModel>
): boolean {
  const model: DrawingModel | undefined = modelsMap.get(product.drawingModelId);

  if (model === undefined) {
    return false;
  }

  return model.name.trim().toLowerCase() !== "vierge";
}

export const STORAGE_LOCATIONS = [
  "Stock",
  "Boutique 1",
  "Boutique 2",
  "Boutique 3",
] as const;
export type StorageLocation = (typeof STORAGE_LOCATIONS)[number];
export type Stock = Record<string, Partial<Record<StorageLocation, number>>>;

export type BoutiqueLocation = Exclude<StorageLocation, "Stock">;

export interface TransactionItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  description?: string;
}

export interface Delivery {
  id: string;
  source: StorageLocation;
  destination: StorageLocation;
  items: TransactionItem[];
  totalCents: number;
  createdAt: string;
}

export function createDelivery(
  data: Omit<Delivery, "id" | "createdAt">
): Delivery {
  return {
    id: crypto.randomUUID(),
    source: data.source,
    destination: data.destination,
    items: data.items,
    totalCents: data.totalCents,
    createdAt: new Date().toISOString(),
  };
}

export interface Payment {
  id: string;
  source: StorageLocation;
  items: TransactionItem[];
  totalCents: number;
  createdAt: string;
}

export function createPayment(
  data: Omit<Payment, "id" | "createdAt">
): Payment {
  return {
    id: crypto.randomUUID(),
    source: data.source,
    items: data.items,
    totalCents: data.totalCents,
    createdAt: new Date().toISOString(),
  };
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  orderedAt: string;
  deliveredAt: string | null;
  createdAt: string;
}

export function createOrder(
  data: Omit<Order, "id" | "createdAt" | "orderedAt" | "deliveredAt">
): Order {
  const now: string = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    items: data.items,
    orderedAt: now,
    deliveredAt: null,
    createdAt: now,
  };
}
