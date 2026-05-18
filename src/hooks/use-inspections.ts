import { useEffect, useState } from 'react';

import { useSQLiteContext } from '@/db';
import { deleteInspectionPhotos } from '@/services/photo-service';
import type { Inspection, InspectionResult, InspectionStatus, PointType } from '@/types';

interface InspectionRow {
  id: string;
  date: string;
  units_inspected: number;
  batch_size: number;
  status: string;
}

interface InspectionProductRow {
  product_id: string;
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
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function loadProductIds(db: ReturnType<typeof useSQLiteContext>, inspectionId: string): Promise<string[]> {
  const rows = await db.getAllAsync<InspectionProductRow>(
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

  async function getResults(inspectionId: string): Promise<InspectionResult[]> {
    const rows = await db.getAllAsync<ResultRow>(
      'SELECT * FROM inspection_results WHERE inspection_id = ?',
      [inspectionId],
    );
    return rows.map(mapResultRow);
  }

  async function createInspection(data: {
    productIds: string[];
    unitsInspected: number;
    batchSize: number;
  }): Promise<string> {
    const id = generateId();
    const date = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT INTO inspections (id, date, units_inspected, batch_size, status) VALUES (?, ?, ?, ?, ?)',
        [id, date, data.unitsInspected, data.batchSize, 'in_progress'],
      );
      for (const productId of data.productIds) {
        await db.runAsync(
          'INSERT INTO inspection_products (inspection_id, product_id) VALUES (?, ?)',
          [id, productId],
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
         (id, inspection_id, product_id, point_key, type, value, passed, note, photo_uris)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(inspection_id, product_id, point_key) DO UPDATE SET
         value = excluded.value,
         passed = excluded.passed,
         note = excluded.note,
         photo_uris = excluded.photo_uris`,
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
      ],
    );
  }

  async function completeInspection(id: string): Promise<void> {
    await db.runAsync("UPDATE inspections SET status = 'completed' WHERE id = ?", [id]);
    await loadInspections();
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
    getResults,
    createInspection,
    upsertResult,
    completeInspection,
    deleteInspection,
  };
}
