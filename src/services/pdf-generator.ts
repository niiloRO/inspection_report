import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { ColumnConfig, Inspection, InspectionPointConfig, InspectionResult, Product, Severity } from '@/types';
import { photoToBase64 } from './photo-service';

const SEVERITY_CSS: Record<Severity, string> = {
  critical: '#c0392b',
  major: '#e67e22',
  minor: '#f39c12',
};

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function passFailBadge(passed: boolean): string {
  const bg = passed ? '#27ae60' : '#e74c3c';
  const label = passed ? 'PASS' : 'FAIL';
  return `<span style="background:${bg};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;">${label}</span>`;
}

function severityBadge(severity: Severity): string {
  const color = SEVERITY_CSS[severity];
  return `<span style="background:${color}22;color:${color};padding:2px 6px;border-radius:8px;font-size:11px;font-weight:bold;">${severity.toUpperCase()}</span>`;
}

export interface ReportOptions {
  inspection: Inspection;
  product: Product;
  results: InspectionResult[];
  columnConfigs: ColumnConfig[];
  inspectionPointConfigs: InspectionPointConfig[];
}

export async function generateProductReport(options: ReportOptions): Promise<string> {
  const { inspection, product, results, columnConfigs, inspectionPointConfigs } = options;
  const productResults = results.filter((r) => r.productId === product.id);

  const pointConfigMap = new Map(inspectionPointConfigs.map((p) => [p.text, p]));
  const resultMap = new Map(productResults.map((r) => [r.pointKey, r]));

  // Assign sequential photo numbers
  let photoCounter = 1;
  const photoNumberMap = new Map<string, number>(); // pointKey → first photo number
  const allPhotos: { label: string; uri: string; b64?: string }[] = [];

  for (const r of productResults) {
    if (r.photoUris.length > 0) {
      photoNumberMap.set(r.pointKey, photoCounter);
      for (const uri of r.photoUris) {
        allPhotos.push({ label: `Photo ${photoCounter}`, uri });
        photoCounter++;
      }
    }
  }

  for (const photo of allPhotos) {
    try {
      photo.b64 = await photoToBase64(photo.uri);
    } catch {
      // skip unreadable photos
    }
  }

  const failedResults = productResults.filter((r) => !r.passed);
  const visibleColumns = columnConfigs.filter((c) => c.visible);

  const dateStr = new Date(inspection.date).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // Failed points summary
  const severityOrder: Severity[] = ['critical', 'major', 'minor'];
  let failedSummaryRows = '';
  for (const sev of severityOrder) {
    const sevFails = failedResults.filter((r) => {
      if (r.type === 'attribute') return true;
      return (pointConfigMap.get(r.pointKey)?.severity ?? 'minor') === sev;
    }).filter((r) => {
      if (r.type === 'attribute') {
        const col = columnConfigs.find((c) => `attr:${c.key}` === r.pointKey);
        if (!col) return false;
        return true;
      }
      return (pointConfigMap.get(r.pointKey)?.severity ?? 'minor') === sev;
    });
    if (sevFails.length === 0) continue;

    failedSummaryRows += `<tr style="background:${SEVERITY_CSS[sev]}11;">
      <td colspan="3" style="padding:4px 8px;font-size:12px;font-weight:bold;color:${SEVERITY_CSS[sev]};">${sev.toUpperCase()} FAILURES (${sevFails.length})</td>
    </tr>`;
    for (const r of sevFails) {
      let label = r.pointKey;
      if (r.type === 'attribute') {
        const col = columnConfigs.find((c) => `attr:${c.key}` === r.pointKey);
        label = col?.label ?? r.pointKey;
      } else {
        label = r.pointKey.length > 80 ? r.pointKey.slice(0, 80) + '…' : r.pointKey;
      }
      const photoNum = photoNumberMap.get(r.pointKey);
      failedSummaryRows += `<tr>
        <td>${escapeHtml(label)}</td>
        <td>${r.note ? escapeHtml(r.note) : '—'}</td>
        <td>${photoNum ? `Photo ${photoNum}` : '—'}</td>
      </tr>`;
    }
  }

  // Attribute results table
  let attributeRows = '';
  for (const col of visibleColumns) {
    const pointKey = `attr:${col.key}`;
    const r = resultMap.get(pointKey);
    const refVal = product.attributes[col.key];
    const measuredVal = r?.value ?? '—';
    const passed = r ? r.passed : true;
    const photoNum = photoNumberMap.get(pointKey);
    attributeRows += `<tr>
      <td>${escapeHtml(col.label)}</td>
      <td>${escapeHtml(String(refVal ?? '—'))}</td>
      <td>${escapeHtml(String(measuredVal))}</td>
      <td>${passFailBadge(passed)}</td>
      <td>${r?.note ? escapeHtml(r.note) : '—'}</td>
      <td>${photoNum ? `Photo ${photoNum}` : '—'}</td>
    </tr>`;
  }

  // Inspection point results table (pointKey = text, substituted in report.tsx)
  let pointRows = '';
  for (const r of productResults.filter((rr) => rr.type === 'inspection_point')) {
    const config = pointConfigMap.get(r.pointKey);
    const photoNum = photoNumberMap.get(r.pointKey);
    pointRows += `<tr>
      <td style="font-size:12px;">${escapeHtml(r.pointKey)}</td>
      <td>${severityBadge(config?.severity ?? 'minor')}</td>
      <td>${passFailBadge(r.passed)}</td>
      <td>${r.note ? escapeHtml(r.note) : '—'}</td>
      <td>${photoNum ? `Photo ${photoNum}` : '—'}</td>
    </tr>`;
  }

  // Photos section
  let photosHtml = '';
  for (const photo of allPhotos) {
    if (photo.b64) {
      photosHtml += `<div class="photo-block">
        <p class="photo-label">${escapeHtml(photo.label)}</p>
        <img src="data:image/jpeg;base64,${photo.b64}" style="max-width:100%;max-height:500px;" />
      </div>`;
    }
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; color: #1a1a1a; font-size: 13px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
  .stat { display: inline-block; margin-right: 24px; }
  .stat span { font-size: 20px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
  th { background: #f5f5f5; text-align: left; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  .photo-block { page-break-inside: avoid; margin-bottom: 24px; }
  .photo-label { font-weight: bold; font-size: 12px; margin-bottom: 4px; }
</style>
</head>
<body>

<h1>${escapeHtml(product.name)}</h1>
<div class="meta">
  Inspection Report &nbsp;·&nbsp; ${escapeHtml(dateStr)}<br/>
  Product ID: ${escapeHtml(product.id)} &nbsp;·&nbsp;
  Units inspected: ${inspection.unitsInspected} / ${inspection.batchSize} batch
</div>

<div style="margin-bottom:16px;">
  <div class="stat"><span>${productResults.filter((r) => r.passed).length}</span><br/>Passed</div>
  <div class="stat"><span style="color:#e74c3c">${failedResults.length}</span><br/>Failed</div>
  <div class="stat"><span>${productResults.length}</span><br/>Total Checked</div>
</div>

${failedResults.length > 0 ? `
<h2>Failed Points Overview</h2>
<table>
  <tr><th>Inspection Point</th><th>Note</th><th>Photo</th></tr>
  ${failedSummaryRows}
</table>
` : '<p style="color:#27ae60;font-weight:bold;">&#10003; All inspection points passed</p>'}

${attributeRows ? `
<h2>Product Attribute Results</h2>
<table>
  <tr><th>Attribute</th><th>Reference</th><th>Measured</th><th>Result</th><th>Note</th><th>Photo</th></tr>
  ${attributeRows}
</table>
` : ''}

${pointRows ? `
<h2>Inspection Points</h2>
<table>
  <tr><th style="width:50%">Inspection Point</th><th>Severity</th><th>Result</th><th>Note</th><th>Photo</th></tr>
  ${pointRows}
</table>
` : ''}

${photosHtml ? `<h2>Attached Photos</h2>${photosHtml}` : ''}

</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html });

  const reportsDir = new Directory(Paths.document.uri + 'reports/');
  reportsDir.create({ intermediates: true, idempotent: true });
  const destFile = new File(reportsDir.uri + `${product.id}_${inspection.id}.pdf`);
  new File(uri).copy(destFile);
  return destFile.uri;
}

export async function sharePdf(pdfUri: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(pdfUri, { mimeType: 'application/pdf' });
}
