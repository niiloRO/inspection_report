import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { takePhoto } from '@/services/photo-service';
import type { ColumnConfig, GlobalInspectionPoint, Group, Inspection, InspectionPointConfig, Product, ProductInspectionPoint, Severity } from '@/types';

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
  severity: Severity;
  group?: string;
  instructions?: string;
  groupKey: string;
  itemType: 'attribute' | 'global_inspection_point';
}

interface PointItem {
  kind: 'point';
  key: string;
  text: string;
  productId: string;
  pointKey: string;
  photoNumber: number;
  groupKey: string;
}

interface GroupHeaderItem {
  kind: 'group-header';
  key: string;
  label: string;
  productId: string;
  pointKey: string;
  groupKey: string;
}

type SectionItem = AttributeItem | PointItem | GroupHeaderItem;

interface Section {
  title: string;
  productId: string;
  data: SectionItem[];
}

interface ResultEntry {
  passed: boolean | null;
  value?: string;
  note?: string;
  sampleSize?: string;
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
    key: string; label: string; is_numeric: number; tolerance_type: string | null;
    tolerance_value: number | null; group_name: string | null; severity: string;
    instructions: string | null; sort_order: number;
  }>('SELECT * FROM column_configs WHERE visible = 1 ORDER BY sort_order');
  const columns: ColumnConfig[] = colRows.map((r) => ({
    key: r.key,
    label: r.label,
    visible: true,
    isNumeric: r.is_numeric === 1,
    severity: r.severity as Severity,
    group: r.group_name ?? undefined,
    tolerance: r.tolerance_type && r.tolerance_value != null
      ? { type: r.tolerance_type as 'absolute' | 'percent', value: r.tolerance_value }
      : undefined,
    instructions: r.instructions ?? undefined,
    sortOrder: r.sort_order,
  }));

  const gipRows = await db.getAllAsync<{
    key: string; label: string; is_numeric: number; tolerance_type: string | null;
    tolerance_value: number | null; group_name: string | null; severity: string;
    instructions: string | null; sort_order: number;
  }>('SELECT * FROM global_inspection_points WHERE visible = 1 ORDER BY sort_order');
  const globalInspectionPoints: GlobalInspectionPoint[] = gipRows.map((r) => ({
    key: r.key,
    label: r.label,
    visible: true,
    isNumeric: r.is_numeric === 1,
    severity: r.severity as Severity,
    group: r.group_name ?? undefined,
    tolerance: r.tolerance_type && r.tolerance_value != null
      ? { type: r.tolerance_type as 'absolute' | 'percent', value: r.tolerance_value }
      : undefined,
    instructions: r.instructions ?? undefined,
    sortOrder: r.sort_order,
  }));

  const groupRows = await db.getAllAsync<{ name: string; sort_order: number }>(
    'SELECT name, sort_order FROM groups ORDER BY sort_order',
  );
  const groups: Group[] = groupRows.map((r) => ({ name: r.name, sortOrder: r.sort_order }));

  const ipConfigRows = await db.getAllAsync<{ text: string }>(
    'SELECT text FROM inspection_point_configs',
  );
  const ipConfigs: InspectionPointConfig[] = ipConfigRows.map((r) => ({ text: r.text }));
  const ipConfigSet = new Set(ipConfigs.map((c) => c.text));

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
    passed: number; note: string | null; photo_uris: string; sample_size: string | null;
  }>('SELECT * FROM inspection_results WHERE inspection_id = ?', [inspectionId]);

  const existingResults = new Map<string, ResultEntry>();
  for (const r of resultRows) {
    const mapKey = `${r.product_id}:${r.point_key}`;
    existingResults.set(mapKey, {
      passed: r.passed === 1,
      value: r.value ?? undefined,
      note: r.note ?? undefined,
      sampleSize: r.sample_size ?? undefined,
      photoUris: JSON.parse(r.photo_uris || '[]'),
    });
  }

  const unitsRows = await db.getAllAsync<{ product_id: string; units_inspected: number }>(
    'SELECT product_id, units_inspected FROM inspection_products WHERE inspection_id = ?',
    [inspectionId],
  );
  const defaultSampleSizes = new Map(
    unitsRows.map((r) => [r.product_id, r.units_inspected > 0 ? String(r.units_inspected) : '']),
  );

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
    globalInspectionPoints,
    groups,
    pointsByProduct,
    ipConfigSet,
    existingResults,
    defaultSampleSizes,
  };
}

export default function TemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const db = useSQLiteContext();
  const { upsertResult, deleteResult } = useInspections();

  const [loading, setLoading] = useState(true);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [filledCount, setFilledCount] = useState(0);
  const [collapsedProducts, setCollapsedProducts] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const photoCounterRef = useRef(1);
  const photoCountersMap = useRef<Map<string, number>>(new Map());

  const resultsRef = useRef<Map<string, ResultEntry>>(new Map());
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const defaultSampleSizesRef = useRef<Map<string, string>>(new Map());

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
      resultsRef.current = new Map(data.existingResults);
      defaultSampleSizesRef.current = data.defaultSampleSizes;

      const built: Section[] = [];
      let photoNum = 1;
      let total = 0;
      const hasNamedGroups = data.groups.length > 0;

      for (const product of data.products) {
        const points = data.pointsByProduct.get(product.id) ?? [];
        const items: SectionItem[] = [];

        // Group column_configs by group_name
        const groupedCols = new Map<string | null, ColumnConfig[]>();
        for (const col of data.columns) {
          const g = col.group ?? null;
          if (!groupedCols.has(g)) groupedCols.set(g, []);
          groupedCols.get(g)!.push(col);
        }

        // Group global_inspection_points by group_name
        const groupedGips = new Map<string | null, GlobalInspectionPoint[]>();
        for (const gip of data.globalInspectionPoints) {
          const g = gip.group ?? null;
          if (!groupedGips.has(g)) groupedGips.set(g, []);
          groupedGips.get(g)!.push(gip);
        }

        function addAttrItem(col: ColumnConfig, groupKey: string, itemType: 'attribute' | 'global_inspection_point' = 'attribute') {
          const pointKey = itemType === 'global_inspection_point' ? `gip:${col.key}` : `attr:${col.key}`;
          const mapKey = `${product.id}:${pointKey}`;
          const existing = data!.existingResults.get(mapKey);
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
            referenceValue: itemType === 'attribute' ? product.attributes[col.key] : undefined,
            isNumeric: col.isNumeric,
            tolerance: col.tolerance,
            productId: product.id,
            pointKey,
            severity: col.severity,
            group: col.group,
            instructions: col.instructions,
            groupKey,
            itemType,
          });
          total++;
        }

        // Emit named groups in sort order — merge column_configs and gips
        for (const group of data.groups) {
          const cols = groupedCols.get(group.name) ?? [];
          const gips = groupedGips.get(group.name) ?? [];
          if (cols.length === 0 && gips.length === 0) continue;
          const gk = `${product.id}::${group.name}`;
          items.push({
            kind: 'group-header',
            key: `${product.id}:gh:${group.name}`,
            label: group.name,
            productId: product.id,
            pointKey: `gh:${group.name}`,
            groupKey: gk,
          });
          for (const col of cols) addAttrItem(col, gk, 'attribute');
          for (const gip of gips) addAttrItem(gip, gk, 'global_inspection_point');
        }

        // Emit ungrouped column_configs
        const ungrouped = groupedCols.get(null) ?? [];
        if (ungrouped.length > 0) {
          const ugk = `${product.id}::ungrouped`;
          if (hasNamedGroups) {
            items.push({
              kind: 'group-header',
              key: `${product.id}:gh:other`,
              label: 'Other',
              productId: product.id,
              pointKey: 'gh:other',
              groupKey: ugk,
            });
          }
          for (const col of ungrouped) addAttrItem(col, hasNamedGroups ? ugk : `${product.id}::all`, 'attribute');
        }

        // Emit ungrouped global inspection points under their own sub-header
        const ungroupedGips = groupedGips.get(null) ?? [];
        if (ungroupedGips.length > 0) {
          const gipGroupKey = `${product.id}::global_inspection_points`;
          items.push({
            kind: 'group-header',
            key: `${product.id}:gh:global_inspection_points`,
            label: 'Global Inspection Points',
            productId: product.id,
            pointKey: 'gh:global_inspection_points',
            groupKey: gipGroupKey,
          });
          for (const gip of ungroupedGips) addAttrItem(gip, gipGroupKey, 'global_inspection_point');
        }

        // Inspection points — with collapsible header
        const ipGroupKey = `${product.id}::inspection_points`;
        if (points.length > 0) {
          items.push({
            kind: 'group-header',
            key: `${product.id}:gh:inspection_points`,
            label: 'Inspection Points',
            productId: product.id,
            pointKey: 'gh:inspection_points',
            groupKey: ipGroupKey,
          });
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
          items.push({
            kind: 'point',
            key: mapKey,
            text: pip.pointText,
            productId: product.id,
            pointKey,
            photoNumber: photoCountersMap.current.get(mapKey) ?? photoNum,
            groupKey: ipGroupKey,
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
      passed: null,
      photoUris: [],
      sampleSize: defaultSampleSizesRef.current.get(productId),
    };
  }

  function resolveType(pointKey: string): 'attribute' | 'inspection_point' | 'global_inspection_point' {
    if (pointKey.startsWith('attr:')) return 'attribute';
    if (pointKey.startsWith('gip:')) return 'global_inspection_point';
    return 'inspection_point';
  }

  async function flushPendingSaves() {
    const pendingKeys = Array.from(saveTimers.current.keys());
    for (const timerId of saveTimers.current.values()) clearTimeout(timerId);
    saveTimers.current.clear();
    for (const mapKey of pendingKeys) {
      let splitIdx = -1;
      for (const prefix of [':attr:', ':gip:', ':ip:']) {
        const idx = mapKey.indexOf(prefix);
        if (idx >= 0 && (splitIdx === -1 || idx < splitIdx)) splitIdx = idx;
      }
      if (splitIdx === -1) continue;
      const productId = mapKey.slice(0, splitIdx);
      const pointKey = mapKey.slice(splitIdx + 1);
      const entry = resultsRef.current.get(mapKey);
      if (entry) {
        await upsertResult({
          inspectionId: id,
          productId,
          pointKey,
          type: resolveType(pointKey),
          value: entry.value,
          passed: entry.passed ?? false,
          note: entry.note,
          sampleSize: entry.sampleSize,
          photoUris: entry.photoUris,
        });
      } else {
        await deleteResult(id, productId, pointKey);
      }
    }
    if (pendingKeys.length > 0) setFilledCount(resultsRef.current.size);
  }

  function scheduleSave(productId: string, pointKey: string, entry: ResultEntry, immediate = false) {
    const mapKey = `${productId}:${pointKey}`;

    const existing = saveTimers.current.get(mapKey);
    if (existing) clearTimeout(existing);

    // A sample size that equals the default doesn't count as user input for N/A detection
    const defaultSS = defaultSampleSizesRef.current.get(productId);
    const hasUserSampleSize = !!entry.sampleSize && entry.sampleSize !== defaultSS;
    const isEmpty = entry.passed === null && !entry.value && !entry.note && !hasUserSampleSize && entry.photoUris.length === 0;
    if (isEmpty) {
      resultsRef.current.delete(mapKey);
      const timer = setTimeout(async () => {
        await deleteResult(id, productId, pointKey);
        setFilledCount(resultsRef.current.size);
      }, immediate ? 0 : 400);
      saveTimers.current.set(mapKey, timer);
      return;
    }

    resultsRef.current.set(mapKey, entry);

    const delay = immediate ? 0 : 400;
    const timer = setTimeout(async () => {
      await upsertResult({
        inspectionId: id,
        productId,
        pointKey,
        type: resolveType(pointKey),
        value: entry.value,
        passed: entry.passed ?? false,
        note: entry.note,
        sampleSize: entry.sampleSize,
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

  function toggleProduct(productId: string) {
    setCollapsedProducts((prev) => {
      const n = new Set(prev);
      n.has(productId) ? n.delete(productId) : n.add(productId);
      return n;
    });
  }

  function toggleGroup(groupKey: string) {
    setCollapsedGroups((prev) => {
      const n = new Set(prev);
      n.has(groupKey) ? n.delete(groupKey) : n.add(groupKey);
      return n;
    });
  }

  const renderItem = useCallback(({ item }: { item: SectionItem }) => {
    if (collapsedProducts.has(item.productId)) return null;

    if (item.kind === 'group-header') {
      const isCollapsed = collapsedGroups.has(item.groupKey);
      return (
        <Pressable
          style={[styles.groupSubHeader, { backgroundColor: theme.backgroundElement }]}
          onPress={() => toggleGroup(item.groupKey)}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.groupSubTitle}>
            {item.label}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.groupChevron}>
            {isCollapsed ? '▶' : '▼'}
          </ThemedText>
        </Pressable>
      );
    }

    if (collapsedGroups.has(item.groupKey)) return null;

    const entry = getEntry(item.productId, item.pointKey);

    if (item.kind === 'attribute') {
      return (
        <AttributeRow
          column={{ key: item.columnKey, label: item.label, visible: true, isNumeric: item.isNumeric, tolerance: item.tolerance, severity: item.severity, sortOrder: 0 }}
          referenceValue={item.referenceValue}
          initialValue={entry.value ?? ''}
          initialPassed={entry.passed ?? null}
          initialNote={entry.note ?? ''}
          initialSampleSize={entry.sampleSize ?? ''}
          photoUris={entry.photoUris}
          instructions={item.instructions}
          onChangeValue={(value, passed) => {
            scheduleSave(item.productId, item.pointKey, { ...entry, value, passed });
          }}
          onToggle={(passed) => {
            scheduleSave(item.productId, item.pointKey, { ...entry, passed }, true);
          }}
          onNoteChange={(note) => {
            scheduleSave(item.productId, item.pointKey, { ...entry, note });
          }}
          onSampleSizeChange={(sampleSize) => {
            scheduleSave(item.productId, item.pointKey, { ...entry, sampleSize });
          }}
          onAddPhoto={() => handleAddPhoto(item.productId, item.pointKey)}
          onRemovePhoto={(uri) => handleRemovePhoto(item.productId, item.pointKey, uri)}
        />
      );
    }

    return (
      <InspectionPointRow
        text={item.text}
        photoNumber={item.photoNumber}
        initialPassed={entry.passed ?? null}
        initialNote={entry.note ?? ''}
        initialSampleSize={entry.sampleSize ?? ''}
        photoUris={entry.photoUris}
        onToggle={(passed) => {
          scheduleSave(item.productId, item.pointKey, { ...entry, passed }, true);
        }}
        onNoteChange={(note) => {
          scheduleSave(item.productId, item.pointKey, { ...entry, note });
        }}
        onSampleSizeChange={(sampleSize) => {
          scheduleSave(item.productId, item.pointKey, { ...entry, sampleSize });
        }}
        onAddPhoto={() => handleAddPhoto(item.productId, item.pointKey)}
        onRemovePhoto={(uri) => handleRemovePhoto(item.productId, item.pointKey, uri)}
      />
    );
  }, [theme, collapsedProducts, collapsedGroups]);

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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { borderBottomColor: theme.backgroundElement }]}>
        <Pressable onPress={async () => { await flushPendingSaves(); router.back(); }} hitSlop={12}>
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
        <View style={styles.headerRight}>
          <Pressable
            onPress={async () => { await flushPendingSaves(); router.push({ pathname: '/inspection/[id]/review', params: { id } }); }}
            style={styles.reviewBtn}>
            <ThemedText style={styles.reviewBtnText}>Review →</ThemedText>
          </Pressable>
          <Pressable onPress={async () => { await flushPendingSaves(); router.replace('/(tabs)/' as any); }} hitSlop={12}>
            <ThemedText style={styles.homeBtnText}>⌂</ThemedText>
          </Pressable>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        stickySectionHeadersEnabled
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        renderSectionHeader={({ section }) => {
          const isCollapsed = collapsedProducts.has(section.productId);
          return (
            <Pressable
              style={[styles.sectionHeader, { backgroundColor: theme.background, borderTopColor: theme.backgroundElement }]}
              onPress={() => toggleProduct(section.productId)}>
              <ThemedText style={styles.sectionTitle}>
                {section.title}
              </ThemedText>
              <ThemedText style={styles.sectionChevron}>
                {isCollapsed ? '▶' : '▼'}
              </ThemedText>
            </Pressable>
          );
        }}
        contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.four }}
      />
      </KeyboardAvoidingView>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewBtn: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  reviewBtnText: { color: '#3c87f7', fontWeight: '700', fontSize: 15 },
  homeBtnText: { color: '#3c87f7', fontSize: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 18,
    flex: 1,
  },
  sectionChevron: {
    fontSize: 14,
    color: '#888',
    marginLeft: Spacing.two,
  },
  groupSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
  },
  groupSubTitle: {
    fontWeight: '600',
    letterSpacing: 0.3,
    fontSize: 11,
    textTransform: 'uppercase',
    flex: 1,
  },
  groupChevron: {
    fontSize: 11,
    color: '#888',
  },
});
