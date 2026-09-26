import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { type Commune, getCommunes } from '../api/auth';
import {
  type ClientProfile, clientProfileErrorMessage, createClientProfile,
  deactivateClientAccount, getClientProfile, isMissingClientProfile, updateClientProfile,
} from '../api/clientProfile';
import { useAuth } from '../auth/AuthContext';
import { WorkerProfileSection } from './WorkerProfileSection';

const profileSchema = z.object({
  nombre: z.string().trim().min(2, 'Ingresa al menos dos caracteres.').max(120),
  telefono: z.string().trim().refine(
    (value) => value === '' || /^[+]?[0-9 ]{8,15}$/.test(value),
    'Ingresa un teléfono válido o deja el campo vacío.',
  ),
  direccion: z.string().trim().min(5, 'Ingresa una dirección de al menos cinco caracteres.').max(200),
  comuna_id: z.uuid('Selecciona una comuna.'),
});
type ProfileValues = z.infer<typeof profileSchema>;

function CommunePicker({
  communes, selectedId, disabled, onChange,
}: { communes: Commune[]; selectedId: string; disabled: boolean; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = communes.find((item) => item.id === selectedId);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Seleccionar comuna"
      disabled={disabled} onPress={() => setOpen(true)} style={[styles.input, styles.picker]}>
      <Text style={selected ? styles.inputText : styles.placeholder}>
        {selected?.nombre ?? 'Selecciona una comuna'}
      </Text>
    </Pressable>
    <Modal animationType="slide" visible={open} onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={styles.page}>
        <View style={styles.modalHeader}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Selecciona tu comuna</Text>
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.textButton}>
            <Text style={styles.link}>Cerrar</Text>
          </Pressable>
        </View>
        <FlatList data={communes} keyExtractor={(item) => item.id} contentContainerStyle={styles.communeList}
          renderItem={({ item }) => <Pressable accessibilityRole="radio"
            accessibilityState={{ checked: item.id === selectedId }}
            onPress={() => { onChange(item.id); setOpen(false); }}
            style={[styles.communeOption, item.id === selectedId && styles.selectedCommune]}>
            <Text style={styles.inputText}>{item.nombre}</Text>
          </Pressable>} />
      </SafeAreaView>
    </Modal>
  </>;
}

export function ProfileScreen({
  onWorkerProfileCreated, onBack,
}: { onWorkerProfileCreated?: () => void; onBack?: () => void }) {
  const { user, withAccessToken, updateUser, signOut } = useAuth();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [communesError, setCommunesError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivationError, setDeactivationError] = useState<string | null>(null);
  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { nombre: '', telefono: '', direccion: '', comuna_id: '' },
  });

  useEffect(() => {
    if (user?.rol !== 'CLIENTE') return;
    let active = true;
    setLoading(true);
    setError(null);
    void withAccessToken(getClientProfile)
      .then((result) => {
        if (!active) return;
        setProfile(result);
        setMissing(false);
        reset({ nombre: result.nombre, telefono: result.telefono ?? '',
          direccion: result.direccion, comuna_id: result.comuna.id });
      })
      .catch((reason) => {
        if (!active) return;
        if (isMissingClientProfile(reason)) {
          setMissing(true);
          reset({ nombre: user.nombre, telefono: '', direccion: '', comuna_id: '' });
        } else setError(clientProfileErrorMessage(reason));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, reloadKey]);

  async function loadCommunes() {
    setCommunesError(null);
    try { setCommunes(await getCommunes()); }
    catch { setCommunesError('No pudimos cargar las comunas. Inténtalo nuevamente.'); }
  }
  useEffect(() => {
    if (user?.rol === 'CLIENTE') void loadCommunes();
  }, [user?.id]);

  function startEditing() {
    if (!profile) return;
    reset({ nombre: profile.nombre, telefono: profile.telefono ?? '',
      direccion: profile.direccion, comuna_id: profile.comuna.id });
    setError(null);
    setNotice(null);
    setEditing(true);
  }

  const save = handleSubmit(async (values) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = missing
        ? await withAccessToken((token) => createClientProfile(token, {
          direccion: values.direccion, comuna_id: values.comuna_id,
        }))
        : await withAccessToken((token) => updateClientProfile(token, {
          nombre: values.nombre, telefono: values.telefono || null,
          direccion: values.direccion, comuna_id: values.comuna_id,
        }));
      setProfile(result);
      setMissing(false);
      setEditing(false);
      updateUser({ nombre: result.nombre });
      reset({ nombre: result.nombre, telefono: result.telefono ?? '',
        direccion: result.direccion, comuna_id: result.comuna.id });
      setNotice(missing ? 'Perfil completado.' : 'Cambios guardados.');
    } catch (reason) { setError(clientProfileErrorMessage(reason)); }
    finally { setSaving(false); }
  });

  async function deactivate() {
    if (deactivating) return;
    setDeactivating(true);
    setDeactivationError(null);
    try {
      await withAccessToken(deactivateClientAccount);
      await signOut();
    } catch (reason) {
      setDeactivationError(clientProfileErrorMessage(reason));
      setConfirmDeactivate(false);
    } finally { setDeactivating(false); }
  }

  if (!user) return null;
  const roles = { CLIENTE: 'Cliente', TRABAJADOR: 'Trabajador', ADMIN: 'Administrador' };
  const showForm = user.rol === 'CLIENTE' && (missing || editing);
  return <SafeAreaView style={styles.page}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>ServiMatch</Text>
        {onBack && <Pressable accessibilityRole="button" onPress={onBack} style={styles.textButton}>
          <Text style={styles.link}>Volver al inicio</Text>
        </Pressable>}
        <Text accessibilityRole="header" style={styles.title}>Mi perfil</Text>
        <Text style={styles.subtitle}>Tus datos personales y de contacto en un solo lugar.</Text>

        <View style={styles.hero}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{user.nombre.slice(0, 1).toUpperCase()}</Text></View>
          <View style={styles.flex}>
            <Text style={styles.heroName}>{profile?.nombre ?? user.nombre}</Text>
            <Text style={styles.heroEmail}>{user.email}</Text>
            <Text style={styles.role}>{roles[user.rol]}</Text>
          </View>
        </View>

        {user.rol === 'CLIENTE' && <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.flex}>
              <Text style={styles.sectionTitle}>{missing ? 'Completa tu perfil' : 'Datos de cliente'}</Text>
              <Text style={styles.sectionHint}>{missing
                ? 'Agrega una dirección para poder solicitar servicios a domicilio.'
                : 'Mantén actualizados tus datos para tus solicitudes.'}</Text>
            </View>
            {profile && !editing && <Pressable accessibilityRole="button" onPress={startEditing}
              style={styles.textButton}><Text style={styles.link}>Editar datos</Text></Pressable>}
          </View>

          {loading && <View style={styles.loading}><ActivityIndicator color="#256047" />
            <Text style={styles.hint}>Cargando perfil…</Text></View>}
          {notice && <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text>}
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {error && (!profile || missing) && <Pressable accessibilityRole="button"
            onPress={() => setReloadKey((value) => value + 1)} style={styles.textButton}>
            <Text style={styles.link}>Reintentar</Text>
          </Pressable>}

          {profile && !editing && !loading && <>
            <Text style={styles.groupLabel}>DATOS PERSONALES</Text>
            <View style={styles.row}><Text style={styles.rowLabel}>Nombre</Text><Text style={styles.rowValue}>{profile.nombre}</Text></View>
            <View style={styles.row}><Text style={styles.rowLabel}>RUT</Text><Text style={styles.rowValue}>{profile.rut}</Text></View>
            <View style={styles.row}><Text style={styles.rowLabel}>Teléfono</Text><Text style={styles.rowValue}>{profile.telefono ?? 'Sin registrar'}</Text></View>
            <Text style={styles.groupLabel}>UBICACIÓN</Text>
            <View style={styles.row}><Text style={styles.rowLabel}>Dirección</Text><Text style={styles.rowValue}>{profile.direccion}</Text></View>
            <View style={styles.row}><Text style={styles.rowLabel}>Comuna</Text><Text style={styles.rowValue}>{profile.comuna.nombre}</Text></View>
          </>}

          {showForm && !loading && <View>
            {!missing && <>
              <Text style={styles.label}>Nombre</Text>
              <Controller control={control} name="nombre" render={({ field: { value, onChange, onBlur } }) =>
                <TextInput value={value} onChangeText={onChange} onBlur={onBlur} accessibilityLabel="Nombre"
                  autoCapitalize="words" editable={!isSubmitting} style={[styles.input, errors.nombre && styles.invalid]} />} />
              {errors.nombre && <Text style={styles.fieldError}>{errors.nombre.message}</Text>}
              <Text style={styles.label}>Teléfono (opcional)</Text>
              <Controller control={control} name="telefono" render={({ field: { value, onChange, onBlur } }) =>
                <TextInput value={value} onChangeText={onChange} onBlur={onBlur} accessibilityLabel="Teléfono"
                  keyboardType="phone-pad" placeholder="+56912345678" placeholderTextColor="#77847E"
                  editable={!isSubmitting} style={[styles.input, errors.telefono && styles.invalid]} />} />
              {errors.telefono && <Text style={styles.fieldError}>{errors.telefono.message}</Text>}
            </>}
            <Text style={styles.label}>Dirección</Text>
            <Controller control={control} name="direccion" render={({ field: { value, onChange, onBlur } }) =>
              <TextInput value={value} onChangeText={onChange} onBlur={onBlur} accessibilityLabel="Dirección"
                autoCapitalize="words" autoComplete="street-address" placeholder="Calle y número"
                placeholderTextColor="#77847E" editable={!isSubmitting}
                style={[styles.input, errors.direccion && styles.invalid]} />} />
            {errors.direccion && <Text style={styles.fieldError}>{errors.direccion.message}</Text>}
            <Text style={styles.label}>Comuna</Text>
            <Controller control={control} name="comuna_id" render={({ field: { value, onChange } }) =>
              <CommunePicker communes={communes} selectedId={value} onChange={onChange}
                disabled={isSubmitting || communes.length === 0} />} />
            {errors.comuna_id && <Text style={styles.fieldError}>{errors.comuna_id.message}</Text>}
            {communesError && <View><Text accessibilityRole="alert" style={styles.fieldError}>{communesError}</Text>
              <Pressable accessibilityRole="button" onPress={() => void loadCommunes()} style={styles.textButton}>
                <Text style={styles.link}>Reintentar carga de comunas</Text></Pressable></View>}
            <Pressable accessibilityRole="button" disabled={isSubmitting || saving || communes.length === 0}
              onPress={() => void save()} style={[styles.primaryButton, (isSubmitting || saving) && styles.disabled]}>
              {saving && <ActivityIndicator color="#FFFFFF" />}
              <Text style={styles.primaryText}>{saving ? 'Guardando…' : missing ? 'Completar perfil' : 'Guardar cambios'}</Text>
            </Pressable>
            {editing && <Pressable accessibilityRole="button" disabled={saving} onPress={() => { setEditing(false); setError(null); }}
              style={styles.textButton}><Text style={styles.link}>Cancelar</Text></Pressable>}
          </View>}
        </View>}

        {user.rol === 'TRABAJADOR' && <WorkerProfileSection onProfileCreated={onWorkerProfileCreated} />}

        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
          <Text style={styles.link}>Cerrar sesión</Text>
        </Pressable>

        {user.rol === 'CLIENTE' && <View style={styles.dangerSection}>
          <Text style={styles.dangerTitle}>Desactivar cuenta</Text>
          <Text style={styles.sectionHint}>Conservaremos el historial, pero ya no podrás ingresar ni solicitar servicios.</Text>
          {deactivationError && <Text accessibilityRole="alert" style={styles.error}>{deactivationError}</Text>}
          {!confirmDeactivate ? <Pressable accessibilityRole="button" onPress={() => setConfirmDeactivate(true)}
            style={styles.textButton}><Text style={styles.dangerLink}>Desactivar mi cuenta</Text></Pressable>
            : <View style={styles.confirmBox}>
              <Text style={styles.dangerTitle}>¿Confirmas la desactivación?</Text>
              <Pressable accessibilityRole="button" disabled={deactivating} onPress={() => void deactivate()}
                style={[styles.dangerButton, deactivating && styles.disabled]}>
                <Text style={styles.primaryText}>{deactivating ? 'Desactivando…' : 'Sí, desactivar cuenta'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={deactivating}
                onPress={() => setConfirmDeactivate(false)} style={styles.textButton}>
                <Text style={styles.link}>Cancelar</Text></Pressable>
            </View>}
        </View>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { padding: 24, paddingBottom: 52, width: '100%', maxWidth: 600, alignSelf: 'center' },
  brand: { color: '#32745C', fontWeight: '700', fontSize: 17, marginBottom: 28 },
  title: { color: '#14251F', fontSize: 32, fontWeight: '800' },
  subtitle: { color: '#52615C', fontSize: 15, lineHeight: 22, marginTop: 7, marginBottom: 22 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, backgroundColor: '#E7F3EC', borderRadius: 18, marginBottom: 18 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#256047' },
  avatarText: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
  heroName: { color: '#14251F', fontSize: 20, fontWeight: '700' },
  heroEmail: { color: '#52615C', fontSize: 13, marginTop: 4 },
  role: { color: '#256047', fontSize: 12, fontWeight: '700', marginTop: 8 },
  card: { padding: 20, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#DCE6E1' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sectionTitle: { color: '#14251F', fontSize: 20, fontWeight: '700' },
  sectionHint: { color: '#52615C', fontSize: 14, lineHeight: 21, marginTop: 5 },
  link: { color: '#256047', fontSize: 14, fontWeight: '700' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  hint: { color: '#52615C', fontSize: 14 },
  success: { color: '#1D6949', backgroundColor: '#E7F3EC', padding: 12, borderRadius: 8, marginTop: 16 },
  error: { color: '#B42318', backgroundColor: '#FFF0EE', padding: 12, borderRadius: 8, marginTop: 16 },
  groupLabel: { color: '#32745C', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 27, marginBottom: 2 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EDF1EE' },
  rowLabel: { color: '#65736E', fontSize: 12 }, rowValue: { color: '#14251F', fontSize: 16, marginTop: 4 },
  label: { color: '#14251F', fontSize: 14, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: '#14251F' },
  picker: { justifyContent: 'center' }, inputText: { color: '#14251F', fontSize: 16 },
  placeholder: { color: '#77847E', fontSize: 16 }, invalid: { borderColor: '#B42318' },
  fieldError: { color: '#B42318', fontSize: 13, marginTop: 7 },
  primaryButton: { marginTop: 25, minHeight: 52, borderRadius: 10, backgroundColor: '#256047', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, padding: 12 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' }, disabled: { opacity: 0.55 },
  textButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 2 },
  signOut: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20, borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 10 },
  dangerSection: { marginTop: 30, paddingTop: 22, borderTopWidth: 1, borderTopColor: '#DCE6E1' },
  dangerTitle: { color: '#8E261C', fontSize: 16, fontWeight: '700' },
  dangerLink: { color: '#B42318', fontSize: 14, fontWeight: '700' },
  confirmBox: { marginTop: 12, padding: 16, backgroundColor: '#FFF0EE', borderRadius: 10 },
  dangerButton: { marginTop: 16, minHeight: 48, borderRadius: 10, backgroundColor: '#B42318', alignItems: 'center', justifyContent: 'center' },
  modalHeader: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#DCE6E1' },
  communeList: { padding: 16 },
  communeOption: { minHeight: 50, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#DCE6E1' },
  selectedCommune: { backgroundColor: '#E7F3EC', borderColor: '#256047', borderWidth: 1 },
});
