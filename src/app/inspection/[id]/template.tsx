import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';

import { AttributeRow } from '@/components/inspection/attribute-row';
import { InspectionPointRow } from '@/components/inspection/inspection-point-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSQLiteContext } from '@/db';
import { useInspections } from '@/hooks/use-inspections';
import { useTheme } from '@/hooks/use-theme';
import { pickPhoto, takePhoto } from '@/services/photo-service';
import type { ColumnConfig, Inspection, InspectionPointConfig, InspectionResult, Product, ProductInspectionPoint, Severity } from '@/types';

interface AttributeItem {
  kind: 'attribute';
  key: string;
  columnKey: string;
  label: string;
  referenceValue: string | number | undefined;
  isNumeric: boolean;
  tolerance?: ColumnConfig['tolerance'];
  productId: string;
  pointKey: string;
}

interface PointItem {
  kind: 'point';
  key: string;
  text: string;
  severity: Severity;
  productId: string;
  pointKey: string;
  photoNumber: number;
}

type SectionItem = AttributeItem | PointItem;

interface Section {
  title: string;
  productId: string;
  data: SectionItem[];
}

interface ResultEntry {
  passed: boolean;
  value?: string;
  note?: string;
  photoUris: string[];
}

async function loadTemplateData(db: ReturnType<typeof useSQLiteContext>, inspectionId: string) {
  const inspRow = await db.getFirstAsync<{
    id: string; date: string; units_inspected: number; batch_size: number; status: string;
  }>('SELECT * FROM inspections WHERE id = ?', [inspectionId]);

  if (!inspRow) return null;

  const productIdRows = await db.getAllAsync<{ product_id: string }>(
    'SELECT product_id FROM inspection_products WHERE inspection_id = ?',
    [inspectionId],
  );
  const productIds = productIdRows.map((r) => r.product_id);

  const products: Product[] = [];
  for (const pid of productIds) {
    const p = await db.getFirstAsync<{ id: string; name: string; attributes: string }>(
      'SELECT * FROM products WHERE id = ?',
      [pid],
    );
    if (p) products.push({ id: p.id, name: p.name, attributes: JSON.parse(p.attributes) });
  }

  const colRows = await db.getAllAsync<{
    key: string; label: string; is_numeric: number; tolerance_type: string | null; tolerance_value: number | null;
  }>('SELECT * FROM column_configs WHERE visible = 1 ORDER BY label');
  const columns: ColumnConfig[] = colRows.map((r) => ({
    key: r.key,
    label: r.label,
    visible: true,
    isNumeric: r.is_numeric === 1,
    tolerance: r.tolerance_type && r.tolerance_value != null
      ? { type: r.tolerance_type as 'absolute' | 'percent', value: r.tolerance_value }
      : undefined,
  }));

  const ipConfigRows = await db.getAllAsync<{ text: string; severity: string }>(
    'SELECT * FROM inspection_point_configs',
  );
  const ipConfigs: InspectionPointConfig[] = ipConfigRows.map((r) => ({
    text: r.text,
    severity: r.severity as Severity,
  }));
  const ipConfigMap = new Map(ipConfigs.map((c) => [c.text, c.severity]));

  const pointsByProduct = new Map<string, ProductInspectionPoint[]>();
  for (const pid of productIds) {
    const rows = await db.getAllAsync<{ point_index: number; point_text: string }>(
      'SELECT point_index, point_text FROM product_inspection_points WHERE product_id = ? ORDER BY point_index',
      [pid],
    );
    pointsByProduct.set(pid, rows.map((r) => ({ productId: pid, pointIndex: r.point_index, pointText: r.point_text })));
  }

  const resultRows = await db.getAllAsync<{
    product_id: string; point_key: string; type: string; value: string | null;
    passed: number; note: string | null; photo_uris: string;
  }>('SELECT * FROM inspection_results WHERE inspection_id = ?', [inspectionId]);

  const existingResults = new Map<string, ResultEntry>();
  for (const r of resultRows) {
    const mapKey = `${r.product_id}:${r.point_key}`;
    existingResults.set(mapKey, {
      passed: r.passed === 1,
      value: r.value ?? undefined,
      note: r.note ?? undefined,
      photoUris: JSON.parse(r.photo_uris || '[]'),
    });
  }

  return {
    inspection: {
      id: inspRow.id,
      date: inspRow.date,
      productIds,
      unitsInspected: inspRow.units_inspected,
      batchSize: inspRow.batch_size,
      status: inspRow.status as Inspection['status'],
    },
    products,
    columns,
    pointsByProduct,
    ipConfigMap,
    existingResults,
  };
}

export default function TemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const db = useSQLiteContext();
  const { upsertResult } = useInspections();

  const [loading, setLoading] = useState(true);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [filledCount, setFilledCount] = useState(0);

  // Global photo counter for cross-referencing in PDF
  const photoCounterRef = useRef(1);
  const photoCountersMap = useRef<Map<string, number>>(new Map()); // `productId:pointKey` → first photo number

  const resultsRef = useRef<Map<string, ResultEntry>>(new Map());
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const [, forceUpdate] = useState(0);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const data = await loadTemplateData(db, id);
      if (!data) return;

      setInspection(data.inspection);

      // Pre-populate results ref
      resultsRef.current = new Map(data.existingResults);

      // Build sections
      const built: Section[] = [];
      let photoNum = 1;
      let total = 0;

      for (const product of data.products) {
        const points = data.pointsByProduct.get(product.id) ?? [];
        const items: SectionItem[] = [];

        for (const col of data.columns) {
          const pointKey = `attr:${col.key}`;
          const mapKey = `${product.id}:${pointKey}`;
          const existing = data.existingResults.get(mapKey);
          const photoUris = existing?.photoUris ?? [];
          if (photoUris.length > 0) {
            photoCountersMap.current.set(mapKey, photoNum);
            photoNum += photoUris.length;
          }
          items.push({
            kind: 'attribute',
            key: mapKey,
            columnKey: col.key,
            label: col.label,
            referenceValue: product.attributes[col.key],
            isNumeric: col.isNumeric,
            tolerance: col.tolerance,
            productId: product.id,
            pointKey,
          });
          total++;
        }

        for (const pip of points) {
          const pointKey = `ip:${pip.pointIndex}`;
          const mapKey = `${product.id}:${pointKey}`;
          const existing = data.existingResults.get(mapKey);
          const photoUris = existing?.photoUris ?? [];
          if (photoUris.length > 0) {
            photoCountersMap.current.set(mapKey, photoNum);
            photoNum += photoUris.length;
          }
          const severity = data.ipConfigMap.get(pip.pointText) ?? ('minor' as Severity);
          items.push({
            kind: 'point',
            key: mapKey,
            text: pip.pointText,
            severity,
            productId: product.id,
            pointKey,
            photoNumber: photoCountersMap.current.get(mapKey) ?? photoNum,
          });
          total++;
        }

        built.push({ title: product.name, productId: product.id, data: items });
      }

      photoCounterRef.current = photoNum;
      setSections(built);
      setTotalItems(total);
      setFilledCount(data.existingResults.size);
    } finally {
      setLoading(false);
    }
  }

  function getEntry(productId: string, pointKey: string): ResultEntry {
    return resultsRef.current.get(`${productId}:${pointKey}`) ?? {
      passed: false,
      photoUris: [],
    };
  }

  function scheduleSave(productId: string, pointKey: string, entry: ResultEntry, immediate = false) {
    const mapKey = `${productId}:${pointKey}`;
    resultsRef.current.set(mapKey, entry);

    const existing = saveTimers.current.get(mapKey);
    if (existing) clearTimeout(existing);

    const delay = immediate ? 0 : 400;
    const timer = setTimeout(async () => {
      await upsertResult({
        inspectionId: id,
        productId,
        pointKey,
        type: pointKey.startsWith('attr:') ? 'attribute' : 'inspection_point',
        value: entry.value,
        passed: entry.passed,
        note: entry.note,
        photoUris: entry.photoUris,
      });
      setFilledCount(resultsRef.current.size);
    }, delay);

    saveTimers.current.set(mapKey, timer);
  }

  async function handleAddPhoto(productId: string, pointKey: string) {
    const entry = getEntry(productId, pointKey);
    const uri = await takePhoto(id, pointKey);
    if (!uri) return;
    const updated: ResultEntry = { ...entry, photoUris: [...entry.photoUris, uri] };
    scheduleSave(productId, pointKey, updated, true);
    forceUpdate((n) => n + 1);
  }

  function handleRemovePhoto(productId: string, pointKey: string, uri: string) {
    const entry = getEntry(productId, pointKey);
    const updated: ResultEntry = { ...entry, photoUris: entry.photoUris.filter((u) => u !== uri) };
    scheduleSave(productId, pointKey, updated, true);
    forceUpdate((n) => n + 1);
  }

  const renderItem = useCallback(({ item }: { item: SectionItem }) => {
    const entry = getEntry(item.productId, item.pointKey);

    if (item.kind === 'attribute') {
      return (
        <AttributeRow
          column={{ key: item.columnKey, label: item.label, visible: true, isNumeric: item.isNumeric, tolerance: item.tolerance }}
          referenceValue={item.referenceValue}
          initialValue={entry.value ?? ''}
          initialPassed={entry.passed}
          photoUris={entry.photoUris}
          onChangeValue={(value, passed) => {
            scheduleSave(item.productId, item.pointKey, { ...entry, value, passed });
          }}
          onAddPhoto={() => handleAddPhoto(item.productId, item.pointKey)}
          onRemovePhoto={(uri) => handleRemovePhoto(item.productId, item.pointKey, uri)}
        />
      );
    }

    return (
      <InspectionPointRow
        text={item.text}
        severity={item.severity}
        photoNumber={item.photoNumber}
        initialPassed={entry.passed ?? null}
        initialNote={entry.note ?? ''}
        photoUris={entry.photoUris}
        onToggle={(passed) => {
          scheduleSave(item.productId, item.pointKey, { ...entry, passed }, true);
        }}
        onNoteChange={(note) => {
          scheduleSave(item.productId, item.pointKey, { ...entry, note });
        }}
        onAddPhoto={() => handleAddPhoto(item.productId, item.pointKey)}
        onRemovePhoto={(uri) => handleRemovePhoto(item.productId, item.pointKey, uri)}
      />
    );
  }, []);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!inspection) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Inspection not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.backgroundElement }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ThemedText style={styles.backBtn}>← Back</ThemedText>
        </Pressable>
        <View style={styles.headerCenter}>
          <ThemedText type="small" style={styles.headerTitle}>
            Inspection
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {filledCount}/{totalItems} filled
          </ThemedText>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/inspection/[id]/review', params: { id } })}
          style={styles.reviewBtn}>
          <ThemedText style={styles.reviewBtnText}>Review →</ThemedText>
        </Pressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        stickySectionHeadersEnabled
        removeClippedSubviews
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
            <ThemedText type="small" style={styles.sectionTitle}>
              {section.title}
            </ThemedText>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.four }}
      />
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
  backBtn: { color: '#3c87f7', fontSize: 15 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontWeight: '700' },
  reviewBtn: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  reviewBtnText: { color: '#3c87f7', fontWeight: '700', fontSize: 15 },
  sectionHeader: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  sectionTitle: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
