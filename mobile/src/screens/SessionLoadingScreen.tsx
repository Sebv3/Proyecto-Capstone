import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function SessionLoadingScreen() {
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.content} accessibilityLiveRegion="polite">
        <Text style={styles.brand}>ServiMatch</Text>
        <ActivityIndicator accessibilityLabel="Restaurando sesión" color="#256047" size="large" />
        <Text style={styles.message}>Preparando tu sesión…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  brand: { color: '#14251F', fontSize: 36, fontWeight: '800', marginBottom: 28 },
  message: { color: '#52615C', fontSize: 15, marginTop: 16 },
});
