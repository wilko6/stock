CREATE TABLE element_types (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  purchase_price integer NOT NULL,
  direct_sale_price integer NOT NULL,
  intermediary_sale_price integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drawing_models (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  image_data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  element_type_id text NOT NULL REFERENCES element_types(id),
  drawing_model_id text NOT NULL REFERENCES drawing_models(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (element_type_id, drawing_model_id)
);

CREATE TABLE stock (
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location text NOT NULL CHECK (location IN ('Usine', 'Boutique 1', 'Boutique 2', 'Boutique 3')),
  quantity integer NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, location)
);

CREATE TABLE deliveries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source text NOT NULL CHECK (source IN ('Usine', 'Boutique 1', 'Boutique 2', 'Boutique 3')),
  destination text NOT NULL CHECK (destination IN ('Usine', 'Boutique 1', 'Boutique 2', 'Boutique 3')),
  items jsonb NOT NULL,
  total_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source text NOT NULL CHECK (source IN ('Usine', 'Boutique 1', 'Boutique 2', 'Boutique 3')),
  items jsonb NOT NULL,
  total_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_element_type ON products(element_type_id);
CREATE INDEX idx_products_drawing_model ON products(drawing_model_id);
CREATE INDEX idx_stock_product ON stock(product_id);
CREATE INDEX idx_deliveries_created ON deliveries(created_at DESC);
CREATE INDEX idx_payments_created ON payments(created_at DESC);

ALTER TABLE element_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON element_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON drawing_models FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON stock FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON deliveries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON payments FOR ALL USING (true) WITH CHECK (true);
