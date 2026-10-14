import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, usePreventRemove, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bookingOperationError, cancelBooking, changeBooking, completeBooking, getBooking, getConfirmationCode,
  type Booking, type BookingAction, type ConfirmationCode } from '../api/bookings';
import { useAuth } from '../auth/AuthContext';
import { getPaymentSummary, simulatePayment, paymentErrorMessage, type PaymentSummary } from '../api/payments';
import { paymentUnavailableReason } from '../services/paymentAvailability';
import { bookingStatusLabels, canCancelBooking, canConfirmBooking, isTerminalBooking, workerActions, type BookingRole } from '../services/bookingTracking';
import { BookingProgressCard, trackingBadges } from '../components/BookingProgressCard';
import { BookingReviewCard } from '../components/BookingReviewCard';
import { getServiceDetail } from '../api/catalog';
import { formatBookingDate } from '../services/bookingForm';
import { formatCatalogPrice } from '../services/catalogFilters';
import { bookingStyles as styles } from '../components/bookingStyles';

type Action = BookingAction | 'cancelar' | 'completar' | 'codigo-confirmacion' | 'simular-pago';
export function BookingTrackingScreen({ bookingId, role, onBack }: { bookingId: string; role: BookingRole; onBack: () => void }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { withAccessToken } = useAuth();
  const request = useRef(withAccessToken); request.current = withAccessToken;
  const busyRef = useRef(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationCode | null>(null);
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [paymentError, setPaymentError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [counterpart, setCounterpart] = useState('');
  const [nameError, setNameError] = useState('');
  const [details, setDetails] = useState(false);
  usePreventRemove(busy, () => {});
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    setLoading(true); setLoadError(''); setError(''); setSuccess(''); setReason(''); setPending(null); setConfirmation(null); setCode('');
    setPayment(null); setPaymentError('');
    setCounterpart('');
    setNameError('');
    void request.current((token) => getBooking(token, bookingId, controller.signal))
      .then(async (item) => {
        if (controller.signal.aborted) return;
        setBooking(item);
        if (role === 'CLIENTE') {
          try {
            const service = await getServiceDetail(item.servicio_id, controller.signal);
            if (!controller.signal.aborted) {
              if (service.trabajador.id !== item.trabajador_id || !service.trabajador.nombre.trim()) {
                throw new Error('El trabajador no coincide con la solicitud.');
              }
              setCounterpart(service.trabajador.nombre);
            }
          } catch {
            if (!controller.signal.aborted) setNameError('No pudimos consultar el nombre del trabajador. Actualiza el estado para reintentar.');
          }
        }
        if (!['PENDIENTE', 'CANCELADA', 'RECHAZADA'].includes(item.estado)) {
          try {
            const summary = await request.current((token) => getPaymentSummary(token, bookingId, controller.signal));
            if (!controller.signal.aborted) setPayment(summary);
          } catch (value) {
            if (!controller.signal.aborted) setPaymentError(paymentErrorMessage(value));
          }
        }
      })
      .catch((value) => { if (!controller.signal.aborted) { setBooking(null); setLoadError(bookingOperationError(value)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); clearInterval(clock); };
  }, [bookingId, retry, role]));

  function select(action: Action) { setPending(action); setError(''); setSuccess(''); }
  async function perform() {
    if (!booking || !pending || busyRef.current || loading) return;
    if (pending === 'simular-pago') {
      const unavailable = paymentUnavailableReason(booking);
      if (unavailable) { setError(unavailable); setPending(null); setNow(Date.now()); return; }
    }
    if (pending === 'cancelar' && (reason.trim().length < 3 || reason.trim().length > 500)) { setError('Indica un motivo de cancelación entre 3 y 500 caracteres.'); return; }
    if (pending === 'completar' && !/^\d{6}$/.test(code.trim())) { setError('Ingresa el código de seis dígitos entregado por el cliente.'); return; }
    busyRef.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      if (pending === 'simular-pago') {
        const result = await request.current((token) => simulatePayment(token, bookingId));
        setBooking(result.solicitud);
        setPayment({ ...result.pago, pago: result.pago });
        setPaymentError('');
        setSuccess('Pago simulado aprobado. No se ha cobrado dinero real.');
      } else if (pending === 'codigo-confirmacion') {
        setConfirmation(await request.current((token) => getConfirmationCode(token, bookingId)));
        setSuccess('Código generado. Entrégalo al trabajador solo cuando el servicio esté terminado y estés conforme.');
      } else {
        const action = pending;
        const next = await request.current((token) => action === 'cancelar' ? cancelBooking(token, bookingId, reason)
          : action === 'completar' ? completeBooking(token, bookingId, code) : changeBooking(token, bookingId, action));
        setBooking(next); setConfirmation(null); setCode(''); setReason('');
        if (next.estado === 'ACEPTADA') {
          try {
            setPayment(await request.current((token) => getPaymentSummary(token, bookingId)));
          } catch (value) { setPaymentError(paymentErrorMessage(value)); }
        } else if (['CANCELADA', 'RECHAZADA'].includes(next.estado)) {
          setPayment(null); setPaymentError('');
        }
        setSuccess('Solicitud actualizada: ' + bookingStatusLabels[next.estado]);
      }
      setPending(null);
    } catch (value) { setError(pending === 'simular-pago' ? paymentErrorMessage(value) : bookingOperationError(value)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const terminal = booking && isTerminalBooking(booking);
  const person = role === 'TRABAJADOR' ? booking?.cliente_nombre || 'Cliente' : counterpart || 'Nombre no disponible';
  const initials = role === 'CLIENTE' && !counterpart ? '?' : person.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const paymentBlocked = booking ? paymentUnavailableReason(booking, now) : null;
  const labels: Record<Action, string> = { aceptar: 'Aceptar solicitud', rechazar: 'Rechazar solicitud', 'en-camino': 'Estoy en camino',
    iniciar: 'Iniciar servicio', listo: 'Listo para retirar', cancelar: 'Cancelar solicitud', completar: 'Finalizar servicio', 'codigo-confirmacion': 'Generar código de finalización', 'simular-pago': 'Simular pago' };
  return <SafeAreaView style={[styles.page, tracking.page]}>
    <View style={[styles.header, styles.width]}><Pressable accessibilityRole="button" accessibilityLabel="Volver a solicitudes" disabled={busy} onPress={onBack} style={tracking.back}>
      <Ionicons name="arrow-back" size={22} color="#162B22" /></Pressable><Text accessibilityRole="header" style={tracking.title}>Solicitud #SM-{bookingId.slice(0, 8).toUpperCase()}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Actualizar estado" disabled={busy || loading} onPress={() => setRetry((n) => n + 1)} style={tracking.refresh}><Ionicons name="refresh-outline" size={19} color="#6B7D74" /></Pressable></View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {loading && <View style={styles.state}><ActivityIndicator color="#087D56" /><Text style={styles.hint}>Actualizando estado…</Text></View>}
        {!!loadError && <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>}
        {!!loadError && <Pressable accessibilityRole="button" disabled={busy || loading} style={styles.action} onPress={() => setRetry((n) => n + 1)}><Text style={styles.link}>Reintentar</Text></Pressable>}
        {booking && !loading && <>
          <View style={tracking.personCard}>
            <View style={tracking.avatar}><Text style={tracking.initials}>{initials}</Text></View>
            <View style={styles.flex}><Text style={tracking.personName}>{person}</Text><Text style={tracking.meta}>{booking.servicio_nombre} · {formatBookingDate(booking.inicio_en)}</Text></View>
            <View style={[tracking.badge, terminal && tracking.terminalBadge, terminal && booking.estado !== 'COMPLETADA' && tracking.cancelledBadge]}><Text style={[tracking.badgeText, terminal && tracking.terminalText, terminal && booking.estado !== 'COMPLETADA' && styles.error]}>{trackingBadges[booking.estado]}</Text></View>
          </View>
          {!!nameError && <Text accessibilityRole="alert" style={styles.error}>{nameError}</Text>}
          <BookingProgressCard booking={booking} role={role} />
          {booking.estado === 'COMPLETADA' && <BookingReviewCard bookingId={booking.id} role={role} />}
          {!terminal && <Pressable accessibilityRole="button" disabled={busy} onPress={() => navigation.navigate('ServiceChat', { bookingId })} style={[styles.button, tracking.chat]}><Ionicons name="chatbubble-outline" size={21} color="#FFFFFF" /><Text style={styles.buttonText}>Ir al chat</Text></Pressable>}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails((value) => !value)} style={tracking.detailsToggle}><Text style={tracking.detailsText}>Detalles del servicio</Text><Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7D74" /></Pressable>
          {details && <View style={styles.card}>
            <Text style={styles.section}>{booking.servicio_nombre}</Text>
            <Text style={styles.hint}>{booking.modalidad === 'DOMICILIO' ? 'A domicilio' : 'En local / taller'} · {booking.duracion_estimada_minutos} min</Text>
            <Text style={styles.text}>{booking.ubicacion_servicio}</Text>
            <Text style={styles.text}>{booking.cliente_nombre ?? 'Cliente'} · {booking.comuna_servicio_nombre ?? 'Comuna por confirmar'}</Text>
            <View style={styles.between}><Text style={styles.label}>Precio base acordado</Text><Text style={styles.value}>{formatCatalogPrice(booking.precio_base)}</Text></View>
            <Text selectable style={styles.hint}>N.º de solicitud: {booking.id}</Text>
            {booking.actualizado_en && <Text style={styles.hint}>Última actualización: {formatBookingDate(booking.actualizado_en)}</Text>}
          </View>}
          {!!paymentError && <Text accessibilityRole="alert" style={styles.error}>{paymentError}</Text>}
          {payment && <View style={styles.card}>
            <Text style={styles.section}>{payment.pago ? 'Pago simulado aprobado' : 'Pago del servicio'}</Text>
            <Text style={styles.hint}>Simulación académica: no se cobra ni se transfiere dinero real.</Text>
            <View style={styles.between}><Text style={[styles.label, styles.flex]}>Tarifa del servicio</Text><Text style={styles.value}>{formatCatalogPrice(payment.tarifa_base)}</Text></View>
            <View style={styles.between}><Text style={[styles.label, styles.flex]}>Comisión de plataforma (15 %)</Text><Text style={styles.value}>{formatCatalogPrice(payment.comision)}</Text></View>
            <View style={styles.between}><Text style={[styles.label, styles.flex]}>Total</Text><Text style={styles.value}>{formatCatalogPrice(payment.monto_total)}</Text></View>
            {payment.pago && <Text selectable style={styles.hint}>Comprobante simulado: {payment.pago.id}</Text>}
            {booking.estado === 'ACEPTADA' && paymentBlocked && <Text accessibilityRole="alert" style={styles.error}>{paymentBlocked}</Text>}
            {booking.estado === 'ACEPTADA' && !paymentBlocked && role === 'TRABAJADOR' && <Text style={styles.text}>El cliente debe confirmar el pago simulado para continuar.</Text>}
          </View>}
          {!!success && <Text accessibilityLiveRegion="polite" style={[styles.text, styles.green]}>{success}</Text>}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!pending && <>
            {role === 'CLIENTE' && booking.estado === 'ACEPTADA' && !paymentBlocked && payment && !payment.pago && <Pressable accessibilityRole="button" disabled={busy} onPress={() => select('simular-pago')} style={styles.button}><Text style={styles.buttonText}>Simular pago</Text></Pressable>}
            {workerActions(booking, role).map(({ action, label }) => <Pressable key={action} accessibilityRole="button" disabled={busy} onPress={() => select(action)}
              style={[styles.button, action === 'rechazar' && tracking.danger]}><Text style={styles.buttonText}>{label}</Text></Pressable>)}
            {canConfirmBooking(booking) && (role === 'CLIENTE' ? <View style={styles.card}><Text style={styles.section}>Autorizar finalización</Text><Text style={styles.text}>Genera el código y entrégalo al trabajador solo cuando el servicio esté terminado y estés conforme.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => select('codigo-confirmacion')} style={styles.button}><Text style={styles.buttonText}>Generar código de finalización</Text></Pressable></View>
              : <View style={styles.card}><Text style={styles.section}>Finalizar servicio</Text><Text style={styles.text}>Cuando termines el servicio, pide al cliente su código de finalización.</Text>
                <TextInput accessibilityLabel="Código de finalización" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="Código de seis dígitos" style={styles.input} />
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => select('completar')} style={styles.button}><Text style={styles.buttonText}>Finalizar servicio</Text></Pressable></View>)}
            {canCancelBooking(booking) && <Pressable accessibilityRole="button" disabled={busy} onPress={() => select('cancelar')} style={styles.action}><Text style={styles.error}>Cancelar solicitud</Text></Pressable>}
          </>}
          {confirmation && role === 'CLIENTE' && <View style={styles.card}><Text style={styles.section}>Código para el trabajador</Text><Text selectable style={tracking.code}>{confirmation.codigo}</Text>
            <Text style={styles.hint}>Vence: {formatBookingDate(confirmation.expira_en)}</Text></View>}
          {pending && <View style={styles.card}>
            <Text style={styles.section}>{labels[pending]}</Text>
            <Text style={styles.text}>{pending === 'aceptar' ? 'Reservarás este horario. Las solicitudes pendientes superpuestas podrán rechazarse automáticamente.'
              : pending === 'simular-pago' ? `Confirmarás un pago simulado de ${formatCatalogPrice(payment?.monto_total ?? 0)}. No se cobrará dinero real y la solicitud quedará pagada.`
              : pending === 'rechazar' ? 'La solicitud terminará como rechazada.' : pending === 'completar' ? 'Confirma solo cuando el servicio esté terminado.' : 'Confirma esta acción para actualizar la solicitud.'}</Text>
            {pending === 'cancelar' && <TextInput accessibilityLabel="Motivo de cancelación" editable={!busy} value={reason} onChangeText={setReason} maxLength={500} multiline placeholder="Indica el motivo" style={styles.input} />}
            <Pressable accessibilityRole="button" disabled={busy || (pending === 'simular-pago' && !!paymentBlocked)} style={[styles.button, (busy || (pending === 'simular-pago' && !!paymentBlocked)) && styles.disabled]} onPress={() => void perform()}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Confirmar</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} style={styles.action} onPress={() => { setPending(null); setError(''); }}><Text style={styles.link}>Volver sin cambios</Text></Pressable>
          </View>}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const tracking = StyleSheet.create({
  page: { backgroundColor: '#F3F6F5' }, back: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E8E3', justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, color: '#162B22', fontSize: 17, fontWeight: '800' }, refresh: { padding: 10 },
  personCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: '#E0E8E3', borderRadius: 18, backgroundColor: '#FFFFFF', boxShadow: '0px 5px 16px rgba(22,43,34,0.05)' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E3F3EC', alignItems: 'center', justifyContent: 'center' }, initials: { color: '#087D56', fontSize: 15, fontWeight: '800' },
  personName: { color: '#162B22', fontSize: 14, fontWeight: '800' }, meta: { color: '#6B7D74', fontSize: 12, lineHeight: 17, marginTop: 3 },
  badge: { backgroundColor: '#E8EEFF', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 10, maxWidth: 100 }, badgeText: { color: '#3267E9', fontSize: 11, fontWeight: '700' },
  terminalBadge: { backgroundColor: '#E3F3EC' }, terminalText: { color: '#087D56' }, chat: { borderRadius: 16, minHeight: 52 },
  cancelledBadge: { backgroundColor: '#FFF0EE' },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, minHeight: 44 }, detailsText: { color: '#6B7D74', fontWeight: '600', fontSize: 13 },
  danger: { backgroundColor: '#A74444' },
  code: { fontSize: 30, fontWeight: '900', color: '#087D56', letterSpacing: 5 },
});
