import { useEffect, useState } from 'react';

import { useSQLiteContext } from '@/db';
import { deleteInspectionPhotos } from '@/services/photo-service';
import type { Inspection, InspectionProduct, InspectionResult, InspectionStatus, PointType } from '@/types';

interface InspectionRow {
  id: string;
  date: string;
  units_inspected: number;
  batch_size: number;
  status: string;
  supplier: string | null;
  location: string | null;
  invoice_no: string | null;
  inspector_name: string | null;
  report_type: string;
}

interface InspectionProductRow {
  product_id: string;
  units_inspected: number;
  batch_size: number;
  production_status: number | null;
  packing_status: number | null;
}

interface ResultRow {
  id: string;
  inspection_id: string;
  product_id: string;
  point_key: string;
  type: string;
  value: string | null;
  passed: number;
  note: string | null;
  photo_uris: string;
  video_uris: string;
  sample_size: string | null;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function loadProductIds(db: ReturnType<typeof useSQLiteContext>, inspectionId: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ product_id: string }>(
    'SELECT product_id FROM inspection_products WHERE inspection_id = ?',
    [inspectionId],
  );
  return rows.map((r) => r.product_id);
}

function mapRow(r: InspectionRow, productIds: string[]): Inspection {
  return {
    id: r.id,
    date: r.date,
    productIds,
    unitsInspected: r.units_inspected,
    batchSize: r.batch_size,
    status: r.status as InspectionStatus,
    supplier: r.supplier ?? undefined,
    location: r.location ?? undefined,
    invoiceNo: r.invoice_no ?? undefined,
    inspectorName: r.inspector_name ?? undefined,
    reportType: (r.report_type as 'normal' | 'nested') ?? 'normal',
  };
}

function mapResultRow(r: ResultRow): InspectionResult {
  return {
    id: r.id,
    inspectionId: r.inspection_id,
    productId: r.product_id,
    pointKey: r.point_key,
    type: r.type as PointType,
    value: r.value ?? undefined,
    passed: r.passed === 1,
    note: r.note ?? undefined,
    photoUris: JSON.parse(r.photo_uris || '[]'),
    videoUris: JSON.parse(r.video_uris || '[]'),
    sampleSize: r.sample_size ?? undefined,
  };
}

export function useInspections() {
  const db = useSQLiteContext();
  const [inspections, setInspections] = useState<Inspection[]>([]);

  useEffect(() => {
    loadInspections();
  }, []);

  async function loadInspections() {
    const rows = await db.getAllAsync<InspectionRow>(
      'SELECT * FROM inspections ORDER BY date DESC',
    );
    const result: Inspection[] = [];
    for (const row of rows) {
      const productIds = await loadProductIds(db, row.id);
      result.push(mapRow(row, productIds));
    }
    setInspections(result);
  }

  async function getInspection(id: string): Promise<Inspection | null> {
    const row = await db.getFirstAsync<InspectionRow>(
      'SELECT * FROM inspections WHERE id = ?',
      [id],
    );
    if (!row) return null;
    const productIds = await loadProductIds(db, id);
    return mapRow(row, productIds);
  }

  async function getInspectionProduct(inspectionId: string, productId: string): Promise<InspectionProduct | null> {
    const row = await db.getFirstAsync<InspectionProductRow>(
      'SELECT product_id, units_inspected, batch_size, production_status, packing_status FROM inspection_products WHERE inspection_id = ? AND product_id = ?',
      [inspectionId, productId],
    );
    if (!row) return null;
    return {
      inspectionId,
      productId: row.product_id,
      unitsInspected: row.units_inspected,
      batchSize: row.batch_size,
      productionStatus: row.production_status ?? undefined,
      packingStatus: row.packing_status ?? undefined,
    };
  }

  async function getResults(inspectionId: string): Promise<InspectionResult[]> {
    const rows = await db.getAllAsync<ResultRow>(
      'SELECT * FROM inspection_results WHERE inspection_id = ?',
      [inspectionId],
    );
    return rows.map(mapResultRow);
  }

  async function createInspection(data: {
    productIds: string[];
    supplier?: string;
    location?: string;
    invoiceNo?: string;
    inspectorName?: string;
    reportType?: 'normal' | 'nested';
    productUnits: Map<string, { unitsInspected: number; batchSize: number; productionStatus?: number; packingStatus?: number }>;
  }): Promise<string> {
    const id = generateId();
    const date = new Date().toISOString();
    const totalUnits = data.productIds.reduce((s, pid) => s + (data.productUnits.get(pid)?.unitsInspected ?? 1), 0);
    const totalBatch = data.productIds.reduce((s, pid) => s + (data.productUnits.get(pid)?.batchSize ?? 1), 0);
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT INTO inspections (id, date, units_inspected, batch_size, status, supplier, location, invoice_no, inspector_name, report_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, date, totalUnits, totalBatch, 'in_progress', data.supplier ?? null, data.location ?? null, data.invoiceNo ?? null, data.inspectorName ?? null, data.reportType ?? 'normal'],
      );
      for (const productId of data.productIds) {
        const units = data.productUnits.get(productId) ?? { unitsInspected: 1, batchSize: 1 };
        await db.runAsync(
          'INSERT INTO inspection_products (inspection_id, product_id, units_inspected, batch_size, production_status, packing_status) VALUES (?, ?, ?, ?, ?, ?)',
          [id, productId, units.unitsInspected, units.batchSize, units.productionStatus ?? null, units.packingStatus ?? null],
        );
      }
    });
    await loadInspections();
    return id;
  }

  async function upsertResult(result: Omit<InspectionResult, 'id'>): Promise<void> {
    const id = generateId();
    await db.runAsync(
      `INSERT INTO inspection_results
         (id, inspection_id, product_id, point_key, type, value, passed, note, photo_uris, video_uris, sample_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(inspection_id, product_id, point_key) DO UPDATE SET
         value = excluded.value,
         passed = excluded.passed,
         note = excluded.note,
         photo_uris = excluded.photo_uris,
         video_uris = excluded.video_uris,
         sample_size = excluded.sample_size`,
      [
        id,
        result.inspectionId,
        result.productId,
        result.pointKey,
        result.type,
        result.value != null ? String(result.value) : null,
        result.passed ? 1 : 0,
        result.note ?? null,
        JSON.stringify(result.photoUris),
        JSON.stringify(result.videoUris),
        result.sampleSize ?? null,
      ],
    );
  }

  async function completeInspection(id: string): Promise<void> {
    await db.runAsync("UPDATE inspections SET status = 'completed' WHERE id = ?", [id]);
    await loadInspections();
  }

  async function deleteResult(inspectionId: string, productId: string, pointKey: string): Promise<void> {
    await db.runAsync(
      'DELETE FROM inspection_results WHERE inspection_id = ? AND product_id = ? AND point_key = ?',
      [inspectionId, productId, pointKey],
    );
  }

  async function deleteInspection(id: string): Promise<void> {
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM inspection_results WHERE inspection_id = ?', [id]);
      await db.runAsync('DELETE FROM inspection_products WHERE inspection_id = ?', [id]);
      await db.runAsync('DELETE FROM inspections WHERE id = ?', [id]);
    });
    deleteInspectionPhotos(id);
    await loadInspections();
  }

  return {
    inspections,
    reload: loadInspections,
    getInspection,
    getInspectionProduct,
    getResults,
    createInspection,
    upsertResult,
    deleteResult,
    completeInspection,
    deleteInspection,
  };
}
