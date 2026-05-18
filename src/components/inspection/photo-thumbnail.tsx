import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '../themed-text';

interface Props {
  uri: string;
  index: number;
  onRemove?: () => void;
}

export function PhotoThumbnail({ uri, index, onRemove }: Props) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <Pressable onPress={() => setFullscreen(true)} style={styles.wrapper}>
        <Image source={{ uri }} style={styles.thumb} />
        <View style={styles.badge}>
          <ThemedText style={styles.badgeText}>{index + 1}</ThemedText>
        </View>
        {onRemove && (
          <Pressable
            onPress={onRemove}
            style={styles.remove}
            hitSlop={8}>
            <ThemedText style={styles.removeText}>✕</ThemedText>
          </Pressable>
        )}
      </Pressable>

      <Modal visible={fullscreen} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setFullscreen(false)}>
          <Image source={{ uri }} style={styles.fullImage} resizeMode="contain" />
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: 72,
    height: 72,
    borderRadius: 6,
    overflow: 'hidden',
    marginRight: 8,
  },
  thumb: {
    width: 72,
    height: 72,
  },
  badge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  remove: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: '#fff',
    fontSize: 10,
    lineHeight: 14,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
});
