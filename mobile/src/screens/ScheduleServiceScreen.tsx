import { Ionicons } from '@expo/vector-icons';
import { usePreventRemove } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getServiceDetail, type CatalogService } from '../api/catalog';
import { bookingErrorMessage, createBooking, getAvailability, type Availability, type Booking } from '../api/bookings';
import { useAuth } from '../auth/AuthContext';
import { buildBookingInput, firstBookingStart, formatBookingDate, getBookingTimes, localBookingFields } from '../services/bookingForm';
import { formatCatalogPrice } from '../services/catalogFilters';
import { BookingCalendar } from '../components/BookingCalendar';
import { bookingStyles as styles } from '../components/bookingStyles';

export function ScheduleServiceScreen({ serviceId, onBack }: { serviceId: string; onBack: () => void }) {
  const { withAccessToken } = useAuth();
  const request = useRef(withAccessToken); request.current = withAccessToken;
  const savingRef = useRef(false);
  const [service, setService] = useState<CatalogService | null>(null);
  const [blocks, setBlocks] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  usePreventRemove(saving, () => {});
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(''); setService(null); setBlocks([]);
    void Promise.all([getServiceDetail(serviceId, controller.signal), getAvailability(serviceId, controller.signal)])
      .then(([offer, availability]) => {
        if (controller.signal.aborted) return;
        const available = availability.filter((block) => block.servicio_id === serviceId && firstBookingStart(block, offer.duracion_estimada_minutos))
          .sort((a, b) => Date.parse(a.inicio_en) - Date.parse(b.inicio_en));
        setService(offer); setBlocks(available);
        setDate((current) => {
          if (getBookingTimes(current, available, offer.duracion_estimada_minutos).length) return current;
          const start = available[0] && firstBookingStart(available[0], offer.duracion_estimada_minutos);
          return start ? localBookingFields(start).date : '';
        });
        setTime('');
      }).catch((reason) => { if (!controller.signal.aborted) setLoadError(bookingErrorMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [serviceId, retry]);

  async function submit() {
    if (!service || savingRef.current || booking || loading || loadError) return;
    setError('');
    let input;
    try { input = buildBookingInput(service, { date, time, address }, blocks); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Revisa los datos.'); return; }
    savingRef.current = true; setSaving(true);
    try { setBooking(await request.current((token) => createBooking(token, input))); }
    catch (reason) { setError(bookingErrorMessage(reason)); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const times = service ? getBookingTimes(date, blocks, service.duracion_estimada_minutos) : [];
  const disabled = saving || loading || !service || !times.includes(time) || !blocks.length
    || (service.modalidad === 'TALLER' && !service.ubicacion_publica);
  const changeDate = (value: string) => { setDate(value); setTime(''); setError(''); };
  return <SafeAreaView style={styles.page}>
    <View style={[styles.header, styles.width]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver al servicio" disabled={saving} onPress={onBack} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color="#162B22" />
      </Pressable>
      <Text accessibilityRole="header" style={styles.headerTitle}>{booking ? 'Solicitud enviada' : 'Agendar cita'}</Text>
    </View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {booking ? <View style={styles.card}>
          <Ionicons name="checkmark-circle" color="#087D56" size={48} />
          <Text style={styles.section}>{booking.servicio_nombre}</Text>
          <Text style={[styles.value, styles.green]}>Pendiente de aceptación</Text>
          <Text style={styles.text}>El trabajador debe aceptar tu solicitud para confirmar la reserva.</Text>
          <Text style={styles.value}>{formatBookingDate(booking.inicio_en)}</Text>
          <Text style={styles.text}>{booking.modalidad === 'DOMICILIO' ? 'A domicilio' : 'En local / taller'}</Text>
          <Text style={styles.text}>{booking.ubicacion_servicio}</Text>
          <Text selectable style={styles.hint}>N.º de solicitud: {booking.id}</Text>
          <Text style={styles.hint}>No se realizó ningún cobro.</Text>
        </View> : <>
          {loading && <View style={styles.state}><ActivityIndicator color="#087D56" /><Text style={styles.hint}>Consultando horarios…</Text></View>}
          {!!loadError && <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>
            <Pressable accessibilityRole="button" style={styles.action} onPress={() => setRetry((n) => n + 1)}><Text style={styles.link}>Reintentar</Text></Pressable></View>}
          {service && <>
            <Text style={styles.eyebrow}>FECHA</Text>
            <BookingCalendar value={date} onChange={changeDate} disabled={saving}
              isDayEnabled={(day) => getBookingTimes(day, blocks, service.duracion_estimada_minutos).length > 0} />
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>Fecha seleccionada (DD-MM-AAAA)</Text>
              <TextInput accessibilityLabel="Fecha de atención" editable={!saving} value={date} onChangeText={changeDate} maxLength={10}
                placeholder="10-10-2026" style={styles.input} />
              <Text style={styles.hint}>Hora local: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
            </View>
            <Text style={styles.eyebrow}>HORA</Text>
            <View style={styles.chips}>{times.map((hour) => <Pressable key={hour} accessibilityRole="button" accessibilityLabel={'Agendar a las ' + hour}
              accessibilityState={{ selected: time === hour, disabled: saving }} disabled={saving} style={[styles.chip, time === hour && styles.active]}
              onPress={() => { setTime(hour); setError(''); }}><Text style={[styles.value, time === hour && styles.green]}>{hour}</Text></Pressable>)}</View>
            {!times.length && <Text style={styles.text}>{blocks.length ? 'Elige un día habilitado en el calendario para consultar sus horarios.' : 'El trabajador aún no tiene horarios publicados para este servicio.'}</Text>}
            {!!time && <Text style={styles.hint}>Inicio: {time} · Duración estimada: {service.duracion_estimada_minutos} minutos</Text>}
            <Pressable accessibilityRole="button" disabled={saving} style={styles.action} onPress={() => setRetry((n) => n + 1)}><Text style={styles.link}>Actualizar horarios</Text></Pressable>
            <Text style={styles.eyebrow}>MODALIDAD</Text>
            <View style={[styles.card, styles.active]}>
              <View style={styles.row}>
                <Ionicons name={service.modalidad === 'DOMICILIO' ? 'car-outline' : 'storefront-outline'} size={27} color="#087D56" />
                <View style={styles.flex}><Text style={styles.section}>{service.modalidad === 'DOMICILIO' ? 'A domicilio' : 'En local / taller'}</Text>
                  <Text style={styles.hint}>{service.modalidad === 'DOMICILIO' ? 'El trabajador se desplaza a tu dirección.' : 'Asistes al establecimiento del trabajador.'}</Text></View>
                <Ionicons name="radio-button-on" size={23} color="#087D56" />
              </View>
            </View>
            <View style={styles.card}>
              <View style={styles.row}><Ionicons name="location-outline" size={17} color="#087D56" /><Text style={[styles.label, styles.green]}>{service.modalidad === 'DOMICILIO' ? 'Dirección del servicio' : 'Dirección del taller'}</Text></View>
              {service.modalidad === 'DOMICILIO' ? <>
                <TextInput accessibilityLabel="Dirección de atención" editable={!saving} value={address} onChangeText={setAddress} maxLength={240}
                  placeholder="Calle, número, departamento y comuna" style={styles.input} />
                <Text style={styles.hint}>Se comparte con el trabajador de esta solicitud.</Text>
              </> : <Text style={styles.text}>{service.ubicacion_publica ?? 'El trabajador todavía no publicó la dirección del taller.'}</Text>}
            </View>
            <Text style={styles.eyebrow}>RESUMEN DE LA SOLICITUD</Text>
            <View style={styles.card}>
              <View style={styles.between}><Text style={styles.label}>Servicio</Text><Text style={[styles.value, { flex: 1, textAlign: 'right' }]}>{service.nombre}</Text></View>
              <View style={styles.between}><Text style={styles.label}>Precio base</Text><Text style={styles.value}>{formatCatalogPrice(service.precio_base)}</Text></View>
              {!!time && <View style={styles.between}><Text style={styles.label}>Fecha y hora</Text><Text style={styles.value}>{date} · {time}</Text></View>}
              <View style={styles.separator} />
              <View style={styles.between}><Text style={styles.section}>Cobro al enviar</Text><Text style={styles.section}>{formatCatalogPrice(0)}</Text></View>
              <Text style={styles.hint}>La solicitud queda pendiente de aceptación. El pago y su desglose corresponden al paso posterior.</Text>
            </View>
            <Text style={styles.hint}>Los horarios corresponden a los bloques publicados; se comprueban al enviar y al aceptar.</Text>
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          </>}
        </>}
      </ScrollView>
      {(service || booking) && <View style={styles.footer}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !booking && !!disabled }} disabled={!booking && !!disabled}
          onPress={booking ? onBack : () => void submit()} style={[styles.button, !booking && disabled && styles.disabled]}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{booking ? 'Volver al servicio' : 'Enviar solicitud'}</Text>}
        </Pressable>
        {!booking && <Text style={[styles.hint, { textAlign: 'center' }]}>Sin pago aún · esperando confirmación del trabajador</Text>}
      </View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
