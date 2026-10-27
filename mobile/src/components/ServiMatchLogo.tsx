import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

export function ServiMatchLogo() {
  return <View accessible accessibilityRole="image" accessibilityLabel="ServiMatch: una casa con un check" style={styles.logo}>
    <View style={styles.mark}>
      <Ionicons name="home-outline" size={64} color="#087D56" />
      <View style={styles.check}><Ionicons name="checkmark" size={29} color="#087D56" /></View>
    </View>
    <Text style={styles.name}>Servi<Text style={styles.match}>Match</Text></Text>
  </View>;
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', gap: 12 },
  mark: { width: 88, height: 88, borderRadius: 26, backgroundColor: '#E1F1E9', alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute', left: 31, top: 42, width: 28, height: 28, backgroundColor: '#E1F1E9', alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
  name: { color: '#14251F', fontSize: 38, fontWeight: '800', letterSpacing: -1.5, textAlign: 'center' },
  match: { color: '#087D56' },
});
