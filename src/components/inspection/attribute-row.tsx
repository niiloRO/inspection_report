import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ColumnConfig } from '@/types';

import { ThemedText } from '../themed-text';
import { PhotoThumbnail } from './photo-thumbnail';

interface Props {
  column: ColumnConfig;
  referenceValue: string | number | undefined;
  initialValue: string;
  initialPassed: boolean;
  photoUris: string[];
  onChangeValue: (value: string, passed: boolean) => void;
  onAddPhoto: () => void;
  onRemovePhoto: (uri: string) => void;
}

function computePassed(
  value: string,
  reference: string | number | undefined,
  tolerance: ColumnConfig['tolerance'],
): boolean {
  if (!tolerance || reference === undefined || reference === '') return true;
  const measured = parseFloat(value);
  const ref = parseFloat(String(reference));
  if (isNaN(measured) || isNaN(ref)) return true;
  if (tolerance.type === 'absolute') {
    return Math.abs(measured - ref) <= tolerance.value;
  }
  if (ref === 0) return measured === 0;
  return (Math.abs(measured - ref) / Math.abs(ref)) * 100 <= tolerance.value;
}

export function AttributeRow({
  column,
  referenceValue,
  initialValue,
  photoUris,
  onChangeValue,
  onAddPhoto,
  onRemovePhoto,
}: Props) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);
  const passed = computePassed(value, referenceValue, column.tolerance);

  function handleChange(text: string) {
    setValue(text);
    onChangeValue(text, computePassed(text, referenceValue, column.tolerance));
  }

  const hasValue = value.trim() !== '';
  const indicatorColor = !hasValue ? theme.textSecondary : passed ? '#27ae60' : '#e74c3c';

  return (
    <View style={[styles.container, { borderBottomColor: theme.backgroundElement }]}>
      <View style={styles.header}>
        <ThemedText type="small" style={styles.label}>
          {column.label}
        </ThemedText>
        {referenceValue !== undefined && referenceValue !== '' && (
          <ThemedText type="small" themeColor="textSecondary">
            Ref: {referenceValue}
          </ThemedText>
        )}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.backgroundElement,
              color: theme.text,
              borderColor: hasValue ? indicatorColor : theme.backgroundElement,
            },
          ]}
          value={value}
          onChangeText={handleChange}
          keyboardType={column.isNumeric ? 'decimal-pad' : 'default'}
          placeholder={column.isNumeric ? '0.0' : 'Enter value'}
          placeholderTextColor={theme.textSecondary}
        />
        <View style={[styles.indicator, { backgroundColor: indicatorColor }]}>
          <ThemedText style={styles.indicatorText}>
            {!hasValue ? '—' : passed ? '✓' : '✗'}
          </ThemedText>
        </View>
        <View style={styles.cameraBtn}>
          <ThemedText
            style={styles.cameraIcon}
            onPress={onAddPhoto}>
            📷
          </ThemedText>
          {photoUris.length > 0 && (
            <View style={styles.photoCount}>
              <ThemedText style={styles.photoCountText}>{photoUris.length}</ThemedText>
            </View>
          )}
        </View>
      </View>

      {photoUris.length > 0 && (
        <View style={styles.photos}>
          {photoUris.map((uri, i) => (
            <PhotoThumbnail
              key={uri}
              uri={uri}
              index={i}
              onRemove={() => onRemovePhoto(uri)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  label: {
    flex: 1,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    fontSize: 15,
    borderWidth: 2,
  },
  indicator: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  cameraBtn: {
    position: 'relative',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIcon: {
    fontSize: 22,
  },
  photoCount: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#3c87f7',
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  photos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.two,
  },
});
