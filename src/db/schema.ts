export const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  attributes TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS column_configs (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  is_numeric INTEGER NOT NULL DEFAULT 0,
  tolerance_type TEXT,
  tolerance_value REAL,
  group_name TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  instructions TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inspection_point_configs (
  text TEXT PRIMARY KEY,
  severity TEXT NOT NULL DEFAULT 'medium'
);

CREATE TABLE IF NOT EXISTS groups (
  name TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_inspection_points (
  product_id TEXT NOT NULL,
  point_index INTEGER NOT NULL,
  point_text TEXT NOT NULL,
  PRIMARY KEY (product_id, point_index)
);

CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  units_inspected INTEGER NOT NULL DEFAULT 1,
  batch_size INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'in_progress',
  supplier TEXT,
  location TEXT,
  invoice_no TEXT
);

CREATE TABLE IF NOT EXISTS inspection_products (
  inspection_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  units_inspected INTEGER NOT NULL DEFAULT 1,
  batch_size INTEGER NOT NULL DEFAULT 1,
  production_status REAL,
  packing_status REAL,
  PRIMARY KEY (inspection_id, product_id)
);

CREATE TABLE IF NOT EXISTS inspection_results (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  point_key TEXT NOT NULL,
  type TEXT NOT NULL,
  value TEXT,
  passed INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  photo_uris TEXT NOT NULL DEFAULT '[]',
  sample_size TEXT,
  UNIQUE (inspection_id, product_id, point_key)
);

CREATE TABLE IF NOT EXISTS global_inspection_points (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  is_numeric INTEGER NOT NULL DEFAULT 0,
  tolerance_type TEXT,
  tolerance_value REAL,
  group_name TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  instructions TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
