import { supabase } from "@/lib/supabase";
import {
  type ElementType,
  type DrawingModel,
  type Product,
  type Stock,
  type StorageLocation,
  type Delivery,
  type Payment,
  type Order,
} from "@/lib/types";

// --- Element Types ---

interface ElementTypeRow {
  id: string;
  name: string;
  purchase_price: number;
  direct_sale_price: number;
  intermediary_sale_price: number;
  created_at: string;
}

function elementTypeFromRow(row: ElementTypeRow): ElementType {
  return {
    id: row.id,
    name: row.name,
    purchasePrice: row.purchase_price,
    directSalePrice: row.direct_sale_price,
    intermediarySalePrice: row.intermediary_sale_price,
    createdAt: row.created_at,
  };
}

function elementTypeToRow(
  data: ElementType
): Omit<ElementTypeRow, "created_at"> {
  return {
    id: data.id,
    name: data.name,
    purchase_price: data.purchasePrice,
    direct_sale_price: data.directSalePrice,
    intermediary_sale_price: data.intermediarySalePrice,
  };
}

export async function fetchElementTypes(): Promise<ElementType[]> {
  const { data, error } = await supabase
    .from("element_types")
    .select()
    .order("created_at");

  if (error) throw error;

  return (data as ElementTypeRow[]).map(elementTypeFromRow);
}

export async function upsertElementType(data: ElementType): Promise<void> {
  const { error } = await supabase
    .from("element_types")
    .upsert(elementTypeToRow(data));

  if (error) throw error;
}

export async function deleteElementType(id: string): Promise<void> {
  const { error } = await supabase
    .from("element_types")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// --- Drawing Models ---

interface DrawingModelRow {
  id: string;
  name: string;
  image_path: string | null;
  created_at: string;
}

function drawingModelFromRow(row: DrawingModelRow): DrawingModel {
  return {
    id: row.id,
    name: row.name,
    imagePath: row.image_path,
    createdAt: row.created_at,
  };
}

function drawingModelToRow(
  data: DrawingModel
): Omit<DrawingModelRow, "created_at"> {
  return {
    id: data.id,
    name: data.name,
    image_path: data.imagePath,
  };
}

const DRAWING_IMAGES_BUCKET: string = "drawing-models";

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return "jpg";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "png";
}

export async function uploadDrawingImage(
  file: Blob,
  modelId: string
): Promise<string> {
  const ext: string = extensionForMimeType(file.type);
  const path: string = `${modelId}.${ext}`;

  const { error } = await supabase.storage
    .from(DRAWING_IMAGES_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw error;

  return path;
}

export async function deleteDrawingImage(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from(DRAWING_IMAGES_BUCKET)
    .remove([path]);

  if (error) throw error;
}

export async function fetchDrawingModels(): Promise<DrawingModel[]> {
  const { data, error } = await supabase
    .from("drawing_models")
    .select()
    .order("created_at");

  if (error) throw error;

  return (data as DrawingModelRow[]).map(drawingModelFromRow);
}

export async function upsertDrawingModel(data: DrawingModel): Promise<void> {
  const { error } = await supabase
    .from("drawing_models")
    .upsert(drawingModelToRow(data));

  if (error) throw error;
}

export async function deleteDrawingModel(id: string): Promise<void> {
  const { data, error: selectError } = await supabase
    .from("drawing_models")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();

  if (selectError) throw selectError;

  const imagePath: string | null =
    (data as { image_path: string | null } | null)?.image_path ?? null;

  const { error } = await supabase
    .from("drawing_models")
    .delete()
    .eq("id", id);

  if (error) throw error;

  if (imagePath !== null) {
    try {
      await deleteDrawingImage(imagePath);
    } catch {
      // Best-effort cleanup — swallow storage errors
    }
  }
}

// --- Products ---

interface ProductRow {
  id: string;
  element_type_id: string;
  drawing_model_id: string;
  min_stock: number;
  created_at: string;
}

function productFromRow(row: ProductRow): Product {
  return {
    id: row.id,
    elementTypeId: row.element_type_id,
    drawingModelId: row.drawing_model_id,
    minStock: row.min_stock ?? 0,
    createdAt: row.created_at,
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select()
    .order("created_at");

  if (error) throw error;

  return (data as ProductRow[]).map(productFromRow);
}

export async function insertProduct(data: Product): Promise<void> {
  const { error } = await supabase.from("products").insert({
    id: data.id,
    element_type_id: data.elementTypeId,
    drawing_model_id: data.drawingModelId,
    min_stock: data.minStock,
  });

  if (error) throw error;
}

export async function updateProduct(
  id: string,
  data: { elementTypeId: string; drawingModelId: string; minStock: number }
): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({
      element_type_id: data.elementTypeId,
      drawing_model_id: data.drawingModelId,
      min_stock: data.minStock,
    })
    .eq("id", id);

  if (error) throw error;
}

export async function setProductMinStock(
  id: string,
  minStock: number
): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ min_stock: minStock })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) throw error;
}

// --- Stock ---

interface StockRow {
  product_id: string;
  location: StorageLocation;
  quantity: number;
}

export async function fetchStock(): Promise<Stock> {
  const { data, error } = await supabase.from("stock").select();

  if (error) throw error;

  const stock: Stock = {};

  for (const row of data as StockRow[]) {
    if (stock[row.product_id] === undefined) {
      stock[row.product_id] = {};
    }
    stock[row.product_id][row.location] = row.quantity;
  }

  return stock;
}

export async function setStockQuantity(
  productId: string,
  location: StorageLocation,
  quantity: number
): Promise<void> {
  const { error } = await supabase.from("stock").upsert({
    product_id: productId,
    location,
    quantity,
  });

  if (error) throw error;
}

export async function applyStockDeltas(
  deltas: {
    productId: string;
    location: StorageLocation;
    delta: number;
  }[]
): Promise<void> {
  for (const entry of deltas) {
    const { data, error: fetchError } = await supabase
      .from("stock")
      .select("quantity")
      .eq("product_id", entry.productId)
      .eq("location", entry.location)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const current: number = (data as { quantity: number } | null)?.quantity ?? 0;

    const { error: upsertError } = await supabase.from("stock").upsert({
      product_id: entry.productId,
      location: entry.location,
      quantity: current + entry.delta,
    });

    if (upsertError) throw upsertError;
  }
}

// --- Deliveries ---

interface DeliveryRow {
  id: string;
  source: StorageLocation;
  destination: StorageLocation;
  items: Delivery["items"];
  total_cents: number;
  created_at: string;
}

function deliveryFromRow(row: DeliveryRow): Delivery {
  return {
    id: row.id,
    source: row.source,
    destination: row.destination,
    items: row.items,
    totalCents: row.total_cents,
    createdAt: row.created_at,
  };
}

export async function fetchDeliveries(): Promise<Delivery[]> {
  const { data, error } = await supabase
    .from("deliveries")
    .select()
    .order("created_at");

  if (error) throw error;

  return (data as DeliveryRow[]).map(deliveryFromRow);
}

export async function insertDelivery(data: Delivery): Promise<void> {
  const { error } = await supabase.from("deliveries").insert({
    id: data.id,
    source: data.source,
    destination: data.destination,
    items: data.items,
    total_cents: data.totalCents,
  });

  if (error) throw error;
}

export async function updateDeliveryDate(
  id: string,
  createdAt: string
): Promise<void> {
  const { error } = await supabase
    .from("deliveries")
    .update({ created_at: createdAt })
    .eq("id", id);

  if (error) throw error;
}

export async function updateDelivery(data: Delivery): Promise<void> {
  const { error } = await supabase
    .from("deliveries")
    .update({
      source: data.source,
      destination: data.destination,
      items: data.items,
      total_cents: data.totalCents,
    })
    .eq("id", data.id);

  if (error) throw error;
}

export async function deleteDelivery(id: string): Promise<void> {
  const { error } = await supabase.from("deliveries").delete().eq("id", id);

  if (error) throw error;
}

// --- Payments ---

interface PaymentRow {
  id: string;
  source: StorageLocation;
  items: Payment["items"];
  total_cents: number;
  created_at: string;
}

function paymentFromRow(row: PaymentRow): Payment {
  return {
    id: row.id,
    source: row.source,
    items: row.items,
    totalCents: row.total_cents,
    createdAt: row.created_at,
  };
}

export async function fetchPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select()
    .order("created_at");

  if (error) throw error;

  return (data as PaymentRow[]).map(paymentFromRow);
}

export async function insertPayment(data: Payment): Promise<void> {
  const { error } = await supabase.from("payments").insert({
    id: data.id,
    source: data.source,
    items: data.items,
    total_cents: data.totalCents,
  });

  if (error) throw error;
}

export async function updatePaymentDate(
  id: string,
  createdAt: string
): Promise<void> {
  const { error } = await supabase
    .from("payments")
    .update({ created_at: createdAt })
    .eq("id", id);

  if (error) throw error;
}

export async function updatePayment(data: Payment): Promise<void> {
  const { error } = await supabase
    .from("payments")
    .update({
      source: data.source,
      items: data.items,
      total_cents: data.totalCents,
    })
    .eq("id", data.id);

  if (error) throw error;
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from("payments").delete().eq("id", id);

  if (error) throw error;
}

// --- Orders ---

interface OrderRow {
  id: string;
  items: Order["items"];
  ordered_at: string;
  delivered_at: string | null;
  created_at: string;
}

function orderFromRow(row: OrderRow): Order {
  return {
    id: row.id,
    items: row.items,
    orderedAt: row.ordered_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
  };
}

export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select()
    .order("ordered_at", { ascending: false });

  if (error) throw error;

  return (data as OrderRow[]).map(orderFromRow);
}

export async function insertOrder(data: Order): Promise<void> {
  const { error } = await supabase.from("orders").insert({
    id: data.id,
    items: data.items,
    ordered_at: data.orderedAt,
    delivered_at: data.deliveredAt,
  });

  if (error) throw error;
}

export async function updateOrderDelivered(
  id: string,
  deliveredAt: string
): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({ delivered_at: deliveredAt })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteOrder(id: string): Promise<void> {
  const { error } = await supabase.from("orders").delete().eq("id", id);

  if (error) throw error;
}
