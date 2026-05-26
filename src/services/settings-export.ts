import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import type { ColumnConfig, GlobalInspectionPoint, Group, ParsedColumnSetting, ParsedSettingsData } from '@/types';

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function exportSettings(columnConfigs: ColumnConfig[], groups: Group[], globalInspectionPoints: GlobalInspectionPoint[] = []): Promise<void> {
  const sheet1: (string | number)[][] = [
    ['Key', 'Label', 'Enabled', 'Type', 'Criticality', 'Group', 'Tolerance Type', 'Tolerance Value', 'Instructions'],
  ];

  for (const col of columnConfigs) {
    sheet1.push([
      col.key,
      col.label,
      col.visible ? 'Yes' : 'No',
      col.isNumeric ? 'Numeric' : 'Text',
      cap(col.severity),
      col.group ?? '',
      col.isNumeric && col.tolerance ? cap(col.tolerance.type) : '',
      col.isNumeric && col.tolerance ? col.tolerance.value : '',
      col.instructions ?? '',
    ]);
  }

  const sheet2: string[][] = [
    ['Group Name'],
    ...groups.map((g) => [g.name]),
  ];

  const SHEET_HEADER = ['Key', 'Label', 'Enabled', 'Type', 'Criticality', 'Group', 'Tolerance Type', 'Tolerance Value', 'Instructions'];
  const sheet3: (string | number)[][] = [SHEET_HEADER];
  for (const gip of globalInspectionPoints) {
    sheet3.push([
      gip.key,
      gip.label,
      gip.visible ? 'Yes' : 'No',
      gip.isNumeric ? 'Numeric' : 'Text',
      cap(gip.severity),
      gip.group ?? '',
      gip.isNumeric && gip.tolerance ? cap(gip.tolerance.type) : '',
      gip.isNumeric && gip.tolerance ? gip.tolerance.value : '',
      gip.instructions ?? '',
    ]);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet1), 'Column Settings');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet2), 'Groups');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet3), 'Global inspection points');
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  const dirUri = Paths.cache.uri + 'settings_export/';
  new Directory(dirUri).create({ intermediates: true, idempotent: true });
  const file = new File(dirUri + 'inspection_settings.xlsx');
  file.write(base64, { encoding: 'base64' });

  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });
}

export async function parseSettingsFile(fileUri: string): Promise<ParsedSettingsData> {
  const base64 = await new File(fileUri).base64();
  const wb = XLSX.read(base64, { type: 'base64' });

  if (!wb.SheetNames.includes('Column Settings')) {
    throw new Error('Invalid settings file: "Column Settings" sheet not found');
  }

  const ws1 = wb.Sheets['Column Settings'];
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws1, { defval: '' });

  const columnSettings: ParsedColumnSetting[] = [];
  for (const row of rows) {
    const key = String(row['Key'] ?? '').trim();
    if (!key) continue;

    const isNumeric = String(row['Type']).trim().toLowerCase() === 'numeric';
    const sevRaw = String(row['Criticality']).trim().toLowerCase();
    const severity = (['high', 'medium', 'low'] as const).includes(sevRaw as 'high' | 'medium' | 'low')
      ? (sevRaw as 'high' | 'medium' | 'low')
      : 'medium';

    const tolTypeRaw = String(row['Tolerance Type']).trim().toLowerCase();
    let toleranceType: 'absolute' | 'percent' | null = null;
    let toleranceValue: number | null = null;
    if (isNumeric) {
      if (tolTypeRaw === 'absolute') toleranceType = 'absolute';
      else if (tolTypeRaw === 'percent') toleranceType = 'percent';
      const tv = Number(row['Tolerance Value']);
      if (isFinite(tv)) toleranceValue = tv;
    }

    columnSettings.push({
      key,
      label: String(row['Label'] ?? '').trim(),
      visible: String(row['Enabled']).trim().toLowerCase() === 'yes',
      isNumeric,
      severity,
      group: String(row['Group'] ?? '').trim() || null,
      toleranceType,
      toleranceValue,
      instructions: String(row['Instructions'] ?? '').trim() || null,
    });
  }

  let groups: string[] = [];
  if (wb.SheetNames.includes('Groups')) {
    const ws2 = wb.Sheets['Groups'];
    const groupRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws2, { defval: '' });
    groups = groupRows
      .map((r) => String(r['Group Name'] ?? '').trim())
      .filter(Boolean);
  }

  let globalInspectionPoints: ParsedColumnSetting[] = [];
  if (wb.SheetNames.includes('Global inspection points')) {
    const ws3 = wb.Sheets['Global inspection points'];
    const gipRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws3, { defval: '' });
    for (const row of gipRows) {
      const key = String(row['Key'] ?? '').trim();
      if (!key) continue;
      const isNumeric = String(row['Type']).trim().toLowerCase() === 'numeric';
      const sevRaw = String(row['Criticality']).trim().toLowerCase();
      const severity = (['high', 'medium', 'low'] as const).includes(sevRaw as 'high' | 'medium' | 'low')
        ? (sevRaw as 'high' | 'medium' | 'low')
        : 'medium';
      const tolTypeRaw = String(row['Tolerance Type']).trim().toLowerCase();
      let toleranceType: 'absolute' | 'percent' | null = null;
      let toleranceValue: number | null = null;
      if (isNumeric) {
        if (tolTypeRaw === 'absolute') toleranceType = 'absolute';
        else if (tolTypeRaw === 'percent') toleranceType = 'percent';
        const tv = Number(row['Tolerance Value']);
        if (isFinite(tv)) toleranceValue = tv;
      }
      globalInspectionPoints.push({
        key,
        label: String(row['Label'] ?? '').trim(),
        visible: String(row['Enabled']).trim().toLowerCase() === 'yes',
        isNumeric,
        severity,
        group: String(row['Group'] ?? '').trim() || null,
        toleranceType,
        toleranceValue,
        instructions: String(row['Instructions'] ?? '').trim() || null,
      });
    }
  }

  return { columnSettings, groups, globalInspectionPoints };
}
