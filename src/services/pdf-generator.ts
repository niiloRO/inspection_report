import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { ColumnConfig, GlobalInspectionPoint, Group, Inspection, InspectionPointConfig, InspectionResult, Product, Severity } from '@/types';
import { photoToBase64 } from './photo-service';

const SEVERITY_CSS: Record<Severity, string> = {
  high: '#c0392b',
  medium: '#e67e22',
  low: '#f39c12',
};

const SEVERITY_LABELS: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadge(status: 'pass' | 'fail' | 'na'): string {
  if (status === 'pass') return `<span style="background:#27ae60;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;">PASS</span>`;
  if (status === 'fail') return `<span style="background:#e74c3c;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;">FAIL</span>`;
  return `<span style="background:#999;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;">N/A</span>`;
}

function severityBadge(severity: Severity): string {
  const color = SEVERITY_CSS[severity];
  const label = SEVERITY_LABELS[severity];
  return `<span style="background:${color}22;color:${color};padding:2px 6px;border-radius:8px;font-size:11px;font-weight:bold;">${label}</span>`;
}

function attrStatus(r: InspectionResult | undefined, isNumeric: boolean): 'pass' | 'fail' | 'na' {
  if (!r) return 'na';
  if (isNumeric) {
    if (r.value == null || String(r.value).trim() === '') return 'na';
  }
  return r.passed ? 'pass' : 'fail';
}

export interface ReportOptions {
  inspection: Inspection;
  product: Product;
  results: InspectionResult[];
  columnConfigs: ColumnConfig[];
  inspectionPointConfigs: InspectionPointConfig[];
  groups: Group[];
  productUnits: { unitsInspected: number; batchSize: number; productionStatus?: number; packingStatus?: number };
  productInspectionPoints: { pointIndex: number; pointText: string }[];
  globalInspectionPoints: GlobalInspectionPoint[];
}

export interface NestedReportOptions {
  inspection: Inspection;
  products: Product[];
  results: InspectionResult[];
  columnConfigs: ColumnConfig[];
  groups: Group[];
  productUnits: Map<string, { unitsInspected: number; batchSize: number; productionStatus?: number; packingStatus?: number }>;
  productInspectionPoints: Map<string, { pointIndex: number; pointText: string }[]>;
  globalInspectionPoints: GlobalInspectionPoint[];
}

export async function generateProductReport(options: ReportOptions): Promise<string> {
  const { inspection, product, results, columnConfigs, groups, productUnits, productInspectionPoints, globalInspectionPoints } = options;
  const productResults = results.filter((r) => r.productId === product.id);

  const resultMap = new Map(productResults.map((r) => [r.pointKey, r]));

  const colSeverityMap = new Map(columnConfigs.map((c) => [c.key, c.severity]));
  const colMap = new Map(columnConfigs.map((c) => [c.key, c]));
  const gipMap = new Map(globalInspectionPoints.map((g) => [g.key, g]));

  // Assign sequential photo numbers across all results
  let photoCounter = 1;
  const photoNumberMap = new Map<string, number>();
  const allPhotos: { label: string; num: number; uri: string; b64?: string }[] = [];

  for (const r of productResults) {
    if (r.photoUris.length > 0) {
      photoNumberMap.set(r.pointKey, photoCounter);
      for (const uri of r.photoUris) {
        allPhotos.push({ label: `Photo ${photoCounter}`, num: photoCounter, uri });
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

  const visibleColumns = columnConfigs.filter((c) => c.visible);

  // Categorise failed results
  const failedAttributes = productResults.filter((r) => {
    if (r.type !== 'attribute') return false;
    const col = colMap.get(r.pointKey.replace('attr:', ''));
    if (col?.isNumeric && (r.value == null || String(r.value).trim() === '')) return false;
    return !r.passed;
  });
  const failedGips = productResults.filter((r) => {
    if (r.type !== 'global_inspection_point') return false;
    const gipKey = r.pointKey.replace('gip:', '');
    const gip = gipMap.get(gipKey);
    if (gip?.isNumeric && (r.value == null || String(r.value).trim() === '')) return false;
    return !r.passed;
  });
  const failedPoints = productResults.filter((r) => r.type === 'inspection_point' && !r.passed);

  const dateStr = new Date(inspection.date).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // --- Failures by criticality overview ---
  const severityOrder: Severity[] = ['high', 'medium', 'low'];
  let criticalityOverview = '';
  if (failedAttributes.length > 0 || failedGips.length > 0 || failedPoints.length > 0) {
    let rows = '';
    for (const sev of severityOrder) {
      const attrCount = failedAttributes.filter((r) => {
        const colKey = r.pointKey.replace('attr:', '');
        return (colSeverityMap.get(colKey) ?? 'medium') === sev;
      }).length;
      const gipCount = failedGips.filter((r) => {
        const gipKey = r.pointKey.replace('gip:', '');
        return (gipMap.get(gipKey)?.severity ?? 'medium') === sev;
      }).length;
      const count = attrCount + gipCount;
      rows += `<tr>
        <td style="padding:5px 8px;">${severityBadge(sev)} ${SEVERITY_LABELS[sev]}</td>
        <td style="padding:5px 8px;font-weight:bold;color:${count > 0 ? SEVERITY_CSS[sev] : '#333'};">${count}</td>
      </tr>`;
    }
    rows += `<tr>
      <td style="padding:5px 8px;color:#555;">Inspection Points</td>
      <td style="padding:5px 8px;font-weight:bold;color:${failedPoints.length > 0 ? '#555' : '#333'};">${failedPoints.length}</td>
    </tr>`;
    criticalityOverview = `
<h2>Failures by Criticality</h2>
<table style="width:auto;">
  <tr><th>Criticality</th><th>Failed</th></tr>
  ${rows}
</table>`;
  }

  // --- Failed points detail list ---
  let failedSummaryRows = '';
  for (const sev of severityOrder) {
    const sevAttrFails = failedAttributes.filter((r) => {
      const colKey = r.pointKey.replace('attr:', '');
      return (colSeverityMap.get(colKey) ?? 'medium') === sev;
    });
    const sevGipFails = failedGips.filter((r) => {
      const gipKey = r.pointKey.replace('gip:', '');
      return (gipMap.get(gipKey)?.severity ?? 'medium') === sev;
    });
    const sevFails = [...sevAttrFails, ...sevGipFails];
    if (sevFails.length === 0) continue;
    failedSummaryRows += `<tr style="background:${SEVERITY_CSS[sev]}11;">
      <td colspan="3" style="padding:4px 8px;font-size:12px;font-weight:bold;color:${SEVERITY_CSS[sev]};">${SEVERITY_LABELS[sev].toUpperCase()} FAILURES (${sevFails.length})</td>
    </tr>`;
    for (const r of sevFails) {
      let label: string;
      if (r.type === 'attribute') {
        const colKey = r.pointKey.replace('attr:', '');
        label = colMap.get(colKey)?.label ?? colKey;
      } else {
        const gipKey = r.pointKey.replace('gip:', '');
        label = gipMap.get(gipKey)?.label ?? gipKey;
      }
      const photoNum = photoNumberMap.get(r.pointKey);
      failedSummaryRows += `<tr>
        <td>${escapeHtml(label)}</td>
        <td>${r.note ? escapeHtml(r.note) : '—'}</td>
        <td>${photoNum ? `<a href="#photo-${photoNum}" style="color:#3c87f7">Photo ${photoNum}</a>` : '—'}</td>
      </tr>`;
    }
  }

  if (failedPoints.length > 0) {
    failedSummaryRows += `<tr style="background:#f0f0f0;">
      <td colspan="3" style="padding:4px 8px;font-size:12px;font-weight:bold;color:#333;">INSPECTION POINT FAILURES (${failedPoints.length})</td>
    </tr>`;
    for (const r of failedPoints) {
      const label = r.pointKey.length > 80 ? r.pointKey.slice(0, 80) + '…' : r.pointKey;
      const photoNum = photoNumberMap.get(r.pointKey);
      failedSummaryRows += `<tr>
        <td>${escapeHtml(label)}</td>
        <td>${r.note ? escapeHtml(r.note) : '—'}</td>
        <td>${photoNum ? `<a href="#photo-${photoNum}" style="color:#3c87f7">Photo ${photoNum}</a>` : '—'}</td>
      </tr>`;
    }
  }

  // --- Attribute + GIP results table ---
  const groupedCols = new Map<string | null, ColumnConfig[]>();
  for (const col of visibleColumns) {
    const g = col.group ?? null;
    if (!groupedCols.has(g)) groupedCols.set(g, []);
    groupedCols.get(g)!.push(col);
  }

  const gipGroupedMap = new Map<string | null, GlobalInspectionPoint[]>();
  for (const gip of globalInspectionPoints) {
    const g = gip.group ?? null;
    if (!gipGroupedMap.has(g)) gipGroupedMap.set(g, []);
    gipGroupedMap.get(g)!.push(gip);
  }

  function attrRow(col: ColumnConfig): string {
    const pointKey = `attr:${col.key}`;
    const r = resultMap.get(pointKey);
    const refVal = product.attributes[col.key];
    const measuredVal = r?.value ?? '—';
    const st = attrStatus(r, col.isNumeric);
    const photoNum = photoNumberMap.get(pointKey);
    const noteVal = r?.note ? escapeHtml(r.note) : '—';
    const sampleSizeVal = r?.sampleSize ? escapeHtml(r.sampleSize) : '—';
    return `<tr>
      <td>${escapeHtml(col.label)}</td>
      <td>${sampleSizeVal}</td>
      <td>${escapeHtml(String(refVal ?? '—'))}</td>
      <td>${st !== 'na' ? escapeHtml(String(measuredVal)) : '—'}</td>
      <td>${statusBadge(st)}</td>
      <td>${noteVal}</td>
      <td>${photoNum ? `<a href="#photo-${photoNum}" style="color:#3c87f7">Photo ${photoNum}</a>` : '—'}</td>
    </tr>`;
  }

  function gipRow(gip: GlobalInspectionPoint): string {
    const pointKey = `gip:${gip.key}`;
    const r = resultMap.get(pointKey);
    const measuredVal = r?.value ?? '—';
    const st = attrStatus(r, gip.isNumeric);
    const photoNum = photoNumberMap.get(pointKey);
    const noteVal = r?.note ? escapeHtml(r.note) : '—';
    const sampleSizeVal = r?.sampleSize ? escapeHtml(r.sampleSize) : '—';
    return `<tr>
      <td>${escapeHtml(gip.label)}</td>
      <td>${sampleSizeVal}</td>
      <td>—</td>
      <td>${st !== 'na' ? escapeHtml(String(measuredVal)) : '—'}</td>
      <td>${statusBadge(st)}</td>
      <td>${noteVal}</td>
      <td>${photoNum ? `<a href="#photo-${photoNum}" style="color:#3c87f7">Photo ${photoNum}</a>` : '—'}</td>
    </tr>`;
  }

  function groupSubHeader(label: string): string {
    return `<tr style="background:#f5f5f5;">
      <td colspan="7" style="padding:5px 8px;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;color:#555;">${escapeHtml(label)}</td>
    </tr>`;
  }

  const hasNamedGroups = groups.length > 0;
  const ungroupedGips = gipGroupedMap.get(null) ?? [];

  let attributeRows = '';
  for (const group of groups) {
    const cols = groupedCols.get(group.name) ?? [];
    const gips = gipGroupedMap.get(group.name) ?? [];
    if (cols.length === 0 && gips.length === 0) continue;
    if (hasNamedGroups) attributeRows += groupSubHeader(group.name);
    for (const col of cols) attributeRows += attrRow(col);
    for (const gip of gips) attributeRows += gipRow(gip);
  }

  const ungroupedCols = groupedCols.get(null) ?? [];
  if (ungroupedCols.length > 0) {
    if (hasNamedGroups) attributeRows += groupSubHeader('Other');
    for (const col of ungroupedCols) attributeRows += attrRow(col);
  }

  if (ungroupedGips.length > 0) {
    attributeRows += groupSubHeader('Global Inspection Points');
    for (const gip of ungroupedGips) attributeRows += gipRow(gip);
  }

  // --- Inspection point results table ---
  let pointRows = '';
  for (const pip of productInspectionPoints) {
    const r = resultMap.get(pip.pointText);
    const st: 'pass' | 'fail' | 'na' = r ? (r.passed ? 'pass' : 'fail') : 'na';
    const photoNum = r ? photoNumberMap.get(pip.pointText) : undefined;
    const noteVal = r?.note ? escapeHtml(r.note) : '—';
    const sampleSizeVal = r?.sampleSize ? escapeHtml(r.sampleSize) : '—';
    pointRows += `<tr>
      <td style="font-size:12px;">${escapeHtml(pip.pointText)}</td>
      <td>${sampleSizeVal}</td>
      <td>${statusBadge(st)}</td>
      <td>${noteVal}</td>
      <td>${photoNum ? `<a href="#photo-${photoNum}" style="color:#3c87f7">Photo ${photoNum}</a>` : '—'}</td>
    </tr>`;
  }

  // --- Photos section (4 per page, 2×2 grid) ---
  const readyPhotos = allPhotos.filter((p) => p.b64);
  let photosHtml = '';
  if (readyPhotos.length > 0) {
    const pages: string[] = [];
    for (let i = 0; i < readyPhotos.length; i += 4) {
      const chunk = readyPhotos.slice(i, i + 4);
      const blocks = chunk.map((photo) => `
        <div class="photo-block" id="photo-${photo.num}">
          <p class="photo-label">${escapeHtml(photo.label)}</p>
          <img src="data:image/jpeg;base64,${photo.b64}" />
        </div>`).join('');
      pages.push(`<div class="photo-page">${blocks}</div>`);
    }
    photosHtml = pages.join('');
  }

  const inspectorLine = inspection.inspectorName
    ? `Inspector: ${escapeHtml(inspection.inspectorName)} &nbsp;·&nbsp; ` : '';
  const supplierLine = inspection.supplier
    ? `Supplier: ${escapeHtml(inspection.supplier)} &nbsp;·&nbsp; ` : '';
  const locationLine = inspection.location
    ? `Location: ${escapeHtml(inspection.location)} &nbsp;·&nbsp; ` : '';
  const invoiceNoLine = inspection.invoiceNo
    ? `Invoice NO: ${escapeHtml(inspection.invoiceNo)} &nbsp;·&nbsp; ` : '';
  const statusLine = (productUnits.productionStatus != null || productUnits.packingStatus != null)
    ? [
        productUnits.productionStatus != null ? `Production: ${productUnits.productionStatus}%` : null,
        productUnits.packingStatus != null ? `Packing: ${productUnits.packingStatus}%` : null,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ') + '<br/>'
    : '';

  const totalFailed = failedAttributes.length + failedGips.length + failedPoints.length;
  const totalPassed = productResults.filter((r) => r.passed).length;

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
  .photo-page { page-break-after: always; break-after: page; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 10px; height: 100vh; box-sizing: border-box; padding: 4px; }
  .photo-block { display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; border: 1px solid #eee; border-radius: 4px; padding: 6px; }
  .photo-block img { max-width: 100%; max-height: calc(50vh - 40px); object-fit: contain; }
  .photo-label { font-weight: bold; font-size: 11px; margin-bottom: 4px; text-align: center; }
</style>
</head>
<body>

<h1>${escapeHtml(product.name)}</h1>
<div class="meta">
  Inspection Report &nbsp;·&nbsp; ${escapeHtml(dateStr)}<br/>
  Product ID: ${escapeHtml(product.id)} &nbsp;·&nbsp;
  Units inspected: ${productUnits.unitsInspected} / ${productUnits.batchSize} batch<br/>
  ${inspectorLine}${supplierLine}${locationLine}${invoiceNoLine}
  ${statusLine}
</div>

<div style="margin-bottom:16px;">
  <div class="stat"><span>${totalPassed}</span><br/>Passed</div>
  <div class="stat"><span style="color:#e74c3c">${totalFailed}</span><br/>Failed</div>
  <div class="stat"><span>${productResults.length}</span><br/>Total Filled</div>
</div>

${criticalityOverview}

${failedSummaryRows ? `
<h2>Failed Points Detail</h2>
<table>
  <tr><th>Inspection Point</th><th>Note</th><th>Photo</th></tr>
  ${failedSummaryRows}
</table>
` : '<p style="color:#27ae60;font-weight:bold;">&#10003; All filled inspection points passed</p>'}

${attributeRows ? `
<h2>Product Attribute Results</h2>
<table>
  <tr><th>Attribute</th><th>Sample Size</th><th>Reference</th><th>Measured</th><th>Result</th><th>Note</th><th>Photo</th></tr>
  ${attributeRows}
</table>
` : ''}

${pointRows ? `
<h2>Inspection Points</h2>
<table>
  <tr><th style="width:45%">Inspection Point</th><th>Sample Size</th><th>Result</th><th>Note</th><th>Photo</th></tr>
  ${pointRows}
</table>
` : ''}

${photosHtml ? `<div style="page-break-before:always;break-before:page;"><h2>Attached Photos</h2>${photosHtml}</div>` : ''}

</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html });

  const reportsDir = new Directory(Paths.document.uri + 'reports/');
  reportsDir.create({ intermediates: true, idempotent: true });
  const destFile = new File(reportsDir.uri + `${product.id}_${inspection.id}.pdf`);
  if (destFile.exists) destFile.delete();
  new File(uri).copy(destFile);
  return destFile.uri;
}

export async function generateNestedReport(options: NestedReportOptions): Promise<string> {
  const { inspection, products, results, columnConfigs, groups, productUnits, productInspectionPoints, globalInspectionPoints } = options;

  const resultMap = new Map<string, InspectionResult>();
  for (const r of results) {
    resultMap.set(`${r.productId}:${r.pointKey}`, r);
  }

  const colMap = new Map(columnConfigs.map((c) => [c.key, c]));
  const gipMap = new Map(globalInspectionPoints.map((g) => [g.key, g]));
  const colSeverityMap = new Map(columnConfigs.map((c) => [c.key, c.severity]));
  const visibleColumns = columnConfigs.filter((c) => c.visible);

  const groupedCols = new Map<string | null, ColumnConfig[]>();
  for (const col of visibleColumns) {
    const g = col.group ?? null;
    if (!groupedCols.has(g)) groupedCols.set(g, []);
    groupedCols.get(g)!.push(col);
  }
  const gipGroupedMap = new Map<string | null, GlobalInspectionPoint[]>();
  for (const gip of globalInspectionPoints) {
    const g = gip.group ?? null;
    if (!gipGroupedMap.has(g)) gipGroupedMap.set(g, []);
    gipGroupedMap.get(g)!.push(gip);
  }

  let photoCounter = 1;
  const photoNumberMap = new Map<string, number>();
  const allPhotos: { label: string; num: number; uri: string; b64?: string }[] = [];

  function collectPhotos(productId: string, pointKey: string) {
    const r = resultMap.get(`${productId}:${pointKey}`);
    if (r && r.photoUris.length > 0) {
      photoNumberMap.set(`${productId}:${pointKey}`, photoCounter);
      for (const uri of r.photoUris) {
        allPhotos.push({ label: `Photo ${photoCounter}`, num: photoCounter, uri });
        photoCounter++;
      }
    }
  }

  const ungroupedCols = groupedCols.get(null) ?? [];
  const ungroupedGips = gipGroupedMap.get(null) ?? [];

  for (const group of groups) {
    for (const col of (groupedCols.get(group.name) ?? [])) {
      for (const p of products) collectPhotos(p.id, `attr:${col.key}`);
    }
    for (const gip of (gipGroupedMap.get(group.name) ?? [])) {
      for (const p of products) collectPhotos(p.id, `gip:${gip.key}`);
    }
  }
  for (const col of ungroupedCols) {
    for (const p of products) collectPhotos(p.id, `attr:${col.key}`);
  }
  for (const gip of ungroupedGips) {
    for (const p of products) collectPhotos(p.id, `gip:${gip.key}`);
  }
  for (const product of products) {
    for (const pip of (productInspectionPoints.get(product.id) ?? [])) {
      collectPhotos(product.id, pip.pointText);
    }
  }

  for (const photo of allPhotos) {
    try { photo.b64 = await photoToBase64(photo.uri); } catch { /* skip */ }
  }

  const dateStr = new Date(inspection.date).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const inspectorLine = inspection.inspectorName
    ? `Inspector: ${escapeHtml(inspection.inspectorName)} &nbsp;·&nbsp; ` : '';
  const supplierLine = inspection.supplier
    ? `Supplier: ${escapeHtml(inspection.supplier)} &nbsp;·&nbsp; ` : '';
  const locationLine = inspection.location
    ? `Location: ${escapeHtml(inspection.location)} &nbsp;·&nbsp; ` : '';
  const invoiceNoLine = inspection.invoiceNo
    ? `Invoice NO: ${escapeHtml(inspection.invoiceNo)} &nbsp;·&nbsp; ` : '';

  // Products table
  let productsTableRows = '';
  for (const product of products) {
    const pu = productUnits.get(product.id) ?? { unitsInspected: 1, batchSize: 1 };
    productsTableRows += `<tr>
      <td>${escapeHtml(product.id)}</td>
      <td>${escapeHtml(product.name)}</td>
      <td>${pu.unitsInspected}</td>
      <td>${pu.batchSize}</td>
      <td>${pu.productionStatus != null ? pu.productionStatus + '%' : '—'}</td>
      <td>${pu.packingStatus != null ? pu.packingStatus + '%' : '—'}</td>
    </tr>`;
  }

  // Summary stats per product
  const severityOrder: Severity[] = ['high', 'medium', 'low'];
  let statsRows = '';
  for (const product of products) {
    const pr = results.filter((r) => r.productId === product.id);
    const passed = pr.filter((r) => r.passed).length;
    const failed = pr.filter((r) => {
      if (r.type === 'attribute') {
        const col = colMap.get(r.pointKey.replace('attr:', ''));
        if (col?.isNumeric && (r.value == null || String(r.value).trim() === '')) return false;
      } else if (r.type === 'global_inspection_point') {
        const gip = gipMap.get(r.pointKey.replace('gip:', ''));
        if (gip?.isNumeric && (r.value == null || String(r.value).trim() === '')) return false;
      }
      return !r.passed;
    }).length;
    statsRows += `<tr>
      <td>${escapeHtml(product.name)}<br/><span style="color:#888;font-size:11px;">${escapeHtml(product.id)}</span></td>
      <td style="color:#27ae60;font-weight:bold;">${passed}</td>
      <td style="color:${failed > 0 ? '#e74c3c' : '#333'};font-weight:bold;">${failed}</td>
      <td>${pr.length}</td>
    </tr>`;
  }

  // Failures per product
  let failuresHtml = '';
  for (const product of products) {
    const pr = results.filter((r) => r.productId === product.id);
    const failedAttrs = pr.filter((r) => {
      if (r.type !== 'attribute') return false;
      const col = colMap.get(r.pointKey.replace('attr:', ''));
      if (col?.isNumeric && (r.value == null || String(r.value).trim() === '')) return false;
      return !r.passed;
    });
    const failedGips = pr.filter((r) => {
      if (r.type !== 'global_inspection_point') return false;
      const gip = gipMap.get(r.pointKey.replace('gip:', ''));
      if (gip?.isNumeric && (r.value == null || String(r.value).trim() === '')) return false;
      return !r.passed;
    });
    const failedPoints = pr.filter((r) => r.type === 'inspection_point' && !r.passed);
    if (failedAttrs.length === 0 && failedGips.length === 0 && failedPoints.length === 0) continue;

    failuresHtml += `<h3 style="font-size:13px;margin:10px 0 4px;color:#333;">${escapeHtml(product.name)} <span style="color:#888;font-size:11px;">(${escapeHtml(product.id)})</span></h3>`;
    let failRows = '';
    for (const sev of severityOrder) {
      const sevFails = [
        ...failedAttrs.filter((r) => (colSeverityMap.get(r.pointKey.replace('attr:', '')) ?? 'medium') === sev),
        ...failedGips.filter((r) => (gipMap.get(r.pointKey.replace('gip:', ''))?.severity ?? 'medium') === sev),
      ];
      if (sevFails.length === 0) continue;
      failRows += `<tr style="background:${SEVERITY_CSS[sev]}11;">
        <td colspan="3" style="padding:4px 8px;font-size:11px;font-weight:bold;color:${SEVERITY_CSS[sev]};">${SEVERITY_LABELS[sev].toUpperCase()} (${sevFails.length})</td>
      </tr>`;
      for (const r of sevFails) {
        const label = r.type === 'attribute'
          ? (colMap.get(r.pointKey.replace('attr:', ''))?.label ?? r.pointKey)
          : (gipMap.get(r.pointKey.replace('gip:', ''))?.label ?? r.pointKey);
        const photoNum = photoNumberMap.get(`${product.id}:${r.pointKey}`);
        failRows += `<tr>
          <td>${escapeHtml(label)}</td>
          <td>${r.note ? escapeHtml(r.note) : '—'}</td>
          <td>${photoNum ? `<a href="#photo-${photoNum}" style="color:#3c87f7">Photo ${photoNum}</a>` : '—'}</td>
        </tr>`;
      }
    }
    if (failedPoints.length > 0) {
      failRows += `<tr style="background:#f0f0f0;">
        <td colspan="3" style="padding:4px 8px;font-size:11px;font-weight:bold;color:#333;">INSPECTION POINTS (${failedPoints.length})</td>
      </tr>`;
      for (const r of failedPoints) {
        const photoNum = photoNumberMap.get(`${product.id}:${r.pointKey}`);
        failRows += `<tr>
          <td>${escapeHtml(r.pointKey)}</td>
          <td>${r.note ? escapeHtml(r.note) : '—'}</td>
          <td>${photoNum ? `<a href="#photo-${photoNum}" style="color:#3c87f7">Photo ${photoNum}</a>` : '—'}</td>
        </tr>`;
      }
    }
    failuresHtml += `<table><tr><th>Point</th><th>Note</th><th>Photo</th></tr>${failRows}</table>`;
  }

  // Nested attribute/GIP table
  const hasNamedGroups = groups.length > 0;
  const n = products.length;

  function nestedRows(cols: ColumnConfig[], gips: GlobalInspectionPoint[], groupLabel: string | null): string {
    let rows = '';
    if (groupLabel !== null) {
      rows += `<tr style="background:#f5f5f5;">
        <td colspan="8" style="padding:5px 8px;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;color:#555;">${escapeHtml(groupLabel)}</td>
      </tr>`;
    }
    for (const col of cols) {
      products.forEach((product, pi) => {
        const pk = `attr:${col.key}`;
        const r = resultMap.get(`${product.id}:${pk}`);
        const st = attrStatus(r, col.isNumeric);
        const measuredVal = r?.value ?? '—';
        const photoNum = photoNumberMap.get(`${product.id}:${pk}`);
        if (pi === 0) {
          rows += `<tr>
            <td rowspan="${n}" style="vertical-align:middle;font-weight:500;">${escapeHtml(col.label)}</td>
            <td>${escapeHtml(product.id)}</td>
            <td>${r?.sampleSize ? escapeHtml(r.sampleSize) : '—'}</td>
            <td>${escapeHtml(String(product.attributes[col.key] ?? '—'))}</td>
            <td>${st !== 'na' ? escapeHtml(String(measuredVal)) : '—'}</td>
            <td>${statusBadge(st)}</td>
            <td>${r?.note ? escapeHtml(r.note) : '—'}</td>
            <td>${photoNum ? `<a href="#photo-${photoNum}" style="color:#3c87f7">Photo ${photoNum}</a>` : '—'}</td>
          </tr>`;
        } else {
          rows += `<tr>
            <td>${escapeHtml(product.id)}</td>
            <td>${r?.sampleSize ? escapeHtml(r.sampleSize) : '—'}</td>
            <td>${escapeHtml(String(product.attributes[col.key] ?? '—'))}</td>
            <td>${st !== 'na' ? escapeHtml(String(measuredVal)) : '—'}</td>
            <td>${statusBadge(st)}</td>
            <td>${r?.note ? escapeHtml(r.note) : '—'}</td>
            <td>${photoNum ? `<a href="#photo-${photoNum}" style="color:#3c87f7">Photo ${photoNum}</a>` : '—'}</td>
          </tr>`;
        }
      });
    }
    for (const gip of gips) {
      products.forEach((product, pi) => {
        const pk = `gip:${gip.key}`;
        const r = resultMap.get(`${product.id}:${pk}`);
        const st = attrStatus(r, gip.isNumeric);
        const measuredVal = r?.value ?? '—';
        const photoNum = photoNumberMap.get(`${product.id}:${pk}`);
        if (pi === 0) {
          rows += `<tr>
            <td rowspan="${n}" style="vertical-align:middle;font-weight:500;">${escapeHtml(gip.label)}</td>
            <td>${escapeHtml(product.id)}</td>
            <td>${r?.sampleSize ? escapeHtml(r.sampleSize) : '—'}</td>
            <td>—</td>
            <td>${st !== 'na' ? escapeHtml(String(measuredVal)) : '—'}</td>
            <td>${statusBadge(st)}</td>
            <td>${r?.note ? escapeHtml(r.note) : '—'}</td>
            <td>${photoNum ? `<a href="#photo-${photoNum}" style="color:#3c87f7">Photo ${photoNum}</a>` : '—'}</td>
          </tr>`;
        } else {
          rows += `<tr>
            <td>${escapeHtml(product.id)}</td>
            <td>${r?.sampleSize ? escapeHtml(r.sampleSize) : '—'}</td>
            <td>—</td>
            <td>${st !== 'na' ? escapeHtml(String(measuredVal)) : '—'}</td>
            <td>${statusBadge(st)}</td>
            <td>${r?.note ? escapeHtml(r.note) : '—'}</td>
            <td>${photoNum ? `<a href="#photo-${photoNum}" style="color:#3c87f7">Photo ${photoNum}</a>` : '—'}</td>
          </tr>`;
        }
      });
    }
    return rows;
  }

  let attributeRows = '';
  for (const group of groups) {
    const cols = groupedCols.get(group.name) ?? [];
    const gips = gipGroupedMap.get(group.name) ?? [];
    if (cols.length > 0 || gips.length > 0) {
      attributeRows += nestedRows(cols, gips, group.name);
    }
  }
  if (ungroupedCols.length > 0) {
    attributeRows += nestedRows(ungroupedCols, [], hasNamedGroups ? 'Other' : null);
  }
  if (ungroupedGips.length > 0) {
    attributeRows += nestedRows([], ungroupedGips, 'Global Inspection Points');
  }

  // Inspection points section (per-product sub-headers)
  let pointRows = '';
  for (const product of products) {
    const points = productInspectionPoints.get(product.id) ?? [];
    if (points.length === 0) continue;
    pointRows += `<tr style="background:#eef3fb;">
      <td colspan="5" style="padding:5px 8px;font-size:12px;font-weight:bold;color:#3c87f7;">${escapeHtml(product.name)} — ${escapeHtml(product.id)}</td>
    </tr>`;
    for (const pip of points) {
      const r = resultMap.get(`${product.id}:${pip.pointText}`);
      const st: 'pass' | 'fail' | 'na' = r ? (r.passed ? 'pass' : 'fail') : 'na';
      const photoNum = photoNumberMap.get(`${product.id}:${pip.pointText}`);
      pointRows += `<tr>
        <td style="font-size:12px;">${escapeHtml(pip.pointText)}</td>
        <td>${r?.sampleSize ? escapeHtml(r.sampleSize) : '—'}</td>
        <td>${statusBadge(st)}</td>
        <td>${r?.note ? escapeHtml(r.note) : '—'}</td>
        <td>${photoNum ? `<a href="#photo-${photoNum}" style="color:#3c87f7">Photo ${photoNum}</a>` : '—'}</td>
      </tr>`;
    }
  }

  // Photos
  const readyPhotos = allPhotos.filter((p) => p.b64);
  let photosHtml = '';
  if (readyPhotos.length > 0) {
    const pages: string[] = [];
    for (let i = 0; i < readyPhotos.length; i += 4) {
      const chunk = readyPhotos.slice(i, i + 4);
      const blocks = chunk.map((photo) => `
        <div class="photo-block" id="photo-${photo.num}">
          <p class="photo-label">${escapeHtml(photo.label)}</p>
          <img src="data:image/jpeg;base64,${photo.b64}" />
        </div>`).join('');
      pages.push(`<div class="photo-page">${blocks}</div>`);
    }
    photosHtml = pages.join('');
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; color: #1a1a1a; font-size: 13px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 13px; margin: 10px 0 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
  th { background: #f5f5f5; text-align: left; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  .photo-page { page-break-after: always; break-after: page; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 10px; height: 100vh; box-sizing: border-box; padding: 4px; }
  .photo-block { display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; border: 1px solid #eee; border-radius: 4px; padding: 6px; }
  .photo-block img { max-width: 100%; max-height: calc(50vh - 40px); object-fit: contain; }
  .photo-label { font-weight: bold; font-size: 11px; margin-bottom: 4px; text-align: center; }
</style>
</head>
<body>

<h1>Inspection Report</h1>
<div class="meta">
  ${escapeHtml(dateStr)}<br/>
  ${inspectorLine}${supplierLine}${locationLine}${invoiceNoLine}
</div>

<h2>Products Inspected</h2>
<table>
  <tr><th>Product ID</th><th>Name</th><th>Units</th><th>Batch</th><th>Prod %</th><th>Pack %</th></tr>
  ${productsTableRows}
</table>

<h2>Summary by Product</h2>
<table>
  <tr><th>Product</th><th>Passed</th><th>Failed</th><th>Total Filled</th></tr>
  ${statsRows}
</table>

${failuresHtml ? `<h2>Failures Detail</h2>${failuresHtml}` : '<p style="color:#27ae60;font-weight:bold;">&#10003; All filled inspection points passed</p>'}

${attributeRows ? `
<h2>Product Attribute Results</h2>
<table>
  <tr><th>Attribute</th><th>Product ID</th><th>Sample Size</th><th>Reference</th><th>Measured</th><th>Result</th><th>Note</th><th>Photo</th></tr>
  ${attributeRows}
</table>
` : ''}

${pointRows ? `
<h2>Inspection Points</h2>
<table>
  <tr><th style="width:35%">Inspection Point</th><th>Sample Size</th><th>Result</th><th>Note</th><th>Photo</th></tr>
  ${pointRows}
</table>
` : ''}

${photosHtml ? `<div style="page-break-before:always;break-before:page;"><h2>Attached Photos</h2>${photosHtml}</div>` : ''}

</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html });
  const reportsDir = new Directory(Paths.document.uri + 'reports/');
  reportsDir.create({ intermediates: true, idempotent: true });
  const destFile = new File(reportsDir.uri + `nested_${inspection.id}.pdf`);
  if (destFile.exists) destFile.delete();
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
