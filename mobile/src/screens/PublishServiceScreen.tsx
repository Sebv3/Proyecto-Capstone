import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCategories, type Category } from '../api/catalog';
import { createWorkerService, getOwnService, getOwnServices, updateWorkerService, workerServicesErrorMessage } from '../api/workerServices';
import { getWorkerVerification } from '../api/workerVerification';
import { getWorkerCertifications, type WorkerCertification } from '../api/workerCertifications';
import { useAuth } from '../auth/AuthContext';
import type { WorkerHomeStackParamList } from '../navigation/MainTabNavigators';
import { blurFocusedElementOnWeb } from '../navigation/webFocus';
import { serviceSchema, type ServiceCreateValues, type ServiceFormValues } from '../services/serviceSchema';
import { canPublishInCategory } from '../services/certificationRules';
import { LocationPicker } from '../components/LocationPicker';

const fields = [
  { name: 'nombre', label: 'Nombre del servicio', placeholder: 'Ej. Reparación de grifería', maxLength: 120 },
  { name: 'descripcion', label: 'Descripción', placeholder: 'Explica qué incluye tu servicio y qué debe saber el cliente.', maxLength: 1000 },
  { name: 'precio_base', label: 'Precio base (CLP)', placeholder: 'Ej. 25000' },
  { name: 'duracion_estimada_minutos', label: 'Duración estimada (minutos)', placeholder: 'Ej. 60' },
] as const;

export function PublishServiceScreen({ navigation, route }: NativeStackScreenProps<WorkerHomeStackParamList, 'PublishService'>) {
  const serviceId = route.params?.serviceId;
  const initialized = useRef<string | null>(null);
  const { withAccessToken } = useAuth();
  const request = useRef(withAccessToken);
  request.current = withAccessToken;
  const submitting = useRef(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [restriction, setRestriction] = useState('');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [certifications, setCertifications] = useState<WorkerCertification[]>([]);
  const [certificationsError, setCertificationsError] = useState(false);
  const { control, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } =
    useForm<ServiceFormValues, unknown, ServiceCreateValues>({
      resolver: zodResolver(serviceSchema),
      defaultValues: { categoria_id: '', nombre: '', descripcion: '', precio_base: '', duracion_estimada_minutos: '', ubicacion_publica: '', radio_cobertura_km: '5' },
    });
  const categoryId = watch('categoria_id');
  const modality = watch('modalidad');
  const latitude = watch('latitud');
  const longitude = watch('longitud');
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const disabled = loading || !!loadError || !!restriction || !categories.length || isSubmitting;
  const certificationBlocked = !!selectedCategory?.requiere_certificacion
    && (certificationsError || !canPublishInCategory(selectedCategory, certifications));
  const submitDisabled = disabled || certificationBlocked;

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    setRestriction('');
    void (async () => {
      try {
        const [items, verification, services, certificates, existing] = await Promise.all([
          getCategories(), request.current(getWorkerVerification), request.current(getOwnServices),
          request.current(getWorkerCertifications).then((items) => ({ items, failed: false }))
            .catch(() => ({ items: [] as WorkerCertification[], failed: true })),
          serviceId ? request.current((token) => getOwnService(token, serviceId)) : Promise.resolve(null),
        ]);
        if (!active) return;
        setCategories(items);
        setCertifications(certificates.items);
        setCertificationsError(certificates.failed);
        if (verification.estado !== 'APROBADA') {
          setRestriction('Tu identidad debe estar aprobada antes de publicar un servicio.');
        } else if (!serviceId && services.filter((service) => service.activo).length >= 5) {
          setRestriction('Ya tienes cinco servicios activos. Desactiva uno antes de publicar otro.');
        }
        if (existing && !existing.activo) setRestriction('Este servicio ya fue eliminado de tus publicaciones activas.');
        if (existing && initialized.current !== existing.id) {
          reset({ categoria_id: existing.categoria_id, nombre: existing.nombre, descripcion: existing.descripcion,
            precio_base: String(existing.precio_base), duracion_estimada_minutos: String(existing.duracion_estimada_minutos),
            modalidad: existing.modalidad, ubicacion_publica: existing.ubicacion_publica ?? '',
            latitud: existing.latitud ?? undefined, longitud: existing.longitud ?? undefined,
            radio_cobertura_km: String(existing.radio_cobertura_km ?? 5) });
          initialized.current = existing.id;
        }
      } catch {
        if (active) setLoadError('No pudimos cargar las categorías y comprobar tu cuenta. Inténtalo nuevamente.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [reloadKey, serviceId, reset]));

  const submit = handleSubmit(async (values) => {
    if (submitting.current || submitDisabled) return;
    if (!categories.some((category) => category.id === values.categoria_id)) {
      setError('Selecciona una categoría disponible.');
      return;
    }
    submitting.current = true;
    setError('');
    try {
      const service = await request.current((token) => serviceId
        ? updateWorkerService(token, serviceId, values) : createWorkerService(token, values));
      blurFocusedElementOnWeb();
      navigation.popTo('WorkerDashboard', serviceId
        ? { updatedServiceName: service.nombre } : { publishedServiceName: service.nombre });
    } catch (reason) {
      setError(workerServicesErrorMessage(reason));
    } finally {
      submitting.current = false;
    }
  });

  return <SafeAreaView style={styles.page}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel="Volver al inicio" disabled={isSubmitting}
          onPress={() => { blurFocusedElementOnWeb(); navigation.goBack(); }} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color="#256047" />
          <Text style={styles.link}>Volver</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{serviceId ? 'Editar servicio' : 'Publicar servicio'}</Text>
        <Text style={styles.hint}>{serviceId ? 'Actualiza los datos de tu publicación. Las solicitudes existentes conservan lo acordado al crearse. Completa la ubicación pública para guardar.' : 'Cuéntales a los clientes qué ofreces. Puedes tener hasta cinco servicios activos.'}</Text>

        {loading && <View style={styles.state}><ActivityIndicator color="#087A57" /><Text style={styles.hint}>Preparando el formulario…</Text></View>}
        {!!loadError && <View style={styles.state}>
          <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>
          <Pressable accessibilityRole="button" style={styles.back} onPress={() => setReloadKey((key) => key + 1)}>
            <Text style={styles.link}>Reintentar</Text>
          </Pressable>
        </View>}
        {!!restriction && <Text accessibilityRole="alert" style={styles.notice}>{restriction}</Text>}
        {!loading && !loadError && !categories.length && <Text style={styles.notice}>No hay categorías disponibles para publicar.</Text>}

        <View style={styles.card}>
          <Text style={styles.label}>Categoría</Text>
          <Controller control={control} name="categoria_id" render={({ field: { onChange, value } }) => <>
            <Pressable accessibilityRole="button" accessibilityLabel="Seleccionar categoría" disabled={disabled}
              onPress={() => { blurFocusedElementOnWeb(); setPickerOpen(true); }} style={[styles.input, styles.select, disabled && styles.disabled]}>
              <Text style={[styles.selectText, !selectedCategory && styles.placeholder]}>{selectedCategory?.nombre ?? 'Selecciona una categoría'}</Text>
              <Ionicons name="chevron-down" size={20} color="#66756F" />
            </Pressable>
            <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
              <SafeAreaView style={styles.page}>
                <View style={styles.modalHeader}>
                  <Text accessibilityRole="header" style={styles.modalTitle}>Selecciona una categoría</Text>
                  <Pressable accessibilityRole="button" onPress={() => setPickerOpen(false)} style={styles.back}><Text style={styles.link}>Cerrar</Text></Pressable>
                </View>
                <FlatList data={categories} keyExtractor={(item) => item.id} contentContainerStyle={styles.list}
                  renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: value === item.id }}
                    onPress={() => { onChange(item.id); setError(''); setPickerOpen(false); }}
                    style={[styles.option, value === item.id && styles.selected]}>
                    <Text style={styles.label}>{item.nombre}</Text>
                    <Text style={styles.hint}>{item.descripcion}</Text>
                    {item.requiere_certificacion && <Text style={styles.certification}>Requiere certificación</Text>}
                  </Pressable>} />
              </SafeAreaView>
            </Modal>
          </>} />
          {errors.categoria_id && <Text accessibilityRole="alert" style={styles.error}>{errors.categoria_id.message}</Text>}
          {selectedCategory?.requiere_certificacion && certificationBlocked && <View style={styles.notice}>
            <Text style={styles.noticeText}>Esta categoría requiere: {selectedCategory.certificacion_requerida}.</Text>
            <Text style={styles.noticeText}>{certificationsError ? 'No pudimos comprobar tus certificaciones. Actualiza su estado antes de publicar.'
              : 'Necesitas una certificación aprobada para publicar en esta categoría. Un documento pendiente o rechazado no habilita la publicación.'}</Text>
            <Pressable accessibilityRole="button" disabled={isSubmitting} style={styles.back}
              onPress={() => { blurFocusedElementOnWeb(); navigation.navigate('WorkerCertifications', { categoryId: selectedCategory.id }); }}>
              <Text style={styles.link}>Subir o consultar certificaciones</Text>
            </Pressable>
          </View>}

          {fields.map((field) => {
            const numeric = field.name === 'precio_base' || field.name === 'duracion_estimada_minutos';
            return <View key={field.name} style={styles.field}>
              <Text style={styles.label}>{field.label}</Text>
              <Controller control={control} name={field.name} render={({ field: { onChange, onBlur, value, ref } }) =>
                <TextInput ref={ref} accessibilityLabel={field.label} value={value} onBlur={onBlur}
                  onChangeText={(text) => { onChange(text); setError(''); }} editable={!disabled}
                  placeholder={field.placeholder} placeholderTextColor="#82918B" keyboardType={numeric ? 'number-pad' : 'default'}
                  inputMode={numeric ? 'numeric' : 'text'} multiline={field.name === 'descripcion'}
                  maxLength={'maxLength' in field ? field.maxLength : 16}
                  style={[styles.input, field.name === 'descripcion' && styles.description, disabled && styles.disabled]} />
              } />
              {errors[field.name] && <Text accessibilityRole="alert" style={styles.error}>{errors[field.name]?.message}</Text>}
              {field.name === 'precio_base' && <Text style={styles.hint}>Pesos chilenos, sin puntos ni decimales. Este es tu precio base, sin la comisión de la plataforma.</Text>}
            </View>;
          })}

          <View style={styles.field}>
            <Text style={styles.label}>Modalidad</Text>
            <Controller control={control} name="modalidad" render={({ field: { onChange, value } }) => <View style={styles.modes}>
              {(['DOMICILIO', 'TALLER'] as const).map((mode) => <Pressable key={mode} accessibilityRole="radio"
                accessibilityState={{ checked: value === mode, disabled }} disabled={disabled}
                onPress={() => { onChange(mode); setError(''); }} style={[styles.mode, value === mode && styles.selected]}>
                <Ionicons name={mode === 'DOMICILIO' ? 'home-outline' : 'construct-outline'} size={23} color="#256047" />
                <Text style={styles.label}>{mode === 'DOMICILIO' ? 'A domicilio' : 'En taller'}</Text>
                <Text style={styles.hint}>{mode === 'DOMICILIO' ? 'Vas donde el cliente' : 'Atiendes en tu ubicación'}</Text>
              </Pressable>)}
            </View>} />
            {errors.modalidad && <Text accessibilityRole="alert" style={styles.error}>{errors.modalidad.message}</Text>}
          </View>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <View style={styles.field}>
            <Text style={styles.label}>{modality === 'TALLER' ? 'Dirección pública del taller' : 'Sector público desde donde atiendes'}</Text>
            <Controller control={control} name="ubicacion_publica" render={({ field: { value, onChange, onBlur } }) =>
              <TextInput accessibilityLabel="Ubicación pública del servicio" style={styles.input} value={value} onChangeText={onChange} onBlur={onBlur}
                editable={!disabled} maxLength={240} placeholder={modality === 'TALLER' ? 'Ej. Avenida Central 123, Santiago' : 'Ej. Sector Plaza de Maipú'} placeholderTextColor="#82918B" />} />
            {errors.ubicacion_publica && <Text accessibilityRole="alert" style={styles.error}>{errors.ubicacion_publica.message}</Text>}
            <Text style={styles.hint}>{modality === 'TALLER' ? 'Indica el lugar donde recibes al cliente.' : 'Elige un punto de referencia público. No necesitas indicar tu casa.'} La descripción y el punto aparecerán en el mapa.</Text>
            <Pressable accessibilityRole="button" disabled={disabled} style={styles.back} onPress={() => setLocationPickerOpen(true)}>
              <Ionicons name="location-outline" size={22} color="#256047" /><Text style={styles.link}>{latitude !== undefined && longitude !== undefined ? 'Cambiar punto en el mapa' : 'Elegir punto en el mapa'}</Text>
            </Pressable>
            {latitude !== undefined && longitude !== undefined && <Text style={styles.hint}>Ubicación seleccionada.</Text>}
            {(errors.latitud || errors.longitud) && <Text accessibilityRole="alert" style={styles.error}>Selecciona la ubicación del servicio en el mapa.</Text>}
          </View>
          {modality === 'DOMICILIO' && <View style={styles.field}>
            <Text style={styles.label}>Radio de cobertura (km)</Text>
            <Controller control={control} name="radio_cobertura_km" render={({ field: { value, onChange, onBlur } }) =>
              <TextInput accessibilityLabel="Radio de cobertura en kilómetros" style={styles.input} value={value} onChangeText={onChange} onBlur={onBlur}
                editable={!disabled} keyboardType="number-pad" inputMode="numeric" maxLength={3} />} />
            <Text style={styles.hint}>Entre 1 y 100 km desde el punto seleccionado. Indica hasta dónde te desplazas.</Text>
            {errors.radio_cobertura_km && <Text accessibilityRole="alert" style={styles.error}>{errors.radio_cobertura_km.message}</Text>}
          </View>}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitDisabled, busy: isSubmitting }} disabled={submitDisabled}
            onPress={() => void submit()} style={[styles.button, submitDisabled && styles.disabled]}>
            {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name={serviceId ? 'save-outline' : 'add-circle-outline'} size={22} color="#FFFFFF" />}
            <Text style={styles.buttonText}>{isSubmitting ? 'Guardando…' : serviceId ? 'Guardar cambios' : 'Publicar servicio'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    {locationPickerOpen && <LocationPicker title="Ubicación pública del servicio"
      hint="Elige el punto que se mostrará a los clientes. Escribir la dirección no coloca el marcador automáticamente."
      initial={latitude !== undefined && longitude !== undefined ? { latitud: latitude, longitud: longitude } : undefined}
      onClose={() => setLocationPickerOpen(false)} onSelect={(coords) => {
        setValue('latitud', coords.latitud, { shouldValidate: true, shouldDirty: true });
        setValue('longitud', coords.longitud, { shouldValidate: true, shouldDirty: true });
        setLocationPickerOpen(false);
      }} />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { padding: 16, paddingBottom: 42, width: '100%', maxWidth: 680, alignSelf: 'center' },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  link: { color: '#256047', fontWeight: '700', fontSize: 14 },
  title: { fontSize: 27, fontWeight: '900', color: '#14251F', marginTop: 8 },
  hint: { color: '#66756F', fontSize: 12, lineHeight: 18, marginTop: 5 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, marginTop: 20, borderWidth: 1, borderColor: '#DCE6E1' },
  label: { color: '#14251F', fontSize: 14, fontWeight: '700' },
  field: { marginTop: 20 },
  input: { borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 13, minHeight: 50, fontSize: 15, color: '#14251F', marginTop: 8, backgroundColor: '#FFFFFF' },
  description: { minHeight: 120, textAlignVertical: 'top' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selectText: { flex: 1, color: '#14251F', fontSize: 14 },
  placeholder: { color: '#82918B' },
  disabled: { opacity: 0.5 },
  error: { color: '#A74444', fontSize: 13, marginTop: 8, lineHeight: 19 },
  notice: { padding: 14, backgroundColor: '#FFF6DF', borderRadius: 10, color: '#6F4709', fontSize: 13, marginTop: 12 },
  noticeText: { color: '#6F4709', fontSize: 12, lineHeight: 18, marginTop: 3 },
  certification: { color: '#6F4709', fontSize: 12, marginTop: 6 },
  modes: { flexDirection: 'row', gap: 10, marginTop: 8 },
  mode: { flex: 1, padding: 12, borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 12, gap: 4 },
  selected: { borderColor: '#087A57', backgroundColor: '#E7F3EC' },
  button: { backgroundColor: '#256047', minHeight: 52, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  state: { padding: 18, alignItems: 'center', marginTop: 14 },
  modalHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#DCE6E1' },
  modalTitle: { color: '#14251F', fontSize: 22, fontWeight: '800' },
  list: { padding: 16, gap: 10 },
  option: { padding: 16, borderWidth: 1, borderColor: '#DCE6E1', backgroundColor: '#FFFFFF', borderRadius: 12 },
});
