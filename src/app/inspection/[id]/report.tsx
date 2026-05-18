import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSQLiteContext } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import { generateProductReport, sharePdf } from '@/services/pdf-generator';
import type { ColumnConfig, Inspection, InspectionPointConfig, InspectionResult, Product, Severity } from '@/types';

interface ProductReport {
  product: Product;
  pdfUri: string | null;
  generating: boolean;
  error: string | null;
}

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const db = useSQLiteContext();

  const [loading, setLoading] = useState(true);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [reports, setReports] = useState<ProductReport[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const inspRow = await db.getFirstAsync<{
        id: string; date: string; units_inspected: number; batch_size: number; status: string;
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

      const insp: Inspection = {
        id: inspRow.id,
        date: inspRow.date,
        productIds,
        unitsInspected: inspRow.units_inspected,
        batchSize: inspRow.batch_size,
        status: inspRow.status as Inspection['status'],
      };
      setInspection(insp);
      setReports(products.map((p) => ({ product: p, pdfUri: null, generating: false, error: null })));
    } finally {
      setLoading(false);
    }
  }

  async function generateReport(index: number) {
    if (!inspection) return;
    const pr = reports[index];
    if (!pr || pr.generating || pr.pdfUri) return;

    setReports((prev) =>
      prev.map((r, i) => (i === index ? { ...r, generating: true, error: null } : r)),
    );

    try {
      const colRows = await db.getAllAsync<{
        key: string; label: string; visible: number; is_numeric: number;
        tolerance_type: string | null; tolerance_value: number | null;
      }>('SELECT * FROM column_configs WHERE visible = 1');
      const columnConfigs: ColumnConfig[] = colRows.map((r) => ({
        key: r.key, label: r.label, visible: true, isNumeric: r.is_numeric === 1,
        tolerance: r.tolerance_type && r.tolerance_value != null
          ? { type: r.tolerance_type as 'absolute' | 'percent', value: r.tolerance_value }
          : undefined,
      }));

      const ipConfigRows = await db.getAllAsync<{ text: string; severity: string }>(
        'SELECT * FROM inspection_point_configs',
      );
      const inspectionPointConfigs: InspectionPointConfig[] = ipConfigRows.map((r) => ({
        text: r.text, severity: r.severity as Severity,
      }));

      const resultRows = await db.getAllAsync<{
        id: string; inspection_id: string; product_id: string; point_key: string; type: string;
        value: string | null; passed: number; note: string | null; photo_uris: string;
      }>('SELECT * FROM inspection_results WHERE inspection_id = ?', [id]);

      // For inspection points, replace pointKey with text for display
      const ipTextRows = await db.getAllAsync<{ product_id: string; point_index: number; point_text: string }>(
        'SELECT * FROM product_inspection_points WHERE product_id = ?',
        [pr.product.id],
      );
      const ipTextMap = new Map(ipTextRows.map((r) => [`ip:${r.point_index}`, r.point_text]));

      const results: InspectionResult[] = resultRows.map((r) => {
        let pointKey = r.point_key;
        if (r.type === 'inspection_point' && ipTextMap.has(r.point_key)) {
          pointKey = ipTextMap.get(r.point_key)!;
        }
        return {
          id: r.id,
          inspectionId: r.inspection_id,
          productId: r.product_id,
          pointKey,
          type: r.type as 'attribute' | 'inspection_point',
          value: r.value ?? undefined,
          passed: r.passed === 1,
          note: r.note ?? undefined,
          photoUris: JSON.parse(r.photo_uris || '[]'),
        };
      });

      const pdfUri = await generateProductReport({
        inspection,
        product: pr.product,
        results,
        columnConfigs,
        inspectionPointConfigs,
      });

      setReports((prev) =>
        prev.map((r, i) => (i === index ? { ...r, pdfUri, generating: false } : r)),
      );
    } catch (err) {
      setReports((prev) =>
        prev.map((r, i) =>
          i === index ? { ...r, generating: false, error: String(err) } : r,
        ),
      );
    }
  }

  async function handleShare(index: number) {
    const pr = reports[index];
    if (!pr?.pdfUri) {
      await generateReport(index);
      return;
    }
    setSharing(true);
    try {
      await sharePdf(pr.pdfUri);
    } catch (err) {
      // error handled by OS share sheet
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
        <View style={{ width: 60 }} />
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
        contentContainerStyle={{ padding: Spacing.three, paddingBottom: 120 + BottomTabInset }}>
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
          <Pressable
            onPress={() => handleShare(selectedIndex)}
            disabled={sharing}
            style={[styles.shareBtn, { opacity: sharing ? 0.7 : 1 }]}>
            <ThemedText style={styles.shareBtnText}>
              {currentReport?.pdfUri ? '⬆ Share PDF' : '⬆ Generate & Share PDF'}
            </ThemedText>
          </Pressable>
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
});
