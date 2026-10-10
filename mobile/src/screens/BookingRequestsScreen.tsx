import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BOOKING_PAGE_SIZE, bookingOperationError, getBookings, type Booking, type BookingFilters, type BookingStatus } from '../api/bookings';
import { useAuth } from '../auth/AuthContext';
import { bookingStatusLabels, type BookingRole } from '../services/bookingTracking';
import { bookingDayRange, formatBookingDate, localBookingFields } from '../services/bookingForm';
import { formatCatalogPrice } from '../services/catalogFilters';
import { BookingCalendar } from '../components/BookingCalendar';
import { bookingStyles as styles } from '../components/bookingStyles';

export function BookingRequestsScreen({ role, onBooking, agenda = false, onAvailability }: {
  role: BookingRole; onBooking: (id: string) => void; agenda?: boolean; onAvailability?: () => void;
}) {
  const { withAccessToken } = useAuth();
  const request = useRef(withAccessToken); request.current = withAccessToken;
  const controller = useRef<AbortController | null>(null);
  const moreRef = useRef(false);
  const [items, setItems] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<BookingStatus | ''>(role === 'TRABAJADOR' && !agenda ? 'PENDIENTE' : '');
  const [date, setDate] = useState(localBookingFields(new Date()).date);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const filters: BookingFilters = { estado: filter || undefined, agenda: agenda || undefined,
    ...(agenda ? bookingDayRange(date) ?? {} : {}) };
  useFocusEffect(useCallback(() => {
    const pending = new AbortController(); controller.current = pending;
    moreRef.current = false; setMoreLoading(false); setLoading(true); setError(''); setItems([]); setHasMore(false);
    const range = agenda ? bookingDayRange(date) : null;
    if (agenda && !range) { setError('Indica una fecha válida en formato DD-MM-AAAA.'); setLoading(false); return () => pending.abort(); }
    void request.current((token) => getBookings(token, { estado: filter || undefined, agenda: agenda || undefined, ...range }, pending.signal))
      .then((rows) => { if (!pending.signal.aborted) { setItems(rows); setHasMore(rows.length === BOOKING_PAGE_SIZE); } })
      .catch((reason) => { if (!pending.signal.aborted) setError(bookingOperationError(reason)); })
      .finally(() => { if (!pending.signal.aborted) setLoading(false); });
    return () => pending.abort();
  }, [filter, date, retry, agenda]));
  async function more() {
    const pending = controller.current;
    if (!pending || pending.signal.aborted || loading || moreRef.current || !hasMore) return;
    moreRef.current = true; setMoreLoading(true); setError('');
    try {
      const rows = await request.current((token) => getBookings(token, { ...filters, offset: items.length }, pending.signal));
      if (!pending.signal.aborted) { setItems((current) => [...current, ...rows]); setHasMore(rows.length === BOOKING_PAGE_SIZE); }
    } catch (reason) { if (!pending.signal.aborted) setError(bookingOperationError(reason)); }
    finally { if (!pending.signal.aborted) { moreRef.current = false; setMoreLoading(false); } }
  }
  const states = Object.keys(bookingStatusLabels) as BookingStatus[];
  const options = agenda ? states.filter((state) => !['PENDIENTE', 'CANCELADA', 'RECHAZADA'].includes(state)) : states;
  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{role === 'TRABAJADOR' ? 'PANEL DEL TRABAJADOR' : 'MIS SERVICIOS'}</Text>
      <Text accessibilityRole="header" style={[styles.headerTitle, { fontSize: 27, flex: 0 }]}>{agenda ? 'Reservas de mi agenda' : role === 'TRABAJADOR' ? 'Solicitudes recibidas' : 'Mis solicitudes'}</Text>
      <Text style={styles.text}>{agenda ? 'Reservas aceptadas y su avance, ordenadas por la hora de inicio del día elegido.'
        : role === 'TRABAJADOR' ? 'Abre una solicitud para revisar sus datos y responder al cliente.' : 'Consulta tus solicitudes y sigue el avance de cada servicio.'}</Text>
      {onAvailability && <Pressable accessibilityRole="button" style={styles.action} onPress={onAvailability}><Text style={styles.link}>Gestionar disponibilidad</Text></Pressable>}
      {agenda && <>
        <BookingCalendar value={date} onChange={setDate} isDayEnabled={() => true} />
        <TextInput accessibilityLabel="Fecha de la agenda" value={date} onChangeText={setDate} maxLength={10} placeholder="09-10-2026" style={styles.input} />
        <Text style={styles.hint}>DD-MM-AAAA · Hora local: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
      </>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
        {(['', ...options] as (BookingStatus | '')[]).map((state) => <Pressable key={state || 'ALL'} accessibilityRole="button"
          accessibilityState={{ selected: filter === state }} onPress={() => setFilter(state)} style={[styles.chip, filter === state && styles.active]}>
          <Text style={[styles.label, filter === state && styles.green]}>{state ? bookingStatusLabels[state] : 'Todas'}</Text>
        </Pressable>)}
      </ScrollView>
      <Pressable accessibilityRole="button" style={styles.action} disabled={loading || moreLoading} onPress={() => setRetry((n) => n + 1)}><Text style={styles.link}>Actualizar solicitudes</Text></Pressable>
      {loading && <View style={styles.state}><ActivityIndicator color="#087D56" /><Text style={styles.hint}>Consultando solicitudes…</Text></View>}
      {!!error && <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => setRetry((n) => n + 1)}><Text style={styles.link}>Reintentar</Text></Pressable></View>}
      {!loading && !error && !items.length && <View style={styles.card}><Ionicons name="calendar-outline" size={32} color="#82968A" />
        <Text style={styles.section}>{agenda ? 'No tienes reservas para esta fecha' : 'No hay solicitudes en este filtro'}</Text>
        <Text style={styles.hint}>{agenda ? 'Las solicitudes aparecen aquí una vez aceptadas.' : 'Puedes cambiar el filtro o actualizar la lista.'}</Text></View>}
      {items.map((booking) => <Pressable key={booking.id} accessibilityRole="button" accessibilityLabel={'Ver solicitud de ' + booking.servicio_nombre}
        onPress={() => onBooking(booking.id)} style={styles.card}>
        <View style={styles.between}><Text style={[styles.section, styles.flex]}>{booking.servicio_nombre}</Text><Ionicons name="chevron-forward" size={20} color="#087D56" /></View>
        <Text style={[styles.value, styles.green]}>{bookingStatusLabels[booking.estado]}</Text>
        <Text style={styles.text}>{formatBookingDate(booking.inicio_en)}</Text>
        <Text style={styles.hint}>{booking.modalidad === 'DOMICILIO' ? 'A domicilio' : 'En local / taller'} · {booking.duracion_estimada_minutos} min · {formatCatalogPrice(booking.precio_base)}</Text>
        <Text style={styles.text}>{booking.ubicacion_servicio}</Text>
      </Pressable>)}
      {hasMore && <Pressable accessibilityRole="button" disabled={loading || moreLoading} onPress={() => void more()} style={styles.button}>
        {moreLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Cargar más</Text>}
      </Pressable>}
    </ScrollView>
  </SafeAreaView>;
}
