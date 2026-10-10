import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { availabilityErrorMessage, createAvailability, deleteAvailability, getAvailability, type Availability } from '../api/bookings';
import { getOwnServices, workerServicesErrorMessage, type WorkerService } from '../api/workerServices';
import { useAuth } from '../auth/AuthContext';
import { buildAvailabilityInput, formatBookingDate, localBookingFields } from '../services/bookingForm';
import { BookingCalendar } from '../components/BookingCalendar';

export function WorkerAgendaScreen({ onReservations }: { onReservations?: () => void }) {
  const { withAccessToken } = useAuth();
  const request = useRef(withAccessToken); request.current = withAccessToken;
  const mutating = useRef(false);
  const [services, setServices] = useState<WorkerService[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [servicesError, setServicesError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [blocksRefresh, setBlocksRefresh] = useState(0);
  const [blocks, setBlocks] = useState<Availability[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [blocksError, setBlocksError] = useState('');
  const [date, setDate] = useState(() => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    return localBookingFields(tomorrow).date;
  });
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState<Availability | null>(null);
  const selected = services.find((service) => service.id === selectedId);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setServicesError('');
    void request.current(getOwnServices).then((items) => {
      if (!active) return;
      const offers = items.filter((item) => item.activo);
      setServices(offers);
      setSelectedId((id) => offers.some((offer) => offer.id === id) ? id : offers[0]?.id ?? '');
      setBlocksRefresh((n) => n + 1);
    }).catch((reason) => { if (active) setServicesError(workerServicesErrorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]));

  useEffect(() => {
    const controller = new AbortController();
    setBlocks([]); setBlocksError(''); setBlocksLoading(true); setDeleteCandidate(null);
    if (!selectedId) { setBlocksLoading(false); return () => controller.abort(); }
    void getAvailability(selectedId, controller.signal).then((items) => {
      if (!controller.signal.aborted) setBlocks(items.filter((item) => item.servicio_id === selectedId && Date.parse(item.fin_en) > Date.now())
        .sort((a, b) => Date.parse(a.inicio_en) - Date.parse(b.inicio_en)));
    }).catch((reason) => { if (!controller.signal.aborted) setBlocksError(availabilityErrorMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setBlocksLoading(false); });
    return () => controller.abort();
  }, [selectedId, blocksRefresh]);

  async function publish() {
    if (!selected || mutating.current || loading || blocksLoading || servicesError || blocksError) return;
    setError(''); setSuccess('');
    let input;
    try { input = buildAvailabilityInput(date, startTime, endTime, selected.duracion_estimada_minutos); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Revisa el bloque.'); return; }
    // Avoid accidental duplicate submissions of a displayed interval.
    if (blocks.some((block) => Date.parse(block.inicio_en) === Date.parse(input.inicio_en))) {
      setError('Ya tienes un bloque que comienza a esa hora. Revisa los bloques publicados.'); return;
    }
    mutating.current = true; setSaving(true);
    try {
      const block = await request.current((token) => createAvailability(token, selected.id, input));
      setBlocks((items) => [...items, block].sort((a, b) => Date.parse(a.inicio_en) - Date.parse(b.inicio_en)));
      setSuccess('Disponibilidad publicada. Los clientes pueden consultar este bloque al agendar tu servicio.');
    } catch (reason) { setError(availabilityErrorMessage(reason)); }
    finally { mutating.current = false; setSaving(false); }
  }
  async function remove() {
    if (!selected || !deleteCandidate || mutating.current) return;
    const block = deleteCandidate;
    mutating.current = true; setSaving(true); setError(''); setSuccess('');
    try {
      await request.current((token) => deleteAvailability(token, selected.id, block.id));
      setBlocks((items) => items.filter((item) => item.id !== block.id));
      setDeleteCandidate(null); setSuccess('Bloque eliminado.');
    } catch (reason) { setError(availabilityErrorMessage(reason)); }
    finally { mutating.current = false; setSaving(false); }
  }
  const disabled = saving || loading || blocksLoading || !!servicesError || !!blocksError || !!deleteCandidate;
  return <SafeAreaView style={styles.page}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Panel del trabajador</Text>
        <Text accessibilityRole="header" style={styles.title}>Mi agenda</Text>
        <Text style={styles.hint}>Publica los horarios en que puedes atender cada servicio.</Text>
        {onReservations && <Pressable accessibilityRole="button" onPress={onReservations} style={styles.card}>
          <Text style={styles.title}>Ver reservas</Text><Text style={styles.hint}>Consulta tus servicios aceptados por fecha.</Text>
        </Pressable>}
        {loading ? <ActivityIndicator style={styles.state} color="#087A57" /> : servicesError ? <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>{servicesError}</Text>
          <Pressable accessibilityRole="button" onPress={() => setRefresh((n) => n + 1)} style={styles.action}><Text style={styles.link}>Reintentar</Text></Pressable>
        </View> : !services.length ? <View style={styles.card}><Text style={styles.section}>Todavía no tienes servicios activos</Text>
          <Text style={styles.hint}>Publica un servicio desde Inicio para organizar su disponibilidad.</Text>
        </View> : <>
          <View style={styles.card}><Text style={styles.section}>Selecciona un servicio</Text>
            {services.map((service) => <Pressable key={service.id} accessibilityRole="button" accessibilityState={{ selected: selectedId === service.id, disabled: saving }}
              disabled={saving} style={[styles.offer, selectedId === service.id && styles.selected]} onPress={() => {
                if (mutating.current || service.id === selectedId) return;
                setSelectedId(service.id); setBlocks([]); setBlocksLoading(true); setError(''); setSuccess(''); setDeleteCandidate(null);
              }}><Ionicons name={service.modalidad === 'DOMICILIO' ? 'home-outline' : 'construct-outline'} size={23} color="#087A57" />
              <View style={styles.flex}><Text style={styles.label}>{service.nombre}</Text>
                <Text style={styles.hint}>{service.modalidad === 'DOMICILIO' ? 'A domicilio' : 'En taller'} · {service.duracion_estimada_minutos} minutos</Text></View>
              {selectedId === service.id && <Ionicons name="checkmark-circle" size={22} color="#087A57" />}
            </Pressable>)}
          </View>
          {selected && <>
            <View style={styles.card}><Text style={styles.section}>Publicar disponibilidad</Text>
              <Text style={styles.hint}>Zona horaria: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Indica un bloque del mismo día de al menos {selected.duracion_estimada_minutos} minutos.</Text>
              <View style={{ marginTop: 12 }}><BookingCalendar value={date} onChange={setDate} disabled={disabled} /></View>
              <Text style={styles.label}>Fecha (DD-MM-AAAA)</Text>
              <TextInput accessibilityLabel="Fecha del bloque" style={styles.input} editable={!disabled} value={date} onChangeText={setDate} maxLength={10} placeholder="10-10-2026" />
              <Text style={styles.label}>Hora de inicio (HH:MM)</Text>
              <TextInput accessibilityLabel="Hora de inicio" style={styles.input} editable={!disabled} value={startTime} onChangeText={setStartTime} maxLength={5} keyboardType="numbers-and-punctuation" placeholder="09:00" />
              <Text style={styles.label}>Hora de término (HH:MM)</Text>
              <TextInput accessibilityLabel="Hora de término" style={styles.input} editable={!disabled} value={endTime} onChangeText={setEndTime} maxLength={5} keyboardType="numbers-and-punctuation" placeholder="18:00" />
              <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => void publish()} style={[styles.button, disabled && styles.disabled]}>
                {saving && !deleteCandidate ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Publicar bloque</Text>}
              </Pressable>
            </View>
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            {!!success && <Text accessibilityLiveRegion="polite" style={styles.success}>{success}</Text>}
            <View style={styles.card}><Text style={styles.section}>Bloques publicados</Text>
              <Text style={styles.hint}>Si un bloque coincide con una reserva confirmada, el sistema impedirá eliminarlo.</Text>
              {blocksLoading ? <ActivityIndicator style={styles.state} color="#087A57" /> : blocksError ? <Text accessibilityRole="alert" style={styles.error}>{blocksError}</Text>
                : !blocks.length ? <Text style={styles.hint}>Este servicio todavía no tiene bloques futuros publicados.</Text>
                : blocks.map((block) => <View key={block.id} style={styles.block}>
                  <Text style={styles.label}>{formatBookingDate(block.inicio_en)}</Text>
                  <Text style={styles.hint}>Hasta {formatBookingDate(block.fin_en)}</Text>
                  {deleteCandidate?.id === block.id ? <>
                    <Text style={styles.hint}>¿Eliminar este bloque de disponibilidad?</Text>
                    <View style={styles.row}>
                      <Pressable accessibilityRole="button" disabled={saving} style={styles.action} onPress={() => setDeleteCandidate(null)}><Text style={styles.link}>Conservar</Text></Pressable>
                      <Pressable accessibilityRole="button" disabled={saving} style={styles.action} onPress={() => void remove()}>{saving ? <ActivityIndicator color="#A74444" /> : <Text style={styles.delete}>Eliminar bloque</Text>}</Pressable>
                    </View>
                  </> : <Pressable accessibilityRole="button" disabled={disabled} style={styles.action} onPress={() => { setDeleteCandidate(block); setError(''); setSuccess(''); }}><Text style={styles.delete}>Eliminar</Text></Pressable>}
                </View>)}
              <Pressable accessibilityRole="button" disabled={saving} style={styles.action} onPress={() => { setError(''); setSuccess(''); setBlocksRefresh((n) => n + 1); }}><Text style={styles.link}>Actualizar bloques</Text></Pressable>
            </View>
          </>}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' }, flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 42, width: '100%', maxWidth: 680, alignSelf: 'center' },
  eyebrow: { color: '#087A57', fontSize: 12, fontWeight: '700', marginTop: 12 },
  title: { color: '#14251F', fontSize: 29, fontWeight: '900', marginTop: 6 },
  card: { backgroundColor: '#FFFFFF', padding: 18, marginTop: 18, borderRadius: 18, borderWidth: 1, borderColor: '#DCE6E1' },
  section: { color: '#14251F', fontSize: 18, fontWeight: '800' },
  label: { color: '#14251F', fontSize: 14, fontWeight: '700', marginTop: 10 },
  hint: { color: '#66756F', fontSize: 13, lineHeight: 20, marginTop: 6 },
  offer: { padding: 12, borderWidth: 1, borderColor: '#DCE6E1', borderRadius: 12, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  selected: { borderColor: '#087A57', backgroundColor: '#EFF9F3' },
  input: { color: '#14251F', padding: 12, minHeight: 50, borderWidth: 1, borderColor: '#BCCDC4', borderRadius: 12, marginTop: 8 },
  button: { backgroundColor: '#087A57', minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 14, marginTop: 20 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' }, disabled: { opacity: 0.5 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6, marginTop: 6 },
  link: { color: '#256047', fontSize: 14, fontWeight: '700' }, delete: { color: '#A74444', fontSize: 14, fontWeight: '700' },
  error: { color: '#A74444', fontSize: 14, lineHeight: 21, marginTop: 16 },
  success: { color: '#087A57', fontSize: 14, lineHeight: 21, marginTop: 16 },
  block: { borderTopWidth: 1, borderColor: '#DCE6E1', marginTop: 12, paddingTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 }, state: { marginVertical: 24 },
});
