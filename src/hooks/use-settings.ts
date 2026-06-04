import { useEffect, useState } from 'react';

import { useSQLiteContext } from '@/db';
import { importSpreadsheet } from '@/services/excel-import';
import { exportSettings as doExportSettings, parseSettingsFile } from '@/services/settings-export';
import type { ColumnConfig, GlobalInspectionPoint, Group, ImportResult, InspectionPointConfig, Severity, SettingsImportResult, ToleranceType } from '@/types';

interface ColumnRow {
  key: string;
  label: string;
  visible: number;
  is_numeric: number;
  tolerance_type: string | null;
  tolerance_value: number | null;
  group_name: string | null;
  severity: string;
  instructions: string | null;
  sort_order: number;
}

interface PointRow {
  text: string;
}

interface GroupRow {
  name: string;
  sort_order: number;
}

interface MetaRow {
  key: string;
  value: string;
}

function generateGipKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function useSettings() {
  const db = useSQLiteContext();
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([]);
  const [inspectionPointConfigs, setInspectionPointConfigs] = useState<InspectionPointConfig[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [globalInspectionPoints, setGlobalInspectionPoints] = useState<GlobalInspectionPoint[]>([]);
  const [lastImportDate, setLastImportDate] = useState<string | null>(null);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    await Promise.all([loadColumns(), loadPoints(), loadGroups(), loadGlobalPoints(), loadMeta()]);
  }

  async function loadColumns() {
    const rows = await db.getAllAsync<ColumnRow>(
      'SELECT * FROM column_configs ORDER BY sort_order',
    );
    setColumnConfigs(
      rows.map((r) => ({
        key: r.key,
        label: r.label,
        visible: r.visible === 1,
        isNumeric: r.is_numeric === 1,
        severity: r.severity as Severity,
        group: r.group_name ?? undefined,
        tolerance: (() => {
          if (!r.tolerance_type) return undefined;
          const type = r.tolerance_type as ToleranceType;
          if (type === 'min' || type === 'max') return { type, value: r.tolerance_value };
          return r.tolerance_value != null ? { type, value: r.tolerance_value } : undefined;
        })(),
        instructions: r.instructions ?? undefined,
        sortOrder: r.sort_order,
      })),
    );
  }

  async function loadPoints() {
    const rows = await db.getAllAsync<PointRow>(
      'SELECT * FROM inspection_point_configs ORDER BY text',
    );
    setInspectionPointConfigs(rows.map((r) => ({ text: r.text })));
  }

  async function loadGroups() {
    const rows = await db.getAllAsync<GroupRow>(
      'SELECT name, sort_order FROM groups ORDER BY sort_order',
    );
    setGroups(rows.map((r) => ({ name: r.name, sortOrder: r.sort_order })));
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

  async function loadGlobalPoints() {
    const rows = await db.getAllAsync<ColumnRow>(
      'SELECT * FROM global_inspection_points ORDER BY sort_order',
    );
    setGlobalInspectionPoints(rows.map((r) => ({
      key: r.key,
      label: r.label,
      visible: r.visible === 1,
      isNumeric: r.is_numeric === 1,
      severity: r.severity as Severity,
      group: r.group_name ?? undefined,
      tolerance: (() => {
        if (!r.tolerance_type) return undefined;
        const type = r.tolerance_type as ToleranceType;
        if (type === 'min' || type === 'max') return { type, value: r.tolerance_value };
        return r.tolerance_value != null ? { type, value: r.tolerance_value } : undefined;
      })(),
      instructions: r.instructions ?? undefined,
      sortOrder: r.sort_order,
    })));
  }

  async function addGlobalInspectionPoint(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    let key = generateGipKey(trimmed);
    if (!key) key = 'gip_' + Date.now().toString(36);
    const existing = await db.getFirstAsync<{ key: string }>(
      'SELECT key FROM global_inspection_points WHERE key = ?', [key],
    );
    if (existing) key = key + '_' + Date.now().toString(36).slice(-4);
    const nextOrder = await db.getFirstAsync<{ n: number }>(
      'SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM global_inspection_points',
    );
    await db.runAsync(
      'INSERT INTO global_inspection_points (key, label, sort_order) VALUES (?, ?, ?)',
      [key, trimmed, nextOrder?.n ?? 0],
    );
    await loadGlobalPoints();
  }

  async function deleteGlobalInspectionPoint(key: string) {
    await db.runAsync('DELETE FROM global_inspection_points WHERE key = ?', [key]);
    await loadGlobalPoints();
  }

  async function updateGipVisibility(key: string, visible: boolean) {
    await db.runAsync('UPDATE global_inspection_points SET visible = ? WHERE key = ?', [visible ? 1 : 0, key]);
    await loadGlobalPoints();
  }

  async function updateGipType(key: string, isNumeric: boolean) {
    await db.runAsync('UPDATE global_inspection_points SET is_numeric = ? WHERE key = ?', [isNumeric ? 1 : 0, key]);
    await loadGlobalPoints();
  }

  async function updateGipSeverity(key: string, severity: Severity) {
    await db.runAsync('UPDATE global_inspection_points SET severity = ? WHERE key = ?', [severity, key]);
    await loadGlobalPoints();
  }

  async function updateGipTolerance(key: string, tolerance: { type: ToleranceType; value: number | null } | undefined) {
    if (tolerance) {
      await db.runAsync(
        'UPDATE global_inspection_points SET tolerance_type = ?, tolerance_value = ? WHERE key = ?',
        [tolerance.type, tolerance.value, key],
      );
    } else {
      await db.runAsync(
        'UPDATE global_inspection_points SET tolerance_type = NULL, tolerance_value = NULL WHERE key = ?',
        [key],
      );
    }
    await loadGlobalPoints();
  }

  async function updateGipInstructions(key: string, instructions: string | undefined) {
    await db.runAsync(
      'UPDATE global_inspection_points SET instructions = ? WHERE key = ?',
      [instructions ?? null, key],
    );
    await loadGlobalPoints();
  }

  async function updateGipGroup(key: string, group: string | null) {
    await db.runAsync('UPDATE global_inspection_points SET group_name = ? WHERE key = ?', [group, key]);
    await loadGlobalPoints();
  }

  async function updateColumnVisibility(key: string, visible: boolean) {
    await db.runAsync('UPDATE column_configs SET visible = ? WHERE key = ?', [visible ? 1 : 0, key]);
    await loadColumns();
  }

  async function updateColumnTolerance(
    key: string,
    tolerance: { type: ToleranceType; value: number | null } | undefined,
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

  async function updateColumnSeverity(key: string, severity: Severity) {
    await db.runAsync('UPDATE column_configs SET severity = ? WHERE key = ?', [severity, key]);
    await loadColumns();
  }

  async function updateColumnType(key: string, isNumeric: boolean) {
    await db.runAsync('UPDATE column_configs SET is_numeric = ? WHERE key = ?', [isNumeric ? 1 : 0, key]);
    await loadColumns();
  }

  async function updateColumnInstructions(key: string, instructions: string | undefined) {
    await db.runAsync('UPDATE column_configs SET instructions = ? WHERE key = ?', [instructions ?? null, key]);
    await loadColumns();
  }

  async function updateColumnGroup(key: string, group: string | null) {
    await db.runAsync('UPDATE column_configs SET group_name = ? WHERE key = ?', [group, key]);
    await loadColumns();
  }


  async function addGroup(name: string) {
    await db.runAsync(
      `INSERT OR IGNORE INTO groups (name, sort_order)
       VALUES (?, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM groups))`,
      [name],
    );
    await loadGroups();
  }

  async function deleteGroup(name: string) {
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE column_configs SET group_name = NULL WHERE group_name = ?', [name]);
      await db.runAsync('DELETE FROM groups WHERE name = ?', [name]);
    });
    await Promise.all([loadGroups(), loadColumns()]);
  }

  async function reorderGroup(name: string, direction: 'up' | 'down') {
    const rows = await db.getAllAsync<GroupRow>(
      'SELECT name, sort_order FROM groups ORDER BY sort_order',
    );
    const idx = rows.findIndex((r) => r.name === name);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rows.length) return;
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE groups SET sort_order = ? WHERE name = ?', [
        rows[swapIdx].sort_order,
        rows[idx].name,
      ]);
      await db.runAsync('UPDATE groups SET sort_order = ? WHERE name = ?', [
        rows[idx].sort_order,
        rows[swapIdx].name,
      ]);
    });
    await loadGroups();
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

        // Upsert column configs (preserve user visibility/tolerance/severity/group settings)
        for (const col of data.columnMeta) {
          await db.runAsync(
            `INSERT INTO column_configs (key, label, visible, is_numeric, sort_order)
             VALUES (?, ?, 1, ?, ?)
             ON CONFLICT(key) DO UPDATE SET label = excluded.label, is_numeric = excluded.is_numeric, sort_order = excluded.sort_order`,
            [col.key, col.label, col.isNumeric ? 1 : 0, col.sortOrder],
          );
        }

        // Upsert inspection point configs (preserve existing severity)
        const uniqueTexts = [...new Set(data.inspectionPoints.map((p) => p.pointText))];
        for (const text of uniqueTexts) {
          await db.runAsync(
            `INSERT INTO inspection_point_configs (text, severity) VALUES (?, 'medium')
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

  async function exportSettings() {
    setLoading(true);
    try {
      await doExportSettings(columnConfigs, groups, globalInspectionPoints);
    } finally {
      setLoading(false);
    }
  }

  async function importSettings(fileUri: string): Promise<SettingsImportResult> {
    setLoading(true);
    try {
      const parsed = await parseSettingsFile(fileUri);
      const existingRows = await db.getAllAsync<{ key: string }>('SELECT key FROM column_configs');
      const existingKeys = new Set(existingRows.map((r) => r.key));
      const toApply = parsed.columnSettings.filter((s) => existingKeys.has(s.key));
      const skippedCount = parsed.columnSettings.length - toApply.length;

      await db.withTransactionAsync(async () => {
        for (const s of toApply) {
          await db.runAsync(
            `UPDATE column_configs SET visible=?,is_numeric=?,severity=?,group_name=?,
             tolerance_type=?,tolerance_value=?,instructions=? WHERE key=?`,
            [s.visible ? 1 : 0, s.isNumeric ? 1 : 0, s.severity, s.group,
             s.toleranceType, s.toleranceValue, s.instructions, s.key],
          );
        }
        await db.runAsync('UPDATE column_configs SET group_name = NULL');
        await db.runAsync('DELETE FROM groups');
        for (let i = 0; i < parsed.groups.length; i++) {
          await db.runAsync('INSERT INTO groups (name, sort_order) VALUES (?,?)', [parsed.groups[i], i]);
        }
        for (const s of toApply) {
          if (s.group && parsed.groups.includes(s.group)) {
            await db.runAsync('UPDATE column_configs SET group_name=? WHERE key=?', [s.group, s.key]);
          }
        }

        // Phase 4: Replace global inspection points
        await db.runAsync('DELETE FROM global_inspection_points');
        for (let i = 0; i < parsed.globalInspectionPoints.length; i++) {
          const gip = parsed.globalInspectionPoints[i];
          await db.runAsync(
            `INSERT INTO global_inspection_points
             (key,label,visible,is_numeric,severity,group_name,tolerance_type,tolerance_value,instructions,sort_order)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [gip.key, gip.label, gip.visible?1:0, gip.isNumeric?1:0, gip.severity,
             gip.group ?? null, gip.toleranceType, gip.toleranceValue, gip.instructions, i],
          );
        }
      });

      await loadAll();
      return {
        appliedCount: toApply.length,
        skippedCount,
        groupCount: parsed.groups.length,
        globalInspectionPointCount: parsed.globalInspectionPoints.length,
      };
    } finally {
      setLoading(false);
    }
  }

  return {
    columnConfigs,
    inspectionPointConfigs,
    groups,
    globalInspectionPoints,
    lastImportDate,
    productCount,
    loading,
    updateColumnVisibility,
    updateColumnTolerance,
    updateColumnSeverity,
    updateColumnType,
    updateColumnInstructions,
    updateColumnGroup,
    addGroup,
    deleteGroup,
    reorderGroup,
    importSpreadsheet: doImport,
    exportSettings,
    importSettings,
    addGlobalInspectionPoint,
    deleteGlobalInspectionPoint,
    updateGipVisibility,
    updateGipType,
    updateGipSeverity,
    updateGipTolerance,
    updateGipInstructions,
    updateGipGroup,
  };
}

function uniqueTextsFrom(points: { pointText: string }[]): number {
  return new Set(points.map((p) => p.pointText)).size;
}
