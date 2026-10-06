import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCategories, type Category } from '../api/catalog';
import { certificationErrorMessage, getWorkerCertifications, submitWorkerCertification, type WorkerCertification } from '../api/workerCertifications';
import { useAuth } from '../auth/AuthContext';
import type { WorkerHomeStackParamList } from '../navigation/MainTabNavigators';
import { blurFocusedElementOnWeb } from '../navigation/webFocus';
import { CERTIFICATION_MIME_TYPES, certificationFileError } from '../services/certificationRules';

export function WorkerCertificationsScreen({ navigation, route }: NativeStackScreenProps<WorkerHomeStackParamList, 'WorkerCertifications'>) {
  const { withAccessToken } = useAuth();
  const request = useRef(withAccessToken);
  request.current = withAccessToken;
  const sending = useRef(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [certifications, setCertifications] = useState<WorkerCertification[]>([]);
  const [categoryId, setCategoryId] = useState(route.params?.categoryId ?? '');
  const [name, setName] = useState('');
  const [asset, setAsset] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const selected = certifications.find((item) => item.categoria_id === categoryId);
  const locked = selected?.estado === 'PENDIENTE' || selected?.estado === 'APROBADA';
  const selectedCategory = categories.find((item) => item.id === categoryId);
  const disabled = busy || loading || !!loadError;

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setLoadError('');
    void Promise.all([getCategories(), request.current(getWorkerCertifications)]).then(([items, documents]) => {
      if (!active) return;
      setCategories(items.filter((item) => item.requiere_certificacion));
      setCertifications(documents);
    }).catch((reason) => { if (active) setLoadError(certificationErrorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]));

  async function pick() {
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: CERTIFICATION_MIME_TYPES, multiple: false, copyToCacheDirectory: true, base64: false });
      if (result.canceled || !result.assets[0]) return;
      const file = result.assets[0];
      const problem = certificationFileError(file);
      if (problem) { setError(problem); return; }
      setAsset(file);
    } catch { setError('No pudimos abrir el selector de documentos.'); }
  }

  async function submit() {
    if (disabled || locked || sending.current) return;
    setError(''); setSuccess('');
    if (!selectedCategory || name.trim().length < 3 || name.trim().length > 120 || !asset) {
      setError('Selecciona una categoría, escribe un nombre de 3 a 120 caracteres y adjunta el documento.'); return;
    }
    const problem = certificationFileError(asset);
    if (problem) { setError(problem); return; }
    sending.current = true; setBusy(true);
    try {
      const saved = await request.current((token) => submitWorkerCertification(token, categoryId, name, asset));
      setCertifications((current) => [...current.filter((item) => item.categoria_id !== saved.categoria_id), saved]);
      setName(''); setAsset(null);
      setSuccess('Certificación enviada. Debe ser aprobada antes de publicar en esta categoría.');
      blurFocusedElementOnWeb();
    } catch (reason) { setError(certificationErrorMessage(reason)); }
    finally { sending.current = false; setBusy(false); }
  }

  return <SafeAreaView style={styles.page}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { blurFocusedElementOnWeb(); navigation.goBack(); }} style={styles.linkButton}>
          <Ionicons name="arrow-back" size={22} color="#256047" /><Text style={styles.link}>Volver</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>Subir certificaciones</Text>
        <Text style={styles.hint}>Para publicar en estas categorías necesitas una certificación aprobada. Los documentos se revisan de forma privada.</Text>
        <Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => setReloadKey((key) => key + 1)} style={styles.linkButton}><Text style={styles.link}>Actualizar estado</Text></Pressable>
        {loading && <ActivityIndicator color="#087A57" />}
        {!!loadError && <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>}
        {!!success && <Text accessibilityLiveRegion="polite" style={styles.success}>{success}</Text>}
        {categories.map((category) => {
          const certification = certifications.find((item) => item.categoria_id === category.id);
          return <Pressable key={category.id} accessibilityRole="radio" accessibilityState={{ checked: categoryId === category.id, disabled }}
            disabled={disabled} onPress={() => { setCategoryId(category.id); setName(''); setAsset(null); setError(''); setSuccess(''); }}
            style={[styles.category, categoryId === category.id && styles.selected]}>
            <Text style={styles.label}>{category.nombre}</Text>
            <Text style={styles.hint}>{category.certificacion_requerida}</Text>
            <Text style={styles.status}>{certification ? `${certification.estado === 'APROBADA' ? 'Aprobada' : certification.estado === 'PENDIENTE' ? 'Pendiente de revisión' : 'Rechazada'} · ${certification.nombre}` : 'Sin certificación'}</Text>
            {!!certification?.motivo_rechazo && <Text style={styles.error}>Motivo: {certification.motivo_rechazo}</Text>}
          </Pressable>;
        })}
        {selectedCategory && <View style={styles.card}>
          <Text style={styles.label}>{selectedCategory.nombre}</Text>
          {locked ? <Text style={styles.hint}>{selected?.estado === 'APROBADA' ? 'Tu certificación está aprobada. Ya puedes publicar servicios de esta categoría.' : 'El documento está en revisión. No puedes reemplazarlo mientras esté pendiente.'}</Text> : <>
            <Text style={styles.hint}>{selected?.estado === 'RECHAZADA' ? 'Adjunta un nuevo documento para solicitar otra revisión.' : 'Adjunta el certificado o licencia indicado para esta categoría.'}</Text>
            <TextInput accessibilityLabel="Nombre de la certificación" placeholder="Nombre del certificado o licencia" placeholderTextColor="#82918B"
              value={name} onChangeText={setName} maxLength={120} editable={!disabled} style={styles.input} />
            <Pressable accessibilityRole="button" disabled={disabled} onPress={() => void pick()} style={styles.linkButton}>
              <Ionicons name="attach" size={24} color="#256047" /><Text style={styles.link}>{asset ? 'Cambiar documento' : 'Elegir documento'}</Text>
            </Pressable>
            {!!asset && <Text style={styles.hint}>{asset.name}</Text>}
            <Text style={styles.hint}>PDF, JPEG, PNG o WebP. Máximo 5 MB.</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy }} disabled={disabled}
              onPress={() => void submit()} style={[styles.button, disabled && styles.disabled]}>
              {busy && <ActivityIndicator color="#FFFFFF" />}<Text style={styles.buttonText}>{busy ? 'Enviando…' : selected ? 'Reenviar certificación' : 'Enviar certificación'}</Text>
            </Pressable>
          </>}
        </View>}
        {!loading && !loadError && !categories.length && <Text style={styles.hint}>No hay categorías que requieran certificación.</Text>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { padding: 16, paddingBottom: 42, width: '100%', maxWidth: 680, alignSelf: 'center' },
  title: { color: '#14251F', fontSize: 26, fontWeight: '900', marginTop: 8 },
  hint: { color: '#66756F', fontSize: 13, lineHeight: 19, marginTop: 6 },
  label: { color: '#14251F', fontSize: 14, fontWeight: '700' },
  linkButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { color: '#256047', fontSize: 14, fontWeight: '700' },
  category: { padding: 16, marginTop: 12, borderWidth: 1, borderColor: '#DCE6E1', borderRadius: 14, backgroundColor: '#FFFFFF' },
  selected: { borderColor: '#087A57', backgroundColor: '#E7F3EC' },
  status: { color: '#256047', fontSize: 13, fontWeight: '700', marginTop: 8 },
  card: { padding: 18, backgroundColor: '#FFFFFF', borderRadius: 16, marginTop: 20 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 10, padding: 12, color: '#14251F', marginTop: 12 },
  error: { color: '#A74444', fontSize: 13, lineHeight: 19, marginTop: 12 },
  success: { color: '#256047', backgroundColor: '#DDF2E9', padding: 14, borderRadius: 12, marginTop: 12 },
  button: { minHeight: 52, backgroundColor: '#256047', borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 }, disabled: { opacity: 0.5 },
});
