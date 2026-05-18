import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { SeverityBadge } from '@/components/inspection/severity-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSQLiteContext } from '@/db';
import { useInspections } from '@/hooks/use-inspections';
import { useTheme } from '@/hooks/use-theme';
import type { Inspection, InspectionResult, Severity } from '@/types';

interface FailedItem {
  label: string;
  severity: Severity;
  productName: string;
  note?: string;
}

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const db = useSQLiteContext();
  const { completeInspection } = useInspections();

  const [loading, setLoading] = useState(true);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [passedCount, setPassedCount] = useState(0);
  const [failedItems, setFailedItems] = useState<FailedItem[]>([]);
  const [completing, setCompleting] = useState(false);

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

      const productNames = new Map<string, string>();
      for (const pid of productIds) {
        const p = await db.getFirstAsync<{ name: string }>('SELECT name FROM products WHERE id = ?', [pid]);
        if (p) productNames.set(pid, p.name);
      }

      const resultRows = await db.getAllAsync<{
        product_id: string; point_key: string; type: string; passed: number; note: string | null;
      }>('SELECT * FROM inspection_results WHERE inspection_id = ?', [id]);

      const ipConfigRows = await db.getAllAsync<{ text: string; severity: string }>(
        'SELECT * FROM inspection_point_configs',
      );
      const ipConfigMap = new Map(ipConfigRows.map((r) => [r.text, r.severity as Severity]));

      const colRows = await db.getAllAsync<{ key: string; label: string }>(
        'SELECT key, label FROM column_configs WHERE visible = 1',
      );
      const colMap = new Map(colRows.map((r) => [r.key, r.label]));

      const ipTextRows = await db.getAllAsync<{ product_id: string; point_index: number; point_text: string }>(
        'SELECT * FROM product_inspection_points',
      );
      const ipTextMap = new Map(
        ipTextRows.map((r) => [`${r.product_id}:ip:${r.point_index}`, r.point_text]),
      );

      let total = 0;
      let passed = 0;
      const failures: FailedItem[] = [];

      for (const r of resultRows) {
        total++;
        if (r.passed === 1) {
          passed++;
        } else {
          let label = r.point_key;
          let severity: Severity = 'minor';

          if (r.type === 'attribute') {
            const colKey = r.point_key.replace('attr:', '');
            label = colMap.get(colKey) ?? colKey;
          } else {
            const text = ipTextMap.get(`${r.product_id}:${r.point_key}`);
            if (text) {
              label = text.length > 80 ? text.slice(0, 80) + '…' : text;
              severity = ipConfigMap.get(text) ?? 'minor';
            }
          }

          failures.push({
            label,
            severity,
            productName: productNames.get(r.product_id) ?? r.product_id,
            note: r.note ?? undefined,
          });
        }
      }

      // Sort: critical → major → minor
      const order: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };
      failures.sort((a, b) => order[a.severity] - order[b.severity]);

      setInspection({
        id: inspRow.id,
        date: inspRow.date,
        productIds,
        unitsInspected: inspRow.units_inspected,
        batchSize: inspRow.batch_size,
        status: inspRow.status as Inspection['status'],
      });
      setTotalCount(total);
      setPassedCount(passed);
      setFailedItems(failures);
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      await completeInspection(id);
      router.replace({ pathname: '/inspection/[id]/report', params: { id } });
    } finally {
      setCompleting(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const failedCount = totalCount - passedCount;

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.backgroundElement }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ThemedText style={styles.backBtn}>← Edit</ThemedText>
        </Pressable>
        <ThemedText type="subtitle">Review</ThemedText>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={failedItems}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: Spacing.three, paddingBottom: 160 + BottomTabInset }}
        ListHeaderComponent={
          <View style={styles.summary}>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="subtitle" style={{ color: '#27ae60' }}>{passedCount}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Passed</ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="subtitle" style={{ color: failedCount > 0 ? '#e74c3c' : theme.text }}>
                {failedCount}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Failed</ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="subtitle">{totalCount}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Total</ThemedText>
            </View>
          </View>
        }
        ListEmptyComponent={
          failedItems.length === 0 ? (
            <View style={styles.allPassed}>
              <ThemedText style={styles.allPassedIcon}>✅</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                All filled items passed!
              </ThemedText>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.failureItem, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.failureHeader}>
              <SeverityBadge severity={item.severity} />
              <ThemedText type="small" themeColor="textSecondary">
                {item.productName}
              </ThemedText>
            </View>
            <ThemedText type="small" style={styles.failureLabel}>
              {item.label}
            </ThemedText>
            {item.note && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.failureNote}>
                Note: {item.note}
              </ThemedText>
            )}
          </View>
        )}
      />

      <View
        style={[
          styles.footer,
          { backgroundColor: theme.background, borderTopColor: theme.backgroundElement, paddingBottom: BottomTabInset + Spacing.two },
        ]}>
        <Pressable
          onPress={handleComplete}
          disabled={completing}
          style={[styles.completeBtn, { opacity: completing ? 0.7 : 1 }]}>
          <ThemedText style={styles.completeBtnText}>
            {completing ? 'Completing…' : 'Complete Inspection'}
          </ThemedText>
        </Pressable>
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
  summary: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
    gap: 4,
  },
  failureItem: {
    borderRadius: 10,
    padding: Spacing.two,
    marginBottom: Spacing.two,
    gap: 6,
  },
  failureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  failureLabel: { fontWeight: '600' },
  failureNote: { fontStyle: 'italic' },
  allPassed: {
    alignItems: 'center',
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  allPassedIcon: { fontSize: 40 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  completeBtn: {
    backgroundColor: '#27ae60',
    borderRadius: 12,
    padding: Spacing.two + 2,
    alignItems: 'center',
  },
  completeBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
