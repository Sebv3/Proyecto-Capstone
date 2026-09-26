import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { WorkerVerification } from '../api/workerVerification';
import { useAuth } from '../auth/AuthContext';

export function WorkerHomeScreen({
  verification, onProfile, onRefresh,
}: { verification: WorkerVerification; onProfile: () => void; onRefresh: () => void }) {
  const { user, signOut } = useAuth();
  const approved = verification.estado === 'APROBADA';
  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.brand}>ServiMatch</Text>
      <Text accessibilityRole="header" style={styles.title}>Hola, {user?.nombre}</Text>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{approved ? 'Identidad aprobada' : 'Verificación pendiente'}</Text>
        <Text style={styles.hint}>{approved
          ? 'Tu identidad fue aprobada. Las funciones de trabajo aparecerán cuando estén disponibles.'
          : 'Ya recibimos tus documentos. Puedes entrar a tu cuenta y editar tu dirección desde Mi perfil. Publicar o aceptar trabajos estará disponible después de la aprobación.'}</Text>
        {!approved && <Pressable accessibilityRole="button" onPress={onRefresh} style={styles.linkButton}>
          <Text style={styles.link}>Actualizar estado</Text>
        </Pressable>}
      </View>
      <Pressable accessibilityRole="button" onPress={onProfile} style={styles.button}>
        <Text style={styles.buttonText}>Mi perfil</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
        <Text style={styles.link}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { padding: 24, paddingBottom: 52, width: '100%', maxWidth: 600, alignSelf: 'center' },
  brand: { color: '#32745C', fontWeight: '700', fontSize: 17, marginBottom: 28 },
  title: { color: '#14251F', fontSize: 30, fontWeight: '800', marginBottom: 22 },
  card: { padding: 20, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#DCE6E1' },
  sectionTitle: { color: '#14251F', fontSize: 20, fontWeight: '700' },
  hint: { color: '#52615C', fontSize: 14, lineHeight: 21, marginTop: 8 },
  linkButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 10 },
  link: { color: '#256047', fontSize: 14, fontWeight: '700' },
  button: { marginTop: 22, minHeight: 52, borderRadius: 10, backgroundColor: '#256047', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  signOut: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 10 },
});
