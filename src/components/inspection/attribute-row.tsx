import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ColumnConfig } from '@/types';

import { ThemedText } from '../themed-text';
import { PhotoThumbnail } from './photo-thumbnail';

interface Props {
  column: ColumnConfig;
  referenceValue: string | number | undefined;
  initialValue: string;
  initialPassed: boolean | null;
  initialNote: string;
  initialSampleSize: string;
  photoUris: string[];
  videoUris: string[];
  instructions?: string;
  onChangeValue: (value: string, passed: boolean) => void;
  onToggle: (passed: boolean | null) => void;
  onNoteChange: (note: string) => void;
  onSampleSizeChange: (sampleSize: string) => void;
  onAddPhoto: () => void;
  onRemovePhoto: (uri: string) => void;
  onAddVideo: () => void;
  onRemoveVideo: (uri: string) => void;
}

function computePassed(
  value: string,
  reference: string | number | undefined,
  tolerance: ColumnConfig['tolerance'],
): boolean {
  if (!tolerance) return true;
  const measured = parseFloat(value);
  if (isNaN(measured)) return true;
  if (tolerance.type === 'min') {
    const bound = tolerance.value !== null
      ? tolerance.value
      : (reference !== undefined && reference !== '' ? parseFloat(String(reference)) : NaN);
    return isNaN(bound) ? true : measured >= bound;
  }
  if (tolerance.type === 'max') {
    const bound = tolerance.value !== null
      ? tolerance.value
      : (reference !== undefined && reference !== '' ? parseFloat(String(reference)) : NaN);
    return isNaN(bound) ? true : measured <= bound;
  }
  if (reference === undefined || reference === '') return true;
  const ref = parseFloat(String(reference));
  if (isNaN(ref)) return true;
  if (tolerance.type === 'absolute') {
    return Math.abs(measured - ref) <= (tolerance.value ?? 0);
  }
  if (ref === 0) return measured === 0;
  return (Math.abs(measured - ref) / Math.abs(ref)) * 100 <= (tolerance.value ?? 0);
}

function InstructionsModal({ instructions, onClose }: { instructions: string; onClose: () => void }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Instructions</ThemedText>
            <Pressable onPress={onClose} hitSlop={12} style={styles.modalClose}>
              <ThemedText style={styles.modalCloseText}>×</ThemedText>
            </Pressable>
          </View>
          <ThemedText style={styles.modalBody}>{instructions}</ThemedText>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function AttributeRow({
  column,
  referenceValue,
  initialValue,
  initialPassed,
  initialNote,
  initialSampleSize,
  photoUris,
  videoUris,
  instructions,
  onChangeValue,
  onToggle,
  onNoteChange,
  onSampleSizeChange,
  onAddPhoto,
  onRemovePhoto,
  onAddVideo,
  onRemoveVideo,
}: Props) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);
  const [passed, setPassed] = useState<boolean | null>(initialPassed);
  const [note, setNote] = useState(initialNote);
  const [sampleSize, setSampleSize] = useState(initialSampleSize);
  const [showNote, setShowNote] = useState(!!initialNote);
  const [showInstructions, setShowInstructions] = useState(false);

  function handleChange(text: string) {
    setValue(text);
    onChangeValue(text, computePassed(text, referenceValue, column.tolerance));
  }

  function handleToggle(val: boolean) {
    if (passed === val) {
      setPassed(null);
      onToggle(null);
    } else {
      setPassed(val);
      onToggle(val);
    }
  }

  function handleNote(text: string) {
    setNote(text);
    onNoteChange(text);
  }

  const labelRow = (
    <View style={styles.labelRow}>
      <ThemedText type="small" style={styles.label}>{column.label}</ThemedText>
      {!!instructions && (
        <Pressable onPress={() => setShowInstructions(true)} hitSlop={8} style={styles.infoBtn}>
          <ThemedText style={styles.infoBtnText}>?</ThemedText>
        </Pressable>
      )}
    </View>
  );

  const refLine = referenceValue !== undefined && referenceValue !== '' ? (
    <ThemedText type="small" themeColor="textSecondary" style={styles.refValue}>
      {referenceValue}
    </ThemedText>
  ) : null;

  const sampleSizeInput = (
    <View style={styles.sampleSizeRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sampleSizeLabel}>Sample size</ThemedText>
      <TextInput
        style={[styles.sampleSizeInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        value={sampleSize}
        onChangeText={(t) => { setSampleSize(t); onSampleSizeChange(t); }}
        placeholder="—"
        placeholderTextColor={theme.textSecondary}
        returnKeyType="done"
        keyboardType="number-pad"
      />
    </View>
  );

  if (!column.isNumeric) {
    const passedBg = passed === true ? '#27ae60' : theme.backgroundElement;
    const failedBg = passed === false ? '#e74c3c' : theme.backgroundElement;
    const passedText = passed === true ? '#fff' : theme.text;
    const failedText = passed === false ? '#fff' : theme.text;

    return (
      <View style={[styles.container, { borderBottomColor: theme.backgroundElement }]}>
        {showInstructions && <InstructionsModal instructions={instructions!} onClose={() => setShowInstructions(false)} />}
        <View style={styles.header}>
          {labelRow}
          {refLine}
        </View>
        {sampleSizeInput}

        <View style={styles.actions}>
          <View style={styles.toggleRow}>
            <ThemedText
              style={[styles.toggleBtn, { backgroundColor: passedBg, color: passedText }]}
              onPress={() => handleToggle(true)}>
              Pass
            </ThemedText>
            <ThemedText
              style={[styles.toggleBtn, { backgroundColor: failedBg, color: failedText }]}
              onPress={() => handleToggle(false)}>
              Fail
            </ThemedText>
          </View>

          <View style={styles.iconBtns}>
            <ThemedText
              style={[styles.iconBtn, showNote && { color: '#3c87f7' }]}
              onPress={() => setShowNote(!showNote)}>
              📝
            </ThemedText>
            <View style={styles.cameraWrapper}>
              <ThemedText style={styles.iconBtn} onPress={onAddPhoto}>📷</ThemedText>
              {photoUris.length > 0 && (
                <View style={styles.photoCount}>
                  <ThemedText style={styles.photoCountText}>{photoUris.length}</ThemedText>
                </View>
              )}
            </View>
            <View style={styles.cameraWrapper}>
              <ThemedText style={styles.iconBtn} onPress={onAddVideo}>🎥</ThemedText>
              {videoUris.length > 0 && (
                <View style={styles.photoCount}>
                  <ThemedText style={styles.photoCountText}>{videoUris.length}</ThemedText>
                </View>
              )}
            </View>
          </View>
        </View>

        {showNote && (
          <TextInput
            style={[styles.noteInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            value={note}
            onChangeText={handleNote}
            placeholder="Add a note..."
            placeholderTextColor={theme.textSecondary}
            multiline
          />
        )}

        {photoUris.length > 0 && (
          <View style={styles.photos}>
            {photoUris.map((uri, i) => (
              <PhotoThumbnail key={uri} uri={uri} index={i} onRemove={() => onRemovePhoto(uri)} />
            ))}
          </View>
        )}

        {videoUris.length > 0 && (
          <View style={styles.videos}>
            {videoUris.map((uri, i) => (
              <View key={uri} style={[styles.videoChip, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText style={styles.videoChipText}>🎥 Video {i + 1}</ThemedText>
                <Pressable onPress={() => onRemoveVideo(uri)} hitSlop={8}>
                  <ThemedText style={styles.videoChipRemove}>×</ThemedText>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  // Numeric mode
  const computedPassed = computePassed(value, referenceValue, column.tolerance);
  const hasValue = value.trim() !== '';
  const indicatorColor = !hasValue ? theme.textSecondary : computedPassed ? '#27ae60' : '#e74c3c';

  return (
    <View style={[styles.container, { borderBottomColor: theme.backgroundElement }]}>
      {showInstructions && <InstructionsModal instructions={instructions!} onClose={() => setShowInstructions(false)} />}
      <View style={styles.header}>
        {labelRow}
        {refLine}
      </View>
      {sampleSizeInput}

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
          keyboardType="decimal-pad"
          placeholder="0.0"
          placeholderTextColor={theme.textSecondary}
        />
        <View style={[styles.indicator, { backgroundColor: indicatorColor }]}>
          <ThemedText style={styles.indicatorText}>
            {!hasValue ? '—' : computedPassed ? '✓' : '✗'}
          </ThemedText>
        </View>
        <View style={styles.iconBtns}>
          <ThemedText
            style={[styles.iconBtn, showNote && { color: '#3c87f7' }]}
            onPress={() => setShowNote(!showNote)}>
            📝
          </ThemedText>
          <View style={styles.cameraWrapper}>
            <ThemedText style={styles.iconBtn} onPress={onAddPhoto}>📷</ThemedText>
            {photoUris.length > 0 && (
              <View style={styles.photoCount}>
                <ThemedText style={styles.photoCountText}>{photoUris.length}</ThemedText>
              </View>
            )}
          </View>
          <View style={styles.cameraWrapper}>
            <ThemedText style={styles.iconBtn} onPress={onAddVideo}>🎥</ThemedText>
            {videoUris.length > 0 && (
              <View style={styles.photoCount}>
                <ThemedText style={styles.photoCountText}>{videoUris.length}</ThemedText>
              </View>
            )}
          </View>
        </View>
      </View>

      {showNote && (
        <TextInput
          style={[styles.noteInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          value={note}
          onChangeText={handleNote}
          placeholder="Add a note..."
          placeholderTextColor={theme.textSecondary}
          multiline
        />
      )}

      {photoUris.length > 0 && (
        <View style={styles.photos}>
          {photoUris.map((uri, i) => (
            <PhotoThumbnail key={uri} uri={uri} index={i} onRemove={() => onRemovePhoto(uri)} />
          ))}
        </View>
      )}

      {videoUris.length > 0 && (
        <View style={styles.videos}>
          {videoUris.map((uri, i) => (
            <View key={uri} style={[styles.videoChip, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.videoChipText}>🎥 Video {i + 1}</ThemedText>
              <Pressable onPress={() => onRemoveVideo(uri)} hitSlop={8}>
                <ThemedText style={styles.videoChipRemove}>×</ThemedText>
              </Pressable>
            </View>
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
    marginBottom: Spacing.one,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontWeight: '600',
    flex: 1,
  },
  refValue: {
    fontStyle: 'italic',
    marginTop: 2,
    fontSize: 12,
  },
  infoBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#3c87f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  toggleBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 20,
    fontSize: 14,
    fontWeight: '700',
    overflow: 'hidden',
  },
  iconBtns: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  iconBtn: {
    fontSize: 22,
  },
  cameraWrapper: {
    position: 'relative',
  },
  photoCount: {
    position: 'absolute',
    top: -4,
    right: -4,
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
  sampleSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  sampleSizeLabel: {
    fontSize: 11,
    minWidth: 68,
  },
  sampleSizeInput: {
    flex: 1,
    borderRadius: 6,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    fontSize: 12,
  },
  noteInput: {
    marginTop: Spacing.two,
    borderRadius: 8,
    padding: Spacing.two,
    fontSize: 14,
    minHeight: 60,
  },
  photos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.two,
  },
  videos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.one,
    gap: Spacing.one,
  },
  videoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    gap: 6,
  },
  videoChipText: {
    fontSize: 12,
  },
  videoChipRemove: {
    fontSize: 16,
    lineHeight: 18,
    color: '#888',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: Spacing.three,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  modalTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: '#1a1a1a',
  },
  modalClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#333',
    lineHeight: 20,
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 22,
    color: '#333',
  },
});
