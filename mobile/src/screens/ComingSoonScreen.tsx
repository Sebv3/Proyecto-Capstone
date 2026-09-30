import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ComingSoonScreen({ title }: { title: string }) {
  return <SafeAreaView style={styles.page}>
    <View style={styles.content}>
      <Text style={styles.brand}>ServiMatch</Text>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Próximamente</Text>
        <Text style={styles.description}>
          Esta sección estará disponible en un próximo avance del proyecto.
        </Text>
      </View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { flex: 1, padding: 24, width: '100%', maxWidth: 600, alignSelf: 'center' },
  brand: { color: '#32745C', fontWeight: '700', fontSize: 17, marginBottom: 28 },
  title: { color: '#14251F', fontSize: 30, fontWeight: '800', marginBottom: 22 },
  card: { padding: 22, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#DCE6E1' },
  cardTitle: { color: '#256047', fontSize: 20, fontWeight: '700' },
  description: { color: '#52615C', fontSize: 15, lineHeight: 23, marginTop: 8 },
});
