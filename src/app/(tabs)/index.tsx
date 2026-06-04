import { router } from 'expo-router';
import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useInspections } from '@/hooks/use-inspections';
import { useTheme } from '@/hooks/use-theme';
import type { Inspection } from '@/types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildInspectionTitle(item: Inspection): string {
  const supplier = item.supplier?.trim() || '—';
  const invoiceNo = item.invoiceNo?.trim() || '—';
  const ids = item.productIds.join(', ');
  return `${supplier}  ·  ${invoiceNo}  ·  ${ids}`;
}

function StatusBadge({ status }: { status: Inspection['status'] }) {
  const color = status === 'completed' ? '#27ae60' : '#3c87f7';
  const label = status === 'completed' ? 'Completed' : 'In Progress';
  return (
    <View style={[styles.statusBadge, { backgroundColor: color + '22' }]}>
      <ThemedText style={[styles.statusText, { color }]}>{label}</ThemedText>
    </View>
  );
}

function InspectionItem({
  item,
  onDelete,
}: {
  item: Inspection;
  onDelete: (id: string) => void;
}) {
  const theme = useTheme();

  function handlePress() {
    if (item.status === 'in_progress') {
      router.push({ pathname: '/inspection/[id]/template', params: { id: item.id } });
    } else {
      router.push({ pathname: '/inspection/[id]/report', params: { id: item.id } });
    }
  }

  function handleLongPress() {
    Alert.alert(
      'Delete Inspection',
      'This cannot be undone. All results and photos will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(item.id) },
      ],
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={({ pressed }) => [
        styles.item,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}>
      <View style={styles.itemHeader}>
        <StatusBadge status={item.status} />
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(item.date)}
        </ThemedText>
      </View>
      <ThemedText type="small" style={styles.title} numberOfLines={2}>
        {buildInspectionTitle(item)}
      </ThemedText>
      <ThemedText type="small" style={styles.products}>
        {item.productIds.length === 1 ? '1 product' : `${item.productIds.length} products`}
        {'  ·  '}
        {item.unitsInspected} units / {item.batchSize} batch
      </ThemedText>
    </Pressable>
  );
}

export default function InspectionsScreen() {
  const { inspections, deleteInspection } = useInspections();

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Inspections</ThemedText>
        <Pressable
          onPress={() => router.push('/inspection/new')}
          style={styles.addBtn}>
          <ThemedText style={styles.addBtnText}>+ New</ThemedText>
        </Pressable>
      </View>

      <FlatList
        data={inspections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <InspectionItem item={item} onDelete={deleteInspection} />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: BottomTabInset + Spacing.three },
        ]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText type="subtitle" themeColor="textSecondary">
              📋
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              No inspections yet.{'\n'}Tap "+ New" to start one.
            </ThemedText>
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  addBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 20,
    backgroundColor: '#3c87f7',
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { padding: Spacing.three, gap: Spacing.two },
  item: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusText: { fontSize: 12, fontWeight: '700' },
  title: { fontWeight: '600', fontSize: 13, marginTop: 2 },
  products: { marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: Spacing.six, gap: Spacing.two },
  emptyText: { textAlign: 'center', lineHeight: 24 },
});
