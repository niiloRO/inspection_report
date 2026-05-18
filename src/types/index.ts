export type Severity = 'critical' | 'major' | 'minor';
export type InspectionStatus = 'in_progress' | 'completed';
export type PointType = 'attribute' | 'inspection_point';
export type ToleranceType = 'absolute' | 'percent';

export interface Product {
  id: string;
  name: string;
  attributes: Record<string, string | number>;
}

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  isNumeric: boolean;
  tolerance?: { type: ToleranceType; value: number };
}

export interface InspectionPointConfig {
  text: string;
  severity: Severity;
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
}

export interface ImportResult {
  productCount: number;
  columnCount: number;
  inspectionPointCount: number;
  importDate: string;
}
