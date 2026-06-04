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
import type { ColumnConfig, GlobalInspectionPoint, Group, Severity, ToleranceType } from '@/types';

const SEVERITIES: Severity[] = ['high', 'medium', 'low'];
const SEVERITY_COLORS: Record<Severity, string> = {
  high: '#c0392b',
  medium: '#e67e22',
  low: '#f39c12',
};
const SEVERITY_LABELS: Record<Severity, string> = { high: 'H', medium: 'M', low: 'L' };

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
  groups,
  onUpdateVisibility,
  onUpdateTolerance,
  onUpdateSeverity,
  onUpdateGroup,
  onUpdateType,
  onUpdateInstructions,
}: {
  col: ColumnConfig;
  groups: Group[];
  onUpdateVisibility: (key: string, visible: boolean) => void;
  onUpdateTolerance: (key: string, tolerance: { type: ToleranceType; value: number | null } | undefined) => void;
  onUpdateSeverity: (key: string, severity: Severity) => void;
  onUpdateGroup: (key: string, group: string | null) => void;
  onUpdateType: (key: string, isNumeric: boolean) => void;
  onUpdateInstructions: (key: string, instructions: string | undefined) => void;
}) {
  const theme = useTheme();
  const [showTolerance, setShowTolerance] = useState(!!col.tolerance);
  const [tolType, setTolType] = useState<ToleranceType>(col.tolerance?.type ?? 'absolute');
  const [tolValue, setTolValue] = useState(col.tolerance?.value?.toString() ?? '');
  const [instructions, setInstructions] = useState(col.instructions ?? '');

  function handleToleranceSave() {
    const v = parseFloat(tolValue);
    if (tolType === 'min' || tolType === 'max') {
      onUpdateTolerance(col.key, { type: tolType, value: isNaN(v) ? null : v });
    } else if (!isNaN(v) && v >= 0) {
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

      {col.visible && (
        <>
          <View style={styles.typeToggleRow}>
            {([true, false] as const).map((numeric) => (
              <TouchableOpacity
                key={String(numeric)}
                onPress={() => {
                  if (col.isNumeric !== numeric) {
                    onUpdateType(col.key, numeric);
                    if (!numeric) {
                      setShowTolerance(false);
                      onUpdateTolerance(col.key, undefined);
                    }
                  }
                }}
                style={[
                  styles.typeBtn,
                  { backgroundColor: col.isNumeric === numeric ? '#3c87f7' : theme.backgroundSelected },
                ]}>
                <ThemedText type="small" style={{ color: col.isNumeric === numeric ? '#fff' : theme.textSecondary, fontSize: 11 }}>
                  {numeric ? 'Numeric' : 'Text'}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.colMetaRow}>
            <View style={styles.severityBtns}>
              {SEVERITIES.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => onUpdateSeverity(col.key, s)}
                  style={[styles.sevBtn, { backgroundColor: col.severity === s ? SEVERITY_COLORS[s] : theme.backgroundSelected }]}>
                  <ThemedText style={[styles.sevBtnText, { color: col.severity === s ? '#fff' : theme.textSecondary }]}>
                    {SEVERITY_LABELS[s]}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            {groups.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupChips} contentContainerStyle={styles.groupChipsContent}>
                <TouchableOpacity
                  onPress={() => onUpdateGroup(col.key, null)}
                  style={[styles.groupChip, { backgroundColor: !col.group ? '#3c87f7' : theme.backgroundSelected }]}>
                  <ThemedText type="small" style={{ color: !col.group ? '#fff' : theme.textSecondary, fontSize: 11 }}>
                    None
                  </ThemedText>
                </TouchableOpacity>
                {groups.map((g) => (
                  <TouchableOpacity
                    key={g.name}
                    onPress={() => onUpdateGroup(col.key, g.name)}
                    style={[styles.groupChip, { backgroundColor: col.group === g.name ? '#3c87f7' : theme.backgroundSelected }]}>
                    <ThemedText type="small" style={{ color: col.group === g.name ? '#fff' : theme.textSecondary, fontSize: 11 }}>
                      {g.name}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {col.isNumeric && showTolerance && (
            <View style={styles.toleranceRow}>
              <View style={styles.tolTypeRow}>
                {(['absolute', 'percent', 'min', 'max'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => {
                      setTolType(t);
                      const v = parseFloat(tolValue);
                      if (t === 'min' || t === 'max') {
                        onUpdateTolerance(col.key, { type: t, value: isNaN(v) ? null : v });
                      } else {
                        onUpdateTolerance(col.key, { type: t, value: isNaN(v) ? 0 : v });
                      }
                    }}
                    style={[styles.tolTypeBtn, { backgroundColor: tolType === t ? '#3c87f7' : theme.backgroundElement }]}>
                    <ThemedText type="small" style={{ color: tolType === t ? '#fff' : theme.text }}>
                      {t === 'absolute' ? 'Absolute' : t === 'percent' ? '% Percent' : t === 'min' ? 'Min' : 'Max'}
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
                  placeholder={tolType === 'min' || tolType === 'max' ? 'use ref value' : '0.0'}
                  placeholderTextColor={theme.textSecondary}
                />
                <ThemedText type="small" themeColor="textSecondary">
                  {tolType === 'percent' ? '%' : tolType === 'min' ? 'min' : tolType === 'max' ? 'max' : 'units'}
                </ThemedText>
              </View>
            </View>
          )}

          <TextInput
            style={[styles.instructionsInput, { backgroundColor: theme.backgroundSelected, color: theme.text }]}
            value={instructions}
            onChangeText={setInstructions}
            onBlur={() => onUpdateInstructions(col.key, instructions.trim() || undefined)}
            placeholder="Add measurement instructions…"
            placeholderTextColor={theme.textSecondary}
            multiline
          />
        </>
      )}
    </View>
  );
}

function GroupsSection({
  groups,
  onAdd,
  onDelete,
  onReorder,
}: {
  groups: Group[];
  onAdd: (name: string) => void;
  onDelete: (name: string) => void;
  onReorder: (name: string, direction: 'up' | 'down') => void;
}) {
  const theme = useTheme();
  const [newGroupName, setNewGroupName] = useState('');

  function handleAdd() {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewGroupName('');
  }

  return (
    <>
      <SectionHeader title="Groups" />
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.groupAddRow}>
          <TextInput
            style={[styles.groupInput, { backgroundColor: theme.backgroundSelected, color: theme.text }]}
            value={newGroupName}
            onChangeText={setNewGroupName}
            placeholder="New group name..."
            placeholderTextColor={theme.textSecondary}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
          />
          <TouchableOpacity
            onPress={handleAdd}
            disabled={!newGroupName.trim()}
            style={[styles.groupAddBtn, { backgroundColor: newGroupName.trim() ? '#3c87f7' : theme.backgroundSelected }]}>
            <ThemedText style={{ color: newGroupName.trim() ? '#fff' : theme.textSecondary, fontWeight: '700' }}>
              Add
            </ThemedText>
          </TouchableOpacity>
        </View>

        {groups.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.noGroupsHint}>
            No groups defined. Add groups to organize product info on the template and report.
          </ThemedText>
        ) : (
          groups.map((g, idx) => (
            <View key={g.name} style={[styles.groupRow, { borderTopColor: theme.backgroundSelected }]}>
              <View style={styles.groupReorderBtns}>
                <TouchableOpacity
                  onPress={() => onReorder(g.name, 'up')}
                  disabled={idx === 0}
                  style={[styles.reorderBtn, { opacity: idx === 0 ? 0.3 : 1 }]}>
                  <ThemedText type="small">▲</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onReorder(g.name, 'down')}
                  disabled={idx === groups.length - 1}
                  style={[styles.reorderBtn, { opacity: idx === groups.length - 1 ? 0.3 : 1 }]}>
                  <ThemedText type="small">▼</ThemedText>
                </TouchableOpacity>
              </View>
              <ThemedText type="small" style={styles.groupName}>{g.name}</ThemedText>
              <TouchableOpacity onPress={() => onDelete(g.name)} hitSlop={8} style={styles.deleteGroupBtn}>
                <ThemedText type="small" style={{ color: '#c0392b' }}>✕</ThemedText>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </>
  );
}

function GipRow({
  gip,
  groups,
  onDelete,
  onUpdateVisibility,
  onUpdateTolerance,
  onUpdateSeverity,
  onUpdateGroup,
  onUpdateType,
  onUpdateInstructions,
}: {
  gip: GlobalInspectionPoint;
  groups: Group[];
  onDelete: (key: string) => void;
  onUpdateVisibility: (key: string, visible: boolean) => void;
  onUpdateTolerance: (key: string, tolerance: { type: ToleranceType; value: number | null } | undefined) => void;
  onUpdateSeverity: (key: string, severity: Severity) => void;
  onUpdateGroup: (key: string, group: string | null) => void;
  onUpdateType: (key: string, isNumeric: boolean) => void;
  onUpdateInstructions: (key: string, instructions: string | undefined) => void;
}) {
  const theme = useTheme();
  const [showTolerance, setShowTolerance] = useState(!!gip.tolerance);
  const [tolType, setTolType] = useState<ToleranceType>(gip.tolerance?.type ?? 'absolute');
  const [tolValue, setTolValue] = useState(gip.tolerance?.value?.toString() ?? '');
  const [instructions, setInstructions] = useState(gip.instructions ?? '');

  function handleToleranceSave() {
    const v = parseFloat(tolValue);
    if (tolType === 'min' || tolType === 'max') {
      onUpdateTolerance(gip.key, { type: tolType, value: isNaN(v) ? null : v });
    } else if (!isNaN(v) && v >= 0) {
      onUpdateTolerance(gip.key, { type: tolType, value: v });
    }
  }

  function handleTolToggle() {
    const next = !showTolerance;
    setShowTolerance(next);
    if (!next) onUpdateTolerance(gip.key, undefined);
  }

  return (
    <View style={[styles.columnRow, { borderBottomColor: theme.backgroundElement }]}>
      <View style={styles.columnMain}>
        <ThemedText type="small" style={styles.columnLabel}>{gip.label}</ThemedText>
        <View style={styles.columnRight}>
          {gip.isNumeric && gip.visible && (
            <TouchableOpacity onPress={handleTolToggle} style={styles.tolToggle}>
              <ThemedText type="small" style={{ color: showTolerance ? '#3c87f7' : undefined }}>
                ± tol
              </ThemedText>
            </TouchableOpacity>
          )}
          <Switch
            value={gip.visible}
            onValueChange={(v) => onUpdateVisibility(gip.key, v)}
            trackColor={{ true: '#3c87f7' }}
          />
          <TouchableOpacity onPress={() => onDelete(gip.key)} hitSlop={8}>
            <ThemedText type="small" style={{ color: '#c0392b', fontWeight: '700' }}>✕</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      {gip.visible && (
        <>
          <View style={styles.typeToggleRow}>
            {([true, false] as const).map((numeric) => (
              <TouchableOpacity
                key={String(numeric)}
                onPress={() => {
                  if (gip.isNumeric !== numeric) {
                    onUpdateType(gip.key, numeric);
                    if (!numeric) {
                      setShowTolerance(false);
                      onUpdateTolerance(gip.key, undefined);
                    }
                  }
                }}
                style={[
                  styles.typeBtn,
                  { backgroundColor: gip.isNumeric === numeric ? '#3c87f7' : theme.backgroundSelected },
                ]}>
                <ThemedText type="small" style={{ color: gip.isNumeric === numeric ? '#fff' : theme.textSecondary, fontSize: 11 }}>
                  {numeric ? 'Numeric' : 'Text'}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.colMetaRow}>
            <View style={styles.severityBtns}>
              {SEVERITIES.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => onUpdateSeverity(gip.key, s)}
                  style={[styles.sevBtn, { backgroundColor: gip.severity === s ? SEVERITY_COLORS[s] : theme.backgroundSelected }]}>
                  <ThemedText style={[styles.sevBtnText, { color: gip.severity === s ? '#fff' : theme.textSecondary }]}>
                    {SEVERITY_LABELS[s]}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            {groups.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupChips} contentContainerStyle={styles.groupChipsContent}>
                <TouchableOpacity
                  onPress={() => onUpdateGroup(gip.key, null)}
                  style={[styles.groupChip, { backgroundColor: !gip.group ? '#3c87f7' : theme.backgroundSelected }]}>
                  <ThemedText type="small" style={{ color: !gip.group ? '#fff' : theme.textSecondary, fontSize: 11 }}>
                    None
                  </ThemedText>
                </TouchableOpacity>
                {groups.map((g) => (
                  <TouchableOpacity
                    key={g.name}
                    onPress={() => onUpdateGroup(gip.key, g.name)}
                    style={[styles.groupChip, { backgroundColor: gip.group === g.name ? '#3c87f7' : theme.backgroundSelected }]}>
                    <ThemedText type="small" style={{ color: gip.group === g.name ? '#fff' : theme.textSecondary, fontSize: 11 }}>
                      {g.name}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {gip.isNumeric && showTolerance && (
            <View style={styles.toleranceRow}>
              <View style={styles.tolTypeRow}>
                {(['absolute', 'percent', 'min', 'max'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => {
                      setTolType(t);
                      const v = parseFloat(tolValue);
                      if (t === 'min' || t === 'max') {
                        onUpdateTolerance(gip.key, { type: t, value: isNaN(v) ? null : v });
                      } else {
                        onUpdateTolerance(gip.key, { type: t, value: isNaN(v) ? 0 : v });
                      }
                    }}
                    style={[styles.tolTypeBtn, { backgroundColor: tolType === t ? '#3c87f7' : theme.backgroundElement }]}>
                    <ThemedText type="small" style={{ color: tolType === t ? '#fff' : theme.text }}>
                      {t === 'absolute' ? 'Absolute' : t === 'percent' ? '% Percent' : t === 'min' ? 'Min' : 'Max'}
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
                  placeholder={tolType === 'min' || tolType === 'max' ? 'use ref value' : '0.0'}
                  placeholderTextColor={theme.textSecondary}
                />
                <ThemedText type="small" themeColor="textSecondary">
                  {tolType === 'percent' ? '%' : tolType === 'min' ? 'min' : tolType === 'max' ? 'max' : 'units'}
                </ThemedText>
              </View>
            </View>
          )}

          <TextInput
            style={[styles.instructionsInput, { backgroundColor: theme.backgroundSelected, color: theme.text }]}
            value={instructions}
            onChangeText={setInstructions}
            onBlur={() => onUpdateInstructions(gip.key, instructions.trim() || undefined)}
            placeholder="Add measurement instructions…"
            placeholderTextColor={theme.textSecondary}
            multiline
          />
        </>
      )}
    </View>
  );
}

function GlobalInspectionPointsSection({
  globalInspectionPoints,
  groups,
  onAdd,
  onDelete,
  onUpdateVisibility,
  onUpdateTolerance,
  onUpdateSeverity,
  onUpdateGroup,
  onUpdateType,
  onUpdateInstructions,
}: {
  globalInspectionPoints: GlobalInspectionPoint[];
  groups: Group[];
  onAdd: (label: string) => void;
  onDelete: (key: string) => void;
  onUpdateVisibility: (key: string, visible: boolean) => void;
  onUpdateTolerance: (key: string, tolerance: { type: ToleranceType; value: number | null } | undefined) => void;
  onUpdateSeverity: (key: string, severity: Severity) => void;
  onUpdateGroup: (key: string, group: string | null) => void;
  onUpdateType: (key: string, isNumeric: boolean) => void;
  onUpdateInstructions: (key: string, instructions: string | undefined) => void;
}) {
  const theme = useTheme();
  const [newName, setNewName] = useState('');

  function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewName('');
  }

  return (
    <>
      <SectionHeader title="Global Inspection Points" />
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.groupAddRow}>
          <TextInput
            style={[styles.groupInput, { backgroundColor: theme.backgroundSelected, color: theme.text }]}
            value={newName}
            onChangeText={setNewName}
            placeholder="New inspection point name..."
            placeholderTextColor={theme.textSecondary}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
          />
          <TouchableOpacity
            onPress={handleAdd}
            disabled={!newName.trim()}
            style={[styles.groupAddBtn, { backgroundColor: newName.trim() ? '#3c87f7' : theme.backgroundSelected }]}>
            <ThemedText style={{ color: newName.trim() ? '#fff' : theme.textSecondary, fontWeight: '700' }}>
              Add
            </ThemedText>
          </TouchableOpacity>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.importMeta}>
          Global inspection points apply to all products. They can be grouped alongside product info columns.
        </ThemedText>
      </View>

      {globalInspectionPoints.length > 0 && (
        <FlatList
          data={globalInspectionPoints}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <GipRow
              gip={item}
              groups={groups}
              onDelete={onDelete}
              onUpdateVisibility={onUpdateVisibility}
              onUpdateTolerance={onUpdateTolerance}
              onUpdateSeverity={onUpdateSeverity}
              onUpdateGroup={onUpdateGroup}
              onUpdateType={onUpdateType}
              onUpdateInstructions={onUpdateInstructions}
            />
          )}
          scrollEnabled={false}
          style={[styles.flatSection, { backgroundColor: theme.backgroundElement }]}
        />
      )}
    </>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const {
    columnConfigs,
    groups,
    globalInspectionPoints,
    lastImportDate,
    productCount,
    loading,
    importSpreadsheet,
    exportSettings,
    importSettings,
    updateColumnVisibility,
    updateColumnTolerance,
    updateColumnSeverity,
    updateColumnType,
    updateColumnInstructions,
    updateColumnGroup,
    addGroup,
    deleteGroup,
    reorderGroup,
    addGlobalInspectionPoint,
    deleteGlobalInspectionPoint,
    updateGipVisibility,
    updateGipTolerance,
    updateGipSeverity,
    updateGipGroup,
    updateGipType,
    updateGipInstructions,
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

  async function handleExportSettings() {
    if (columnConfigs.length === 0 && globalInspectionPoints.length === 0) {
      Alert.alert('Nothing to export', 'Import product data or add global inspection points first.');
      return;
    }
    try {
      await exportSettings();
    } catch (err) {
      Alert.alert('Export failed', String(err));
    }
  }

  async function handleImportSettings() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      if (!file.name?.toLowerCase().endsWith('.xlsx')) {
        Alert.alert('Invalid file', 'Please select an .xlsx settings file.');
        return;
      }
      const summary = await importSettings(file.uri);
      Alert.alert(
        'Settings imported',
        `Applied to ${summary.appliedCount} columns, ${summary.groupCount} groups, ${summary.globalInspectionPointCount} global points.` +
          (summary.skippedCount > 0 ? `\n${summary.skippedCount} unknown column(s) skipped.` : ''),
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
        <SectionHeader title="Product Data" />
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <TouchableOpacity
            onPress={handleImport}
            disabled={loading}
            style={[styles.importBtn, { backgroundColor: '#3c87f7', opacity: loading ? 0.6 : 1 }]}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <ThemedText style={styles.importBtnText}>Import Product Data (.xlsx)</ThemedText>
            )}
          </TouchableOpacity>
          {lastImportDate && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.importMeta}>
              Last import: {new Date(lastImportDate).toLocaleDateString()} · {productCount} products
            </ThemedText>
          )}
        </View>

        <SectionHeader title="Settings File" />
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <TouchableOpacity
            onPress={handleExportSettings}
            disabled={loading || (columnConfigs.length === 0 && globalInspectionPoints.length === 0)}
            style={[styles.importBtn, {
              backgroundColor: (columnConfigs.length > 0 || globalInspectionPoints.length > 0) ? '#3c87f7' : theme.backgroundSelected,
              opacity: loading ? 0.6 : 1,
            }]}>
            {loading ? (
              <ActivityIndicator color={(columnConfigs.length > 0 || globalInspectionPoints.length > 0) ? '#fff' : theme.text} />
            ) : (
              <ThemedText style={(columnConfigs.length > 0 || globalInspectionPoints.length > 0) ? styles.importBtnText : { fontWeight: '700', fontSize: 15 }}>
                Export Settings (.xlsx)
              </ThemedText>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleImportSettings}
            disabled={loading}
            style={[styles.importBtn, { backgroundColor: theme.backgroundSelected, opacity: loading ? 0.6 : 1 }]}>
            {loading ? <ActivityIndicator color={theme.text} /> : (
              <ThemedText style={{ fontWeight: '700', fontSize: 15 }}>Import Settings (.xlsx)</ThemedText>
            )}
          </TouchableOpacity>
          <ThemedText type="small" themeColor="textSecondary" style={styles.importMeta}>
            Export your column and group configuration to share across devices.
          </ThemedText>
        </View>

        {columnConfigs.length > 0 ? (
          <>
            <SectionHeader title={`Product info (${columnConfigs.length})`} />
            <FlatList
              data={columnConfigs}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => (
                <ColumnRow
                  col={item}
                  groups={groups}
                  onUpdateVisibility={updateColumnVisibility}
                  onUpdateTolerance={updateColumnTolerance}
                  onUpdateSeverity={updateColumnSeverity}
                  onUpdateGroup={updateColumnGroup}
                  onUpdateType={updateColumnType}
                  onUpdateInstructions={updateColumnInstructions}
                />
              )}
              scrollEnabled={false}
              style={[styles.flatSection, { backgroundColor: theme.backgroundElement }]}
            />
            <GroupsSection
              groups={groups}
              onAdd={addGroup}
              onDelete={deleteGroup}
              onReorder={reorderGroup}
            />
          </>
        ) : (
          <View style={styles.empty}>
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              Import product data above to configure product info columns and groups.
            </ThemedText>
          </View>
        )}

        <GlobalInspectionPointsSection
          globalInspectionPoints={globalInspectionPoints}
          groups={groups}
          onAdd={addGlobalInspectionPoint}
          onDelete={deleteGlobalInspectionPoint}
          onUpdateVisibility={updateGipVisibility}
          onUpdateTolerance={updateGipTolerance}
          onUpdateSeverity={updateGipSeverity}
          onUpdateGroup={updateGipGroup}
          onUpdateType={updateGipType}
          onUpdateInstructions={updateGipInstructions}
        />
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
  typeToggleRow: { flexDirection: 'row', gap: 4, marginTop: 6 },
  typeBtn: { flex: 1, borderRadius: 8, paddingVertical: 4, alignItems: 'center' },
  colMetaRow: { marginTop: 6, gap: 6 },
  severityBtns: { flexDirection: 'row', gap: 4 },
  sevBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sevBtnText: { fontSize: 12, fontWeight: '700' },
  groupChips: { flexGrow: 0 },
  groupChipsContent: { flexDirection: 'row', gap: 4, paddingVertical: 2 },
  groupChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  toleranceRow: { marginTop: Spacing.two, gap: Spacing.one },
  tolTypeRow: { flexDirection: 'row', gap: Spacing.one },
  tolTypeBtn: { flex: 1, borderRadius: 8, padding: Spacing.one + 2, alignItems: 'center' },
  tolValueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tolInput: { flex: 1, height: 36, borderRadius: 8, paddingHorizontal: Spacing.two, fontSize: 14 },
  instructionsInput: { marginTop: 6, borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one + 2, fontSize: 13, minHeight: 50 },
  groupAddRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  groupInput: { flex: 1, borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one + 2, fontSize: 14 },
  groupAddBtn: { borderRadius: 8, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  noGroupsHint: { textAlign: 'center', paddingVertical: Spacing.two },
  groupRow: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.two },
  groupReorderBtns: { flexDirection: 'row', gap: 2 },
  reorderBtn: { padding: 4 },
  groupName: { flex: 1 },
  deleteGroupBtn: { padding: 4 },
  empty: { padding: Spacing.four, alignItems: 'center' },
  emptyText: { textAlign: 'center', lineHeight: 24 },
});
