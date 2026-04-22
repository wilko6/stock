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

export interface DrawingModel {
  id: string;
  name: string;
  imageData: string;
  createdAt: string;
}

export function createDrawingModel(
  data: Omit<DrawingModel, "id" | "createdAt">
): DrawingModel {
  return {
    id: crypto.randomUUID(),
    name: data.name,
    imageData: data.imageData,
    createdAt: new Date().toISOString(),
  };
}

export interface Product {
  id: string;
  elementTypeId: string;
  drawingModelId: string;
  createdAt: string;
}

export function createProduct(
  data: Omit<Product, "id" | "createdAt">
): Product {
  return {
    id: crypto.randomUUID(),
    elementTypeId: data.elementTypeId,
    drawingModelId: data.drawingModelId,
    createdAt: new Date().toISOString(),
  };
}

export const STORAGE_LOCATIONS = [
  "Usine",
  "Boutique 1",
  "Boutique 2",
  "Boutique 3",
] as const;
export type StorageLocation = (typeof STORAGE_LOCATIONS)[number];
export type Stock = Record<string, Partial<Record<StorageLocation, number>>>;

export type BoutiqueLocation = Exclude<StorageLocation, "Usine">;

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
