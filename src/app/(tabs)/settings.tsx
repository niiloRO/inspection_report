import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSettings } from '@/hooks/use-settings';
import { useTheme } from '@/hooks/use-theme';
import type { ColumnConfig, Severity } from '@/types';

const SEVERITIES: Severity[] = ['critical', 'major', 'minor'];
const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#c0392b',
  major: '#e67e22',
  minor: '#f39c12',
};

function SectionHeader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
    </View>
  );
}

function ColumnRow({
  col,
  onUpdateVisibility,
  onUpdateTolerance,
}: {
  col: ColumnConfig;
  onUpdateVisibility: (key: string, visible: boolean) => void;
  onUpdateTolerance: (key: string, tolerance: { type: 'absolute' | 'percent'; value: number } | undefined) => void;
}) {
  const theme = useTheme();
  const [showTolerance, setShowTolerance] = useState(!!col.tolerance);
  const [tolType, setTolType] = useState<'absolute' | 'percent'>(col.tolerance?.type ?? 'absolute');
  const [tolValue, setTolValue] = useState(col.tolerance?.value?.toString() ?? '');

  function handleToleranceSave() {
    const v = parseFloat(tolValue);
    if (!isNaN(v) && v >= 0) {
      onUpdateTolerance(col.key, { type: tolType, value: v });
    }
  }

  function handleTolToggle() {
    const next = !showTolerance;
    setShowTolerance(next);
    if (!next) onUpdateTolerance(col.key, undefined);
  }

  return (
    <View style={[styles.columnRow, { borderBottomColor: theme.backgroundElement }]}>
      <View style={styles.columnMain}>
        <ThemedText type="small" style={styles.columnLabel}>{col.label}</ThemedText>
        <View style={styles.columnRight}>
          {col.isNumeric && col.visible && (
            <TouchableOpacity onPress={handleTolToggle} style={styles.tolToggle}>
              <ThemedText type="small" style={{ color: showTolerance ? '#3c87f7' : undefined }}>
                ± tol
              </ThemedText>
            </TouchableOpacity>
          )}
          <Switch
            value={col.visible}
            onValueChange={(v) => onUpdateVisibility(col.key, v)}
            trackColor={{ true: '#3c87f7' }}
          />
        </View>
      </View>

      {col.isNumeric && col.visible && showTolerance && (
        <View style={styles.toleranceRow}>
          <View style={styles.tolTypeRow}>
            {(['absolute', 'percent'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => {
                  setTolType(t);
                  onUpdateTolerance(col.key, { type: t, value: parseFloat(tolValue) || 0 });
                }}
                style={[styles.tolTypeBtn, { backgroundColor: tolType === t ? '#3c87f7' : theme.backgroundElement }]}>
                <ThemedText type="small" style={{ color: tolType === t ? '#fff' : theme.text }}>
                  {t === 'absolute' ? 'Absolute' : '% Percent'}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.tolValueRow}>
            <TextInput
              style={[styles.tolInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
              value={tolValue}
              onChangeText={setTolValue}
              onBlur={handleToleranceSave}
              keyboardType="decimal-pad"
              placeholder="0.0"
              placeholderTextColor={theme.textSecondary}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {tolType === 'percent' ? '%' : 'units'}
            </ThemedText>
          </View>
        </View>
      )}
    </View>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const {
    columnConfigs,
    inspectionPointConfigs,
    lastImportDate,
    productCount,
    loading,
    importSpreadsheet,
    updateSeverity,
    updateColumnVisibility,
    updateColumnTolerance,
  } = useSettings();

  async function handleImport() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      if (!file.name?.toLowerCase().endsWith('.xlsx')) {
        Alert.alert('Invalid file', 'Please select an .xlsx Excel file.');
        return;
      }
      const imported = await importSpreadsheet(file.uri);
      Alert.alert(
        'Import successful',
        `${imported.productCount} products, ${imported.columnCount} columns, ${imported.inspectionPointCount} inspection points imported.`,
      );
    } catch (err) {
      Alert.alert('Import failed', String(err));
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.backgroundElement }]}>
        <ThemedText type="subtitle">Settings</ThemedText>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.three }}>
        <SectionHeader title="Spreadsheet" />
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <TouchableOpacity
            onPress={handleImport}
            disabled={loading}
            style={[styles.importBtn, { backgroundColor: '#3c87f7', opacity: loading ? 0.6 : 1 }]}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <ThemedText style={styles.importBtnText}>Import Spreadsheet (.xlsx)</ThemedText>
            )}
          </TouchableOpacity>
          {lastImportDate && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.importMeta}>
              Last import: {new Date(lastImportDate).toLocaleDateString()} · {productCount} products
            </ThemedText>
          )}
        </View>

        {columnConfigs.length > 0 && (
          <>
            <SectionHeader title={`Columns (${columnConfigs.length})`} />
            <FlatList
              data={columnConfigs}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => (
                <ColumnRow
                  col={item}
                  onUpdateVisibility={updateColumnVisibility}
                  onUpdateTolerance={updateColumnTolerance}
                />
              )}
              scrollEnabled={false}
              style={[styles.flatSection, { backgroundColor: theme.backgroundElement }]}
            />
          </>
        )}

        {inspectionPointConfigs.length > 0 && (
          <>
            <SectionHeader title={`Inspection Points (${inspectionPointConfigs.length})`} />
            <FlatList
              data={inspectionPointConfigs}
              keyExtractor={(item) => item.text}
              renderItem={({ item }) => (
                <View style={[styles.severityRow, { borderBottomColor: theme.backgroundElement, backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small" numberOfLines={2} style={styles.pointText}>
                    {item.text}
                  </ThemedText>
                  <View style={styles.severityBtns}>
                    {SEVERITIES.map((s) => (
                      <TouchableOpacity
                        key={s}
                        onPress={() => updateSeverity(item.text, s)}
                        style={[styles.sevBtn, { backgroundColor: item.severity === s ? SEVERITY_COLORS[s] : theme.backgroundSelected }]}>
                        <ThemedText style={[styles.sevBtnText, { color: item.severity === s ? '#fff' : theme.textSecondary }]}>
                          {s.charAt(0).toUpperCase()}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              scrollEnabled={false}
            />
          </>
        )}

        {columnConfigs.length === 0 && inspectionPointConfigs.length === 0 && (
          <View style={styles.empty}>
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              Import a spreadsheet above to configure columns and inspection points.
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.three, paddingTop: Spacing.four, paddingBottom: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionHeader: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.one },
  sectionTitle: { letterSpacing: 0.5 },
  card: { marginHorizontal: Spacing.three, borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  importBtn: { borderRadius: 10, padding: Spacing.two + 2, alignItems: 'center' },
  importBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  importMeta: { textAlign: 'center' },
  flatSection: { marginHorizontal: Spacing.three, borderRadius: 12, overflow: 'hidden' },
  columnRow: { padding: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  columnMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  columnLabel: { flex: 1 },
  columnRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tolToggle: { paddingHorizontal: Spacing.two },
  toleranceRow: { marginTop: Spacing.two, gap: Spacing.one },
  tolTypeRow: { flexDirection: 'row', gap: Spacing.one },
  tolTypeBtn: { flex: 1, borderRadius: 8, padding: Spacing.one + 2, alignItems: 'center' },
  tolValueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tolInput: { flex: 1, height: 36, borderRadius: 8, paddingHorizontal: Spacing.two, fontSize: 14 },
  severityRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.two },
  pointText: { flex: 1 },
  severityBtns: { flexDirection: 'row', gap: 4 },
  sevBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sevBtnText: { fontSize: 12, fontWeight: '700' },
  empty: { padding: Spacing.four, alignItems: 'center' },
  emptyText: { textAlign: 'center', lineHeight: 24 },
});
