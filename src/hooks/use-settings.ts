import { useEffect, useState } from 'react';

import { useSQLiteContext } from '@/db';
import { importSpreadsheet } from '@/services/excel-import';
import type { ColumnConfig, ImportResult, InspectionPointConfig, Severity, ToleranceType } from '@/types';

interface ColumnRow {
  key: string;
  label: string;
  visible: number;
  is_numeric: number;
  tolerance_type: string | null;
  tolerance_value: number | null;
}

interface PointRow {
  text: string;
  severity: string;
}

interface MetaRow {
  key: string;
  value: string;
}

export function useSettings() {
  const db = useSQLiteContext();
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([]);
  const [inspectionPointConfigs, setInspectionPointConfigs] = useState<InspectionPointConfig[]>([]);
  const [lastImportDate, setLastImportDate] = useState<string | null>(null);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    await Promise.all([loadColumns(), loadPoints(), loadMeta()]);
  }

  async function loadColumns() {
    const rows = await db.getAllAsync<ColumnRow>(
      'SELECT * FROM column_configs ORDER BY label',
    );
    setColumnConfigs(
      rows.map((r) => ({
        key: r.key,
        label: r.label,
        visible: r.visible === 1,
        isNumeric: r.is_numeric === 1,
        tolerance:
          r.tolerance_type && r.tolerance_value != null
            ? { type: r.tolerance_type as ToleranceType, value: r.tolerance_value }
            : undefined,
      })),
    );
  }

  async function loadPoints() {
    const rows = await db.getAllAsync<PointRow>(
      'SELECT * FROM inspection_point_configs ORDER BY text',
    );
    setInspectionPointConfigs(
      rows.map((r) => ({ text: r.text, severity: r.severity as Severity })),
    );
  }

  async function loadMeta() {
    const row = await db.getFirstAsync<MetaRow>(
      "SELECT value FROM app_meta WHERE key = 'last_import_date'",
    );
    setLastImportDate(row?.value ?? null);
    const countRow = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM products',
    );
    setProductCount(countRow?.count ?? 0);
  }

  async function updateColumnVisibility(key: string, visible: boolean) {
    await db.runAsync('UPDATE column_configs SET visible = ? WHERE key = ?', [visible ? 1 : 0, key]);
    await loadColumns();
  }

  async function updateColumnTolerance(
    key: string,
    tolerance: { type: ToleranceType; value: number } | undefined,
  ) {
    if (tolerance) {
      await db.runAsync(
        'UPDATE column_configs SET tolerance_type = ?, tolerance_value = ? WHERE key = ?',
        [tolerance.type, tolerance.value, key],
      );
    } else {
      await db.runAsync(
        'UPDATE column_configs SET tolerance_type = NULL, tolerance_value = NULL WHERE key = ?',
        [key],
      );
    }
    await loadColumns();
  }

  async function updateSeverity(text: string, severity: Severity) {
    await db.runAsync('UPDATE inspection_point_configs SET severity = ? WHERE text = ?', [
      severity,
      text,
    ]);
    await loadPoints();
  }

  async function doImport(fileUri: string): Promise<ImportResult> {
    setLoading(true);
    try {
      const data = await importSpreadsheet(fileUri);
      const importDate = new Date().toISOString();

      await db.withTransactionAsync(async () => {
        // Replace products
        await db.runAsync('DELETE FROM products');
        for (const p of data.products) {
          await db.runAsync(
            'INSERT INTO products (id, name, attributes) VALUES (?, ?, ?)',
            [p.id, p.name, JSON.stringify(p.attributes)],
          );
        }

        // Replace product inspection points
        await db.runAsync('DELETE FROM product_inspection_points');
        for (const pip of data.inspectionPoints) {
          await db.runAsync(
            'INSERT INTO product_inspection_points (product_id, point_index, point_text) VALUES (?, ?, ?)',
            [pip.productId, pip.pointIndex, pip.pointText],
          );
        }

        // Upsert column configs (preserve user visibility/tolerance settings)
        for (const col of data.columnMeta) {
          await db.runAsync(
            `INSERT INTO column_configs (key, label, visible, is_numeric)
             VALUES (?, ?, 1, ?)
             ON CONFLICT(key) DO UPDATE SET label = excluded.label, is_numeric = excluded.is_numeric`,
            [col.key, col.label, col.isNumeric ? 1 : 0],
          );
        }

        // Upsert inspection point configs (preserve existing severity)
        const uniqueTexts = [...new Set(data.inspectionPoints.map((p) => p.pointText))];
        for (const text of uniqueTexts) {
          await db.runAsync(
            `INSERT INTO inspection_point_configs (text, severity) VALUES (?, 'minor')
             ON CONFLICT(text) DO NOTHING`,
            [text],
          );
        }

        // Save meta
        await db.runAsync(
          `INSERT INTO app_meta (key, value) VALUES ('last_import_date', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [importDate],
        );
      });

      await loadAll();

      return {
        productCount: data.products.length,
        columnCount: data.columnMeta.length,
        inspectionPointCount: uniqueTextsFrom(data.inspectionPoints),
        importDate,
      };
    } finally {
      setLoading(false);
    }
  }

  return {
    columnConfigs,
    inspectionPointConfigs,
    lastImportDate,
    productCount,
    loading,
    updateColumnVisibility,
    updateColumnTolerance,
    updateSeverity,
    importSpreadsheet: doImport,
  };
}

function uniqueTextsFrom(points: { pointText: string }[]): number {
  return new Set(points.map((p) => p.pointText)).size;
}
