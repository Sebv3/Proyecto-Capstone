import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>SERVICIOS PARA EL HOGAR</Text>
        <Text style={styles.title}>ServiMatch</Text>
        <Text style={styles.description}>
          Encuentra trabajadores de confianza o publica tus servicios en un
          solo lugar.
        </Text>
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Entorno móvil configurado</Text>
          <Text style={styles.statusText}>
            Próximo incremento: registro, inicio de sesión y perfiles.
          </Text>
        </View>
      </View>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F6',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  eyebrow: {
    color: '#32745C',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  title: {
    color: '#14251F',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
  },
  description: {
    color: '#52615C',
    fontSize: 18,
    lineHeight: 27,
    marginTop: 14,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE6E1',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 36,
    padding: 20,
  },
  statusTitle: {
    color: '#14251F',
    fontSize: 16,
    fontWeight: '700',
  },
  statusText: {
    color: '#65736E',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },
});
