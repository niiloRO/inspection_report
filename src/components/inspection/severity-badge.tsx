import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SeverityColors } from '@/constants/theme';
import type { Severity } from '@/types';

import { ThemedText } from '../themed-text';

interface Props {
  severity: Severity;
}

const LABELS: Record<Severity, string> = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
};

export function SeverityBadge({ severity }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: SeverityColors[severity] + '22' }]}>
      <ThemedText
        type="small"
        style={[styles.label, { color: SeverityColors[severity] }]}>
        {LABELS[severity]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
