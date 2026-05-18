import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Severity } from '@/types';

import { ThemedText } from '../themed-text';
import { PhotoThumbnail } from './photo-thumbnail';
import { SeverityBadge } from './severity-badge';

interface Props {
  text: string;
  severity: Severity;
  photoNumber: number;
  initialPassed: boolean | null;
  initialNote: string;
  photoUris: string[];
  onToggle: (passed: boolean) => void;
  onNoteChange: (note: string) => void;
  onAddPhoto: () => void;
  onRemovePhoto: (uri: string) => void;
}

export function InspectionPointRow({
  text,
  severity,
  photoNumber,
  initialPassed,
  initialNote,
  photoUris,
  onToggle,
  onNoteChange,
  onAddPhoto,
  onRemovePhoto,
}: Props) {
  const theme = useTheme();
  const [passed, setPassed] = useState<boolean | null>(initialPassed);
  const [note, setNote] = useState(initialNote);
  const [showNote, setShowNote] = useState(!!initialNote);

  function handleToggle(value: boolean) {
    setPassed(value);
    onToggle(value);
  }

  function handleNote(text: string) {
    setNote(text);
    onNoteChange(text);
  }

  const passedBg = passed === true ? '#27ae60' : theme.backgroundElement;
  const failedBg = passed === false ? '#e74c3c' : theme.backgroundElement;
  const passedText = passed === true ? '#fff' : theme.text;
  const failedText = passed === false ? '#fff' : theme.text;

  return (
    <View style={[styles.container, { borderBottomColor: theme.backgroundElement }]}>
      <View style={styles.topRow}>
        <View style={styles.textBlock}>
          <ThemedText type="small" style={styles.pointText}>
            {text}
          </ThemedText>
          {photoUris.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.photoRef}>
              See Photo {photoNumber}
            </ThemedText>
          )}
        </View>
        <SeverityBadge severity={severity} />
      </View>

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
            style={[styles.noteBtn, showNote && { color: '#3c87f7' }]}
            onPress={() => setShowNote(!showNote)}>
            📝
          </ThemedText>
          <View style={styles.cameraWrapper}>
            <ThemedText style={styles.noteBtn} onPress={onAddPhoto}>
              📷
            </ThemedText>
            {photoUris.length > 0 && (
              <View style={styles.photoCount}>
                <ThemedText style={styles.photoCountText}>{photoUris.length}</ThemedText>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  textBlock: {
    flex: 1,
  },
  pointText: {
    lineHeight: 20,
  },
  photoRef: {
    marginTop: 2,
    fontSize: 12,
    fontStyle: 'italic',
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
  },
  noteBtn: {
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
});
