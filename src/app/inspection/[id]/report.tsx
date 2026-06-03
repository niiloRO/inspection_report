import { File, Paths } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSQLiteContext } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import { generateNestedReport, generateProductReport, sharePdf } from '@/services/pdf-generator';
import type { ColumnConfig, GlobalInspectionPoint, Group, Inspection, InspectionPointConfig, InspectionResult, PointType, Product, Severity, ToleranceType } from '@/types';

interface ProductReport {
  product: Product;
  pdfUri: string | null;
  videoUris: string[];
  generating: boolean;
  error: string | null;
}

async function shareBundle(pdfUri: string, videoUris: string[]): Promise<void> {
  const zip = new JSZip();

  zip.file('report.pdf', await new File(pdfUri).bytes());

  for (let i = 0; i < videoUris.length; i++) {
    const uri = videoUris[i];
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'mp4';
    zip.file(`video_${i + 1}.${ext}`, await new File(uri).bytes());
  }

  const zipBytes = await zip.generateAsync({ type: 'uint8array' });

  const zipUri = Paths.document.uri + 'inspection_report.zip';
  const zipFile = new File(zipUri);
  if (zipFile.exists) zipFile.delete();
  zipFile.write(zipBytes);

  await Sharing.shareAsync(zipUri, { mimeType: 'application/zip' });
}

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const db = useSQLiteContext();

  const [loading, setLoading] = useState(true);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [reports, setReports] = useState<ProductReport[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [globalInspectionPoints, setGlobalInspectionPoints] = useState<GlobalInspectionPoint[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const inspRow = await db.getFirstAsync<{
        id: string; date: string; units_inspected: number; batch_size: number; status: string;
        supplier: string | null; location: string | null; invoice_no: string | null;
        inspector_name: string | null; report_type: string;
      }>('SELECT * FROM inspections WHERE id = ?', [id]);
      if (!inspRow) return;

      const productIdRows = await db.getAllAsync<{ product_id: string }>(
        'SELECT product_id FROM inspection_products WHERE inspection_id = ?',
        [id],
      );
      const productIds = productIdRows.map((r) => r.product_id);

      const products: Product[] = [];
      for (const pid of productIds) {
        const p = await db.getFirstAsync<{ id: string; name: string; attributes: string }>(
          'SELECT * FROM products WHERE id = ?', [pid],
        );
        if (p) products.push({ id: p.id, name: p.name, attributes: JSON.parse(p.attributes) });
      }

      const gipRows = await db.getAllAsync<{
        key: string; label: string; visible: number; is_numeric: number;
        tolerance_type: string | null; tolerance_value: number | null;
        group_name: string | null; severity: string; sort_order: number; instructions: string | null;
      }>('SELECT * FROM global_inspection_points ORDER BY sort_order');
      setGlobalInspectionPoints(gipRows.map((r) => ({
        key: r.key,
        label: r.label,
        visible: r.visible === 1,
        isNumeric: r.is_numeric === 1,
        severity: r.severity as Severity,
        group: r.group_name ?? undefined,
        tolerance: r.tolerance_type && r.tolerance_value != null
          ? { type: r.tolerance_type as ToleranceType, value: r.tolerance_value }
          : undefined,
        instructions: r.instructions ?? undefined,
        sortOrder: r.sort_order,
      })));

      const insp: Inspection = {
        id: inspRow.id,
        date: inspRow.date,
        productIds,
        unitsInspected: inspRow.units_inspected,
        batchSize: inspRow.batch_size,
        status: inspRow.status as Inspection['status'],
        supplier: inspRow.supplier ?? undefined,
        location: inspRow.location ?? undefined,
        invoiceNo: inspRow.invoice_no ?? undefined,
        inspectorName: inspRow.inspector_name ?? undefined,
        reportType: (inspRow.report_type as 'normal' | 'nested') ?? 'normal',
      };
      setInspection(insp);
      setAllProducts(products);
      if (insp.reportType === 'nested') {
        const dummy: Product = { id: '__nested__', name: 'All Products', attributes: {} };
        setReports([{ product: dummy, pdfUri: null, videoUris: [], generating: false, error: null }]);
      } else {
        setReports(products.map((p) => ({ product: p, pdfUri: null, videoUris: [], generating: false, error: null })));
      }
    } finally {
      setLoading(false);
    }
  }

  async function generateReport(index: number) {
    if (!inspection) return;
    const pr = reports[index];
    if (!pr || pr.generating) return;

    setReports((prev) =>
      prev.map((r, i) => (i === index ? { ...r, generating: true, error: null } : r)),
    );

    try {
      const colRows = await db.getAllAsync<{
        key: string; label: string; visible: number; is_numeric: number;
        tolerance_type: string | null; tolerance_value: number | null;
        group_name: string | null; severity: string; sort_order: number;
      }>('SELECT * FROM column_configs WHERE visible = 1 ORDER BY sort_order');
      const columnConfigs: ColumnConfig[] = colRows.map((r) => ({
        key: r.key, label: r.label, visible: true, isNumeric: r.is_numeric === 1,
        severity: r.severity as Severity,
        group: r.group_name ?? undefined,
        tolerance: r.tolerance_type && r.tolerance_value != null
          ? { type: r.tolerance_type as 'absolute' | 'percent', value: r.tolerance_value }
          : undefined,
        sortOrder: r.sort_order,
      }));

      const groupRows = await db.getAllAsync<{ name: string; sort_order: number }>(
        'SELECT name, sort_order FROM groups ORDER BY sort_order',
      );
      const groups: Group[] = groupRows.map((r) => ({ name: r.name, sortOrder: r.sort_order }));

      const allResultRows = await db.getAllAsync<{
        id: string; inspection_id: string; product_id: string; point_key: string; type: string;
        value: string | null; passed: number; note: string | null; photo_uris: string;
        video_uris: string; sample_size: string | null;
      }>('SELECT * FROM inspection_results WHERE inspection_id = ?', [id]);

      if (inspection.reportType === 'nested') {
        // Build per-product data maps
        const productUnitsMap = new Map<string, { unitsInspected: number; batchSize: number; productionStatus?: number; packingStatus?: number }>();
        const productInspectionPointsMap = new Map<string, { pointIndex: number; pointText: string }[]>();
        const ipTextMap = new Map<string, Map<string, string>>();

        for (const product of allProducts) {
          const puRow = await db.getFirstAsync<{
            units_inspected: number; batch_size: number;
            production_status: number | null; packing_status: number | null;
          }>(
            'SELECT units_inspected, batch_size, production_status, packing_status FROM inspection_products WHERE inspection_id = ? AND product_id = ?',
            [id, product.id],
          );
          productUnitsMap.set(product.id, {
            unitsInspected: puRow?.units_inspected ?? 1,
            batchSize: puRow?.batch_size ?? 1,
            productionStatus: puRow?.production_status ?? undefined,
            packingStatus: puRow?.packing_status ?? undefined,
          });

          const ipRows = await db.getAllAsync<{ point_index: number; point_text: string }>(
            'SELECT point_index, point_text FROM product_inspection_points WHERE product_id = ? ORDER BY point_index',
            [product.id],
          );
          productInspectionPointsMap.set(product.id, ipRows.map((r) => ({ pointIndex: r.point_index, pointText: r.point_text })));
          const pm = new Map<string, string>();
          ipRows.forEach((r) => pm.set(`ip:${r.point_index}`, r.point_text));
          ipTextMap.set(product.id, pm);
        }

        const allVideoUris: string[] = [];
        const results: InspectionResult[] = allResultRows.map((r) => {
          let pointKey = r.point_key;
          if (r.type === 'inspection_point') {
            const text = ipTextMap.get(r.product_id)?.get(r.point_key);
            if (text) pointKey = text;
          }
          const videoUris: string[] = JSON.parse(r.video_uris || '[]');
          allVideoUris.push(...videoUris);
          return {
            id: r.id, inspectionId: r.inspection_id, productId: r.product_id, pointKey,
            type: r.type as PointType, value: r.value ?? undefined, passed: r.passed === 1,
            note: r.note ?? undefined, photoUris: JSON.parse(r.photo_uris || '[]'), videoUris,
            sampleSize: r.sample_size ?? undefined,
          };
        });

        const pdfUri = await generateNestedReport({
          inspection, products: allProducts, results, columnConfigs, groups,
          productUnits: productUnitsMap,
          productInspectionPoints: productInspectionPointsMap,
          globalInspectionPoints,
        });

        setReports((prev) =>
          prev.map((r, i) => (i === 0 ? { ...r, pdfUri, videoUris: allVideoUris, generating: false } : r)),
        );
        return;
      }

      // Normal per-product report
      const productUnitsRow = await db.getFirstAsync<{
        units_inspected: number; batch_size: number;
        production_status: number | null; packing_status: number | null;
      }>(
        'SELECT units_inspected, batch_size, production_status, packing_status FROM inspection_products WHERE inspection_id = ? AND product_id = ?',
        [id, pr.product.id],
      );
      const productUnits = {
        unitsInspected: productUnitsRow?.units_inspected ?? 1,
        batchSize: productUnitsRow?.batch_size ?? 1,
        productionStatus: productUnitsRow?.production_status ?? undefined,
        packingStatus: productUnitsRow?.packing_status ?? undefined,
      };

      const ipConfigRows = await db.getAllAsync<{ text: string }>(
        'SELECT text FROM inspection_point_configs',
      );
      const inspectionPointConfigs: InspectionPointConfig[] = ipConfigRows.map((r) => ({ text: r.text }));

      const ipTextRows = await db.getAllAsync<{ product_id: string; point_index: number; point_text: string }>(
        'SELECT * FROM product_inspection_points WHERE product_id = ?',
        [pr.product.id],
      );
      const ipTextMap = new Map(ipTextRows.map((r) => [`ip:${r.point_index}`, r.point_text]));

      const productVideoUris: string[] = [];
      const results: InspectionResult[] = allResultRows.map((r) => {
        let pointKey = r.point_key;
        if (r.type === 'inspection_point' && ipTextMap.has(r.point_key)) {
          pointKey = ipTextMap.get(r.point_key)!;
        }
        const videoUris: string[] = JSON.parse(r.video_uris || '[]');
        if (r.product_id === pr.product.id) {
          productVideoUris.push(...videoUris);
        }
        return {
          id: r.id,
          inspectionId: r.inspection_id,
          productId: r.product_id,
          pointKey,
          type: r.type as PointType,
          value: r.value ?? undefined,
          passed: r.passed === 1,
          note: r.note ?? undefined,
          photoUris: JSON.parse(r.photo_uris || '[]'),
          videoUris,
          sampleSize: r.sample_size ?? undefined,
        };
      });

      const pdfUri = await generateProductReport({
        inspection,
        product: pr.product,
        results,
        columnConfigs,
        inspectionPointConfigs,
        groups,
        productUnits,
        productInspectionPoints: ipTextRows
          .sort((a, b) => a.point_index - b.point_index)
          .map((r) => ({ pointIndex: r.point_index, pointText: r.point_text })),
        globalInspectionPoints,
      });

      setReports((prev) =>
        prev.map((r, i) => (i === index ? { ...r, pdfUri, videoUris: productVideoUris, generating: false } : r)),
      );
    } catch (err) {
      setReports((prev) =>
        prev.map((r, i) =>
          i === index ? { ...r, generating: false, error: String(err) } : r,
        ),
      );
    }
  }

  function regenerate(index: number) {
    setReports((prev) =>
      prev.map((r, i) => (i === index ? { ...r, pdfUri: null, videoUris: [], error: null } : r)),
    );
    generateReport(index);
  }

  async function handleShare(index: number) {
    const pr = reports[index];
    if (!pr?.pdfUri) {
      await generateReport(index);
      return;
    }
    setSharing(true);
    setShareError(null);
    try {
      if (pr.videoUris.length > 0) {
        await shareBundle(pr.pdfUri, pr.videoUris);
      } else {
        await sharePdf(pr.pdfUri);
      }
    } catch (err) {
      setShareError(String(err));
    } finally {
      setSharing(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const currentReport = reports[selectedIndex];

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.backgroundElement }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ThemedText style={styles.backBtn}>← Back</ThemedText>
        </Pressable>
        <ThemedText type="subtitle">Report</ThemedText>
        <Pressable onPress={() => router.replace('/(tabs)/' as any)} hitSlop={12}>
          <ThemedText style={styles.homeBtn}>⌂</ThemedText>
        </Pressable>
      </View>

      {reports.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.productTabs}
          style={[styles.productTabsRow, { borderBottomColor: theme.backgroundElement }]}>
          {reports.map((r, i) => (
            <Pressable
              key={r.product.id}
              onPress={() => setSelectedIndex(i)}
              style={[
                styles.productTab,
                {
                  backgroundColor: i === selectedIndex ? '#3c87f722' : theme.backgroundElement,
                  borderColor: i === selectedIndex ? '#3c87f7' : 'transparent',
                },
              ]}>
              <ThemedText
                type="small"
                style={[styles.productTabText, i === selectedIndex && { color: '#3c87f7' }]}
                numberOfLines={1}>
                {r.product.name}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={{ padding: Spacing.three, paddingBottom: 140 + BottomTabInset }}>
        {currentReport && (
          <View style={[styles.reportCard, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" style={styles.productName}>
              {currentReport.product.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              ID: {currentReport.product.id}
            </ThemedText>
            {currentReport.pdfUri && (
              <View style={styles.readyRow}>
                <ThemedText style={styles.readyIcon}>✅</ThemedText>
                <ThemedText type="small" style={{ color: '#27ae60' }}>
                  PDF ready
                </ThemedText>
              </View>
            )}
            {currentReport.error && (
              <ThemedText type="small" style={{ color: '#e74c3c' }}>
                Error: {currentReport.error}
              </ThemedText>
            )}
          </View>
        )}
        {shareError && (
          <ThemedText type="small" style={{ color: '#e74c3c', marginBottom: Spacing.two }}>
            Share error: {shareError}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          The PDF will include all inspection results, reference values, pass/fail status, notes, and attached photos.
        </ThemedText>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { backgroundColor: theme.background, borderTopColor: theme.backgroundElement, paddingBottom: BottomTabInset + Spacing.two },
        ]}>
        {currentReport?.generating ? (
          <View style={styles.generatingRow}>
            <ActivityIndicator color="#3c87f7" />
            <ThemedText type="small" themeColor="textSecondary">
              Generating PDF…
            </ThemedText>
          </View>
        ) : (
          <View style={styles.btnColumn}>
            <Pressable
              onPress={() => handleShare(selectedIndex)}
              disabled={sharing}
              style={[styles.shareBtn, { opacity: sharing ? 0.7 : 1 }]}>
              <ThemedText style={styles.shareBtnText}>
                {!currentReport?.pdfUri
                  ? '⬆ Generate & Share Report'
                  : currentReport.videoUris.length > 0
                    ? `⬆ Share Report (PDF + ${currentReport.videoUris.length} video${currentReport.videoUris.length > 1 ? 's' : ''})`
                    : '⬆ Share PDF'}
              </ThemedText>
            </Pressable>
            {currentReport?.pdfUri && (
              <Pressable
                onPress={() => regenerate(selectedIndex)}
                style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>
                  ↺ Regenerate PDF
                </ThemedText>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push({ pathname: '/inspection/[id]/template', params: { id } })}
              style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>
                ✏ Edit
              </ThemedText>
            </Pressable>
          </View>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { color: '#3c87f7', fontSize: 15, width: 60 },
  homeBtn: { color: '#3c87f7', fontSize: 20, width: 48, textAlign: 'right' },
  productTabsRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  productTabs: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  productTab: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    maxWidth: 160,
  },
  productTabText: { fontWeight: '600' },
  reportCard: {
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    gap: 6,
  },
  productName: { fontWeight: '700', fontSize: 16 },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  readyIcon: { fontSize: 18 },
  note: { textAlign: 'center', lineHeight: 20 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btnColumn: { gap: Spacing.two },
  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
  },
  shareBtn: {
    backgroundColor: '#3c87f7',
    borderRadius: 12,
    padding: Spacing.two + 2,
    alignItems: 'center',
  },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    borderRadius: 12,
    padding: Spacing.two,
    alignItems: 'center',
  },
  secondaryBtnText: { fontWeight: '600', fontSize: 14 },
});
