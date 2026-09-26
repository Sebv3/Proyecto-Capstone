import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { submitWorkerVerification, workerErrorMessage, type VerificationImages, type WorkerVerification } from '../api/workerVerification';
import { useAuth } from '../auth/AuthContext';

type ImageField = keyof VerificationImages;
const fields: { key: ImageField; label: string }[] = [
  { key: 'carnet_frontal', label: 'Carnet: frente' },
  { key: 'carnet_reverso', label: 'Carnet: reverso' },
  { key: 'selfie', label: 'Selfie' },
];

export function WorkerDocumentsScreen({
  verification, onSubmitted,
}: { verification: WorkerVerification | null; onSubmitted: () => void }) {
  const { withAccessToken, signOut } = useAuth();
  const [images, setImages] = useState<Partial<VerificationImages>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickImage(field: ImageField, camera: boolean) {
    setError(null);
    try {
      // On web, ImagePicker uses a file input and the browser decides whether capture is available.
      if (Platform.OS !== 'web') {
        const permission = camera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError('Necesitamos permiso para acceder a la cámara o las fotos.'); return;
        }
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType ?? '')) {
        setError('Selecciona una imagen JPEG, PNG o WebP.'); return;
      }
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        setError('Cada imagen debe pesar como máximo 5 MB.'); return;
      }
      setImages((current) => ({ ...current, [field]: asset }));
    } catch { setError('No pudimos abrir la cámara o las fotos.'); }
  }

  async function sendDocuments() {
    if (!images.carnet_frontal || !images.carnet_reverso || !images.selfie || busy) return;
    setBusy(true); setError(null);
    try {
      await withAccessToken((token) => submitWorkerVerification(token, images as VerificationImages));
      setImages({});
      onSubmitted();
    } catch (reason) { setError(workerErrorMessage(reason)); }
    finally { setBusy(false); }
  }

  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.brand}>ServiMatch</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {verification?.estado === 'RECHAZADA' ? 'Reenvía tus documentos' : 'Verifica tu identidad'}
      </Text>
      <Text style={styles.hint}>Tu cuenta ya está creada. Envía tres imágenes para solicitar la verificación como trabajador.</Text>
      {verification?.motivo_rechazo && <Text accessibilityRole="alert" style={styles.error}>
        Motivo del rechazo: {verification.motivo_rechazo}
      </Text>}
      <View style={styles.card}>
        {fields.map(({ key, label }) => <View key={key} style={styles.field}>
          <Text style={styles.label}>{label} {images[key] ? '✓' : ''}</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy}
              onPress={() => void pickImage(key, true)} style={styles.linkButton}>
              <Text style={styles.link}>Tomar foto</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy}
              onPress={() => void pickImage(key, false)} style={styles.linkButton}>
              <Text style={styles.link}>Elegir imagen</Text>
            </Pressable>
          </View>
        </View>)}
        <Text style={styles.hint}>Formatos JPEG, PNG o WebP; máximo 5 MB por imagen.</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button"
          disabled={busy || fields.some(({ key }) => !images[key])}
          onPress={() => void sendDocuments()}
          style={[styles.button, (busy || fields.some(({ key }) => !images[key])) && styles.disabled]}>
          {busy && <ActivityIndicator color="#FFFFFF" />}
          <Text style={styles.buttonText}>{busy ? 'Enviando…' : 'Enviar documentos'}</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void signOut()}
        style={styles.signOut}><Text style={styles.link}>Cerrar sesión</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { padding: 24, paddingBottom: 52, width: '100%', maxWidth: 600, alignSelf: 'center' },
  brand: { color: '#32745C', fontWeight: '700', fontSize: 17, marginBottom: 28 },
  title: { color: '#14251F', fontSize: 30, fontWeight: '800' },
  hint: { color: '#52615C', fontSize: 14, lineHeight: 21, marginTop: 10 },
  card: { padding: 20, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#DCE6E1', marginTop: 22 },
  field: { marginBottom: 12 },
  label: { color: '#14251F', fontSize: 15, fontWeight: '600', marginTop: 12 },
  actions: { flexDirection: 'row', gap: 22 },
  linkButton: { minHeight: 44, justifyContent: 'center' },
  link: { color: '#256047', fontSize: 14, fontWeight: '700' },
  error: { color: '#B42318', backgroundColor: '#FFF0EE', padding: 12, borderRadius: 8, marginTop: 16 },
  button: { marginTop: 24, minHeight: 52, borderRadius: 10, backgroundColor: '#256047', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, padding: 12 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  signOut: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20, borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 10 },
});
