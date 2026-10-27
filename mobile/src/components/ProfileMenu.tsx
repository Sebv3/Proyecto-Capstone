import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function ProfileMenuItem({ icon, title, subtitle, onPress, expanded, amber = false }: {
  icon: ComponentProps<typeof Ionicons>['name']; title: string; subtitle: string;
  onPress: () => void; expanded?: boolean; amber?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={expanded === undefined ? undefined : { expanded }}
    onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={[styles.icon, amber && styles.amber]}><Ionicons name={icon} size={23} color={amber ? '#895A08' : '#087D56'} /></View>
    <View style={styles.body}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>
    <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={19} color="#52695C" />
  </Pressable>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 18, minHeight: 76, borderBottomWidth: 1, borderBottomColor: '#DCE6E1' },
  pressed: { backgroundColor: '#E4F3EB' }, icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#E4F3EB', alignItems: 'center', justifyContent: 'center' },
  amber: { backgroundColor: '#FFF3DE' }, body: { flex: 1 }, title: { color: '#14251F', fontWeight: '700', fontSize: 16 },
  subtitle: { color: '#52695C', fontSize: 13, lineHeight: 19, marginTop: 3 },
});
