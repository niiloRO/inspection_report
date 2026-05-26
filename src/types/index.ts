export type Severity = 'high' | 'medium' | 'low';
export type InspectionStatus = 'in_progress' | 'completed';
export type PointType = 'attribute' | 'inspection_point' | 'global_inspection_point';
export type ToleranceType = 'absolute' | 'percent';

export interface Product {
  id: string;
  name: string;
  attributes: Record<string, string | number>;
}

export interface Group {
  name: string;
  sortOrder: number;
}

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  isNumeric: boolean;
  severity: Severity;
  group?: string;
  tolerance?: { type: ToleranceType; value: number };
  instructions?: string;
  sortOrder: number;
}

export type GlobalInspectionPoint = ColumnConfig;

export interface InspectionPointConfig {
  text: string;
}

export interface ProductInspectionPoint {
  productId: string;
  pointIndex: number;
  pointText: string;
}

export interface Inspection {
  id: string;
  date: string;
  productIds: string[];
  unitsInspected: number;
  batchSize: number;
  status: InspectionStatus;
  supplier?: string;
  location?: string;
  invoiceNo?: string;
}

export interface InspectionProduct {
  inspectionId: string;
  productId: string;
  unitsInspected: number;
  batchSize: number;
  productionStatus?: number;
  packingStatus?: number;
}

export interface InspectionResult {
  id: string;
  inspectionId: string;
  productId: string;
  pointKey: string;
  type: PointType;
  value?: string | number;
  passed: boolean;
  note?: string;
  photoUris: string[];
  sampleSize?: string;
}

export interface ParsedExcelData {
  products: Product[];
  columnMeta: ColumnMeta[];
  inspectionPoints: ProductInspectionPoint[];
}

export interface ColumnMeta {
  key: string;
  label: string;
  isNumeric: boolean;
  sortOrder: number;
}

export interface ImportResult {
  productCount: number;
  columnCount: number;
  inspectionPointCount: number;
  importDate: string;
}

export interface ParsedColumnSetting {
  key: string;
  label: string;
  visible: boolean;
  isNumeric: boolean;
  severity: Severity;
  group: string | null;
  toleranceType: ToleranceType | null;
  toleranceValue: number | null;
  instructions: string | null;
}

export interface ParsedSettingsData {
  columnSettings: ParsedColumnSetting[];
  groups: string[];
  globalInspectionPoints: ParsedColumnSetting[];
}

export interface SettingsImportResult {
  appliedCount: number;
  skippedCount: number;
  groupCount: number;
  globalInspectionPointCount: number;
}
