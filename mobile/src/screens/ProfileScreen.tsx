import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  const roles = { CLIENTE: 'Cliente', TRABAJADOR: 'Trabajador', ADMIN: 'Administrador' };
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>ServiMatch</Text>
        <Text accessibilityRole="header" style={styles.title}>Hola, {user.nombre}</Text>
        <Text style={styles.description}>Ya ingresaste a tu cuenta.</Text>
        <Text style={styles.label}>Correo electrónico</Text>
        <Text style={styles.value}>{user.email}</Text>
        <Text style={styles.label}>Perfil</Text>
        <Text style={styles.value}>{roles[user.rol]}</Text>
        <Pressable accessibilityRole="button" onPress={signOut} style={styles.button}>
          <Text style={styles.buttonText}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28, width: '100%', maxWidth: 520, alignSelf: 'center' },
  brand: { color: '#32745C', fontWeight: '700', fontSize: 18, marginBottom: 32 },
  title: { color: '#14251F', fontSize: 30, fontWeight: '700' },
  description: { color: '#52615C', fontSize: 16, marginTop: 12, marginBottom: 20 },
  label: { color: '#52615C', fontSize: 13, marginTop: 20 },
  value: { color: '#14251F', fontSize: 18, marginTop: 6 },
  button: { marginTop: 36, minHeight: 52, borderRadius: 10, backgroundColor: '#256047', alignItems: 'center', justifyContent: 'center', padding: 14 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
