import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useInspections } from '@/hooks/use-inspections';
import { useProducts } from '@/hooks/use-products';
import { useTheme } from '@/hooks/use-theme';
import type { Product } from '@/types';

interface ProductUnits {
  units: string;
  batch: string;
  productionStatus: string;
  packingStatus: string;
}

function ProductItem({
  product,
  selected,
  onToggle,
}: {
  product: Product;
  selected: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      style={[
        styles.productItem,
        {
          backgroundColor: selected ? '#3c87f722' : theme.backgroundElement,
          borderColor: selected ? '#3c87f7' : 'transparent',
        },
      ]}>
      <View style={[styles.checkbox, { borderColor: selected ? '#3c87f7' : theme.textSecondary }]}>
        {selected && <ThemedText style={styles.checkmark}>✓</ThemedText>}
      </View>
      <View style={styles.productInfo}>
        <ThemedText type="small" style={styles.productName}>
          {product.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {product.id}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export default function NewInspectionScreen() {
  const theme = useTheme();
  const { products, search } = useProducts();
  const { createInspection } = useInspections();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [productUnits, setProductUnits] = useState<Map<string, ProductUnits>>(new Map());
  const [supplier, setSupplier] = useState('');
  const [location, setLocation] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [starting, setStarting] = useState(false);

  const filtered = search(query);

  function toggleProduct(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setProductUnits((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.set(id, { units: '', batch: '', productionStatus: '', packingStatus: '' });
      }
      return next;
    });
  }

  function updateProductUnits(id: string, field: keyof ProductUnits, value: string) {
    setProductUnits((prev) => {
      const next = new Map(prev);
      const current = next.get(id) ?? { units: '', batch: '', productionStatus: '', packingStatus: '' };
      next.set(id, { ...current, [field]: value });
      return next;
    });
  }

  const canStart =
    selected.size > 0 &&
    [...selected].every((id) => {
      const u = productUnits.get(id);
      return !!u?.units && !!u?.batch;
    });

  async function handleStart() {
    if (!canStart) return;
    setStarting(true);
    try {
      const units = new Map<string, { unitsInspected: number; batchSize: number; productionStatus?: number; packingStatus?: number }>();
      for (const id of selected) {
        const u = productUnits.get(id)!;
        const prodStatus = parseFloat(u.productionStatus);
        const packStatus = parseFloat(u.packingStatus);
        units.set(id, {
          unitsInspected: parseInt(u.units, 10),
          batchSize: parseInt(u.batch, 10),
          productionStatus: isNaN(prodStatus) ? undefined : Math.min(100, Math.max(0, prodStatus)),
          packingStatus: isNaN(packStatus) ? undefined : Math.min(100, Math.max(0, packStatus)),
        });
      }
      const id = await createInspection({
        productIds: [...selected],
        supplier: supplier.trim() || undefined,
        location: location.trim() || undefined,
        invoiceNo: invoiceNo.trim() || undefined,
        productUnits: units,
      });
      router.replace({ pathname: '/inspection/[id]/template', params: { id } });
    } finally {
      setStarting(false);
    }
  }

  if (products.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.header, { borderBottomColor: theme.backgroundElement }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ThemedText style={styles.backBtn}>← Back</ThemedText>
          </Pressable>
          <ThemedText type="subtitle">New Inspection</ThemedText>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.empty}>
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            No products found.{'\n'}Import a spreadsheet in Settings first.
          </ThemedText>
          <Pressable onPress={() => router.replace('/(tabs)/settings' as any)} style={styles.settingsBtn}>
            <ThemedText style={styles.settingsBtnText}>Go to Settings</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  const selectedProducts = products.filter((p) => selected.has(p.id));

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.backgroundElement }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ThemedText style={styles.backBtn}>← Back</ThemedText>
        </Pressable>
        <ThemedText type="subtitle">New Inspection</ThemedText>
        <View style={{ width: 60 }} />
      </View>

      <TextInput
        style={[styles.searchBar, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        value={query}
        onChangeText={setQuery}
        placeholder="Search products..."
        placeholderTextColor={theme.textSecondary}
      />

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <ProductItem
            product={item}
            selected={selected.has(item.id)}
            onToggle={() => toggleProduct(item.id)}
          />
        )}
        contentContainerStyle={{ padding: Spacing.two, paddingBottom: 300 }}
      />

      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.background,
            borderTopColor: theme.backgroundElement,
            paddingBottom: BottomTabInset + Spacing.two,
          },
        ]}>
        <View style={styles.globalInputs}>
          <TextInput
            style={[styles.globalInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            value={supplier}
            onChangeText={setSupplier}
            placeholder="Supplier (optional)"
            placeholderTextColor={theme.textSecondary}
          />
          <TextInput
            style={[styles.globalInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            value={location}
            onChangeText={setLocation}
            placeholder="Location (optional)"
            placeholderTextColor={theme.textSecondary}
          />
          <TextInput
            style={[styles.globalInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            value={invoiceNo}
            onChangeText={setInvoiceNo}
            placeholder="Invoice NO (optional)"
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        {selectedProducts.length > 0 && (
          <ScrollView style={styles.perProductScroll} nestedScrollEnabled>
            {selectedProducts.map((p) => {
              const u = productUnits.get(p.id) ?? { units: '', batch: '' };
              return (
                <View key={p.id} style={[styles.perProductRow, { borderTopColor: theme.backgroundElement }]}>
                  <ThemedText type="small" style={styles.perProductName} numberOfLines={1}>
                    {p.name}
                  </ThemedText>
                  <View style={styles.perProductInputs}>
                    <View style={styles.batchField}>
                      <ThemedText type="small" themeColor="textSecondary">Units</ThemedText>
                      <TextInput
                        style={[styles.batchInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
                        value={u.units}
                        onChangeText={(v) => updateProductUnits(p.id, 'units', v)}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={theme.textSecondary}
                      />
                    </View>
                    <View style={styles.batchField}>
                      <ThemedText type="small" themeColor="textSecondary">Batch</ThemedText>
                      <TextInput
                        style={[styles.batchInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
                        value={u.batch}
                        onChangeText={(v) => updateProductUnits(p.id, 'batch', v)}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={theme.textSecondary}
                      />
                    </View>
                    <View style={styles.batchField}>
                      <ThemedText type="small" themeColor="textSecondary">Prod %</ThemedText>
                      <TextInput
                        style={[styles.batchInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
                        value={u.productionStatus}
                        onChangeText={(v) => updateProductUnits(p.id, 'productionStatus', v)}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={theme.textSecondary}
                      />
                    </View>
                    <View style={styles.batchField}>
                      <ThemedText type="small" themeColor="textSecondary">Pack %</ThemedText>
                      <TextInput
                        style={[styles.batchInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
                        value={u.packingStatus}
                        onChangeText={(v) => updateProductUnits(p.id, 'packingStatus', v)}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={theme.textSecondary}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        {selected.size === 0 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.selectedCount}>
            Select products above to start
          </ThemedText>
        )}

        <Pressable
          onPress={handleStart}
          disabled={!canStart || starting}
          style={[
            styles.startBtn,
            { backgroundColor: canStart ? '#3c87f7' : theme.backgroundElement },
          ]}>
          <ThemedText
            style={[styles.startBtnText, { color: canStart ? '#fff' : theme.textSecondary }]}>
            {starting ? 'Starting...' : 'Start Inspection'}
          </ThemedText>
        </Pressable>
      </View>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { color: '#3c87f7', fontSize: 15 },
  searchBar: {
    margin: Spacing.three,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: 10,
    marginHorizontal: Spacing.two,
    marginVertical: 3,
    borderWidth: 1.5,
    gap: Spacing.two,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#3c87f7', fontWeight: '700', fontSize: 13 },
  productInfo: { flex: 1 },
  productName: { fontWeight: '600' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  globalInputs: { gap: Spacing.one },
  globalInput: {
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 2,
    fontSize: 14,
  },
  perProductScroll: { maxHeight: 180 },
  perProductRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, gap: 4 },
  perProductName: { fontWeight: '600', flex: 1 },
  perProductInputs: { flexDirection: 'row', gap: Spacing.three },
  selectedCount: { textAlign: 'center' },
  batchField: { flex: 1, gap: 4 },
  batchInput: {
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 2,
    fontSize: 15,
    textAlign: 'center',
  },
  startBtn: {
    borderRadius: 12,
    padding: Spacing.two + 2,
    alignItems: 'center',
  },
  startBtnText: { fontWeight: '700', fontSize: 16 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  emptyText: { textAlign: 'center', lineHeight: 24 },
  settingsBtn: {
    backgroundColor: '#3c87f7',
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  settingsBtnText: { color: '#fff', fontWeight: '700' },
});
