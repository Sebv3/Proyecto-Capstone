import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCommunes, type Commune } from '../api/auth';
import {
  getWorkerProfile, getWorkerVerification, missingWorkerResource, saveWorkerAddress,
  workerErrorMessage, type WorkerProfile, type WorkerVerification,
} from '../api/workerVerification';
import { useAuth } from '../auth/AuthContext';

function WorkerCommunePicker({
  communes, selectedId, onChange,
}: { communes: Commune[]; selectedId: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = communes.find((item) => item.id === selectedId);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Seleccionar comuna del trabajador"
      disabled={!communes.length} onPress={() => setOpen(true)} style={styles.input}>
      <Text style={selected ? styles.value : styles.hint}>{selected?.nombre ?? 'Selecciona una comuna'}</Text>
    </Pressable>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={styles.modal}>
        <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.linkButton}>
          <Text style={styles.link}>Cerrar</Text>
        </Pressable>
        <FlatList data={communes} keyExtractor={(item) => item.id}
          renderItem={({ item }) => <Pressable accessibilityRole="radio"
            accessibilityState={{ checked: item.id === selectedId }}
            onPress={() => { onChange(item.id); setOpen(false); }} style={styles.communeOption}>
            <Text style={styles.value}>{item.nombre}</Text>
          </Pressable>} />
      </SafeAreaView>
    </Modal>
  </>;
}

export function WorkerProfileSection({ onProfileCreated }: { onProfileCreated?: () => void }) {
  const { user, withAccessToken } = useAuth();
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [verification, setVerification] = useState<WorkerVerification | null>(null);
  const [address, setAddress] = useState('');
  const [communeId, setCommuneId] = useState('');
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [communesError, setCommunesError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (user?.rol !== 'TRABAJADOR') return;
    let active = true;
    setLoading(true); setError(null);
    void (async () => {
      try {
        let found: WorkerProfile | null = null;
        try { found = await withAccessToken(getWorkerProfile); }
        catch (reason) { if (!missingWorkerResource(reason)) throw reason; }
        if (!active) return;
        setProfile(found); setAddress(found?.direccion_base ?? '');
        setCommuneId(found?.comuna?.id ?? '');
        if (found) {
          try {
            const result = await withAccessToken(getWorkerVerification);
            if (active) setVerification(result);
          } catch (reason) {
            if (!missingWorkerResource(reason)) throw reason;
            if (active) setVerification(null);
          }
        } else setVerification(null);
      } catch (reason) { if (active) setError(workerErrorMessage(reason)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [user?.id, reloadKey]);

  useEffect(() => {
    if (user?.rol !== 'TRABAJADOR') return;
    let active = true;
    void getCommunes()
      .then((items) => { if (active) { setCommunes(items); setCommunesError(null); } })
      .catch(() => { if (active) setCommunesError('No pudimos cargar las comunas.'); });
    return () => { active = false; };
  }, [user?.id, reloadKey]);

  async function saveAddress() {
    const trimmed = address.trim();
    if (trimmed.length < 5 || trimmed.length > 200) {
      setError('Ingresa una dirección de entre 5 y 200 caracteres.'); return;
    }
    if (!communes.some((item) => item.id === communeId)) {
      setError('Selecciona una comuna disponible.'); return;
    }
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await withAccessToken((token) => saveWorkerAddress(token, {
        direccion_base: trimmed, comuna_id: communeId,
      }, !!profile));
      setProfile(result); setAddress(result.direccion_base);
      setCommuneId(result.comuna?.id ?? ''); setEditing(false);
      setNotice('Ubicación guardada.');
      if (!profile?.comuna) onProfileCreated?.();
    } catch (reason) { setError(workerErrorMessage(reason)); }
    finally { setBusy(false); }
  }

  if (user?.rol !== 'TRABAJADOR') return null;
  const mayEdit = !!verification;
  const needsCommune = !profile?.comuna;
  const showForm = !profile || editing || needsCommune;
  return <View style={styles.card}>
    <Text style={styles.title}>Datos de trabajador</Text>
    {loading && <ActivityIndicator color="#256047" style={styles.loading} />}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {notice && <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text>}
    {!loading && error && <Pressable accessibilityRole="button" onPress={() => setReloadKey((n) => n + 1)}
      style={styles.linkButton}><Text style={styles.link}>Reintentar</Text></Pressable>}
    {!loading && <>
      {!showForm ? <>
        <Text style={styles.label}>Dirección base</Text>
        <Text style={styles.value}>{profile.direccion_base}</Text>
        <Text style={styles.label}>Comuna</Text>
        <Text style={styles.value}>{profile.comuna?.nombre}</Text>
        {mayEdit && <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={styles.linkButton}>
          <Text style={styles.link}>Editar ubicación</Text>
        </Pressable>}
      </> : <>
        {needsCommune && <Text style={styles.hint}>
          Esta cuenta es anterior al registro con comuna. Completa tu ubicación para continuar con los documentos.
        </Text>}
        <Text style={styles.label}>Dirección base</Text>
        <TextInput accessibilityLabel="Dirección base del trabajador" value={address}
          onChangeText={setAddress} editable={!busy} autoCapitalize="words" autoComplete="street-address"
          placeholder="Calle y número" placeholderTextColor="#77847E" style={styles.input} />
        <Text style={styles.label}>Comuna</Text>
        <WorkerCommunePicker communes={communes} selectedId={communeId} onChange={setCommuneId} />
        {communesError && <>
          <Text accessibilityRole="alert" style={styles.error}>{communesError}</Text>
          <Pressable accessibilityRole="button" onPress={() => setReloadKey((n) => n + 1)}
            style={styles.linkButton}><Text style={styles.link}>Reintentar comunas</Text></Pressable>
        </>}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveAddress()}
          style={[styles.button, busy && styles.disabled]}>
          <Text style={styles.buttonText}>{busy ? 'Guardando…' : 'Guardar ubicación'}</Text>
        </Pressable>
        {editing && <Pressable accessibilityRole="button" disabled={busy}
          onPress={() => { setAddress(profile?.direccion_base ?? '');
            setCommuneId(profile?.comuna?.id ?? ''); setEditing(false); }} style={styles.linkButton}>
          <Text style={styles.link}>Cancelar</Text></Pressable>}
      </>}
      {verification && <View style={styles.status}>
        <Text style={styles.label}>Verificación</Text>
        <Text style={styles.value}>{verification.estado}</Text>
        {verification.motivo_rechazo && <Text style={styles.error}>{verification.motivo_rechazo}</Text>}
      </View>}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 20, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#DCE6E1' },
  title: { color: '#14251F', fontSize: 20, fontWeight: '700' },
  hint: { color: '#52615C', fontSize: 14, lineHeight: 21, marginTop: 6 },
  loading: { marginTop: 20 },
  label: { color: '#14251F', fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 7 },
  value: { color: '#14251F', fontSize: 16, marginTop: 8 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: '#14251F' },
  button: { marginTop: 18, minHeight: 52, borderRadius: 10, backgroundColor: '#256047', alignItems: 'center', justifyContent: 'center', padding: 12 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  linkButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 2 },
  link: { color: '#256047', fontSize: 14, fontWeight: '700' },
  status: { marginTop: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#DCE6E1' },
  error: { color: '#B42318', backgroundColor: '#FFF0EE', padding: 12, borderRadius: 8, marginTop: 16 },
  success: { color: '#1D6949', backgroundColor: '#E7F3EC', padding: 12, borderRadius: 8, marginTop: 16 },
  modal: { flex: 1, backgroundColor: '#F5F7F6', padding: 20 },
  communeOption: { minHeight: 52, paddingHorizontal: 12, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#DCE6E1' },
});
