import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type ClientProfile,
  clientProfileErrorMessage,
  getClientProfile,
} from '../api/clientProfile';
import { useAuth } from '../auth/AuthContext';

export function ProfileScreen() {
  const { user, accessToken, signOut } = useAuth();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.rol !== 'CLIENTE' || !accessToken) return;
    let active = true;
    setLoading(true);
    setError(null);
    getClientProfile(accessToken)
      .then((result) => { if (active) setProfile(result); })
      .catch((reason) => { if (active) setError(clientProfileErrorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, user?.rol]);

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
        {user.rol === 'CLIENTE' && <View style={styles.clientSection}>
          <Text style={styles.sectionTitle}>Datos del cliente</Text>
          {loading && <View accessibilityLiveRegion="polite" style={styles.loading}>
            <ActivityIndicator color="#256047" />
            <Text style={styles.description}>Cargando perfil…</Text>
          </View>}
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {profile && !loading && <>
            <Text style={styles.label}>RUT</Text>
            <Text style={styles.value}>{profile.rut}</Text>
            <Text style={styles.label}>Teléfono</Text>
            <Text style={styles.value}>{profile.telefono ?? 'Sin teléfono registrado'}</Text>
            <Text style={styles.label}>Dirección</Text>
            <Text style={styles.value}>{profile.direccion}</Text>
            <Text style={styles.label}>Comuna</Text>
            <Text style={styles.value}>{profile.comuna.nombre}</Text>
          </>}
        </View>}
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.button}>
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
  clientSection: { marginTop: 28, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#DCE6E1' },
  sectionTitle: { color: '#14251F', fontSize: 20, fontWeight: '700', marginTop: 16 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  error: { color: '#B42318', fontSize: 14, lineHeight: 21, marginTop: 12 },
  button: { marginTop: 36, minHeight: 52, borderRadius: 10, backgroundColor: '#256047', alignItems: 'center', justifyContent: 'center', padding: 14 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
