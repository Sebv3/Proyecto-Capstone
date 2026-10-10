import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bookingOperationError, cancelBooking, changeBooking, completeBooking, getBooking, getConfirmationCode,
  type Booking, type BookingAction, type ConfirmationCode } from '../api/bookings';
import { useAuth } from '../auth/AuthContext';
import { bookingStatusLabels, bookingSteps, canCancelBooking, canConfirmBooking, isTerminalBooking, workerActions, type BookingRole } from '../services/bookingTracking';
import { formatBookingDate } from '../services/bookingForm';
import { formatCatalogPrice } from '../services/catalogFilters';
import { bookingStyles as styles } from '../components/bookingStyles';

type Action = BookingAction | 'cancelar' | 'completar' | 'codigo-confirmacion';
export function BookingTrackingScreen({ bookingId, role, onBack }: { bookingId: string; role: BookingRole; onBack: () => void }) {
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
  usePreventRemove(busy, () => {});
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(''); setError(''); setSuccess(''); setReason(''); setPending(null); setConfirmation(null); setCode('');
    void request.current((token) => getBooking(token, bookingId, controller.signal))
      .then((item) => { if (!controller.signal.aborted) setBooking(item); })
      .catch((value) => { if (!controller.signal.aborted) { setBooking(null); setLoadError(bookingOperationError(value)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [bookingId, retry]));

  function select(action: Action) { setPending(action); setError(''); setSuccess(''); }
  async function perform() {
    if (!booking || !pending || busyRef.current || loading) return;
    if (pending === 'cancelar' && (reason.trim().length < 3 || reason.trim().length > 500)) { setError('Indica un motivo de cancelación entre 3 y 500 caracteres.'); return; }
    if (pending === 'completar' && !/^\d{6}$/.test(code.trim())) { setError('Ingresa el código de seis dígitos entregado por el trabajador.'); return; }
    busyRef.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      if (pending === 'codigo-confirmacion') {
        setConfirmation(await request.current((token) => getConfirmationCode(token, bookingId)));
        setSuccess('Código generado. Entrégalo al cliente cuando el servicio esté terminado.');
      } else {
        const action = pending;
        const next = await request.current((token) => action === 'cancelar' ? cancelBooking(token, bookingId, reason)
          : action === 'completar' ? completeBooking(token, bookingId, code) : changeBooking(token, bookingId, action));
        setBooking(next); setConfirmation(null); setCode(''); setReason('');
        setSuccess('Solicitud actualizada: ' + bookingStatusLabels[next.estado]);
      }
      setPending(null);
    } catch (value) { setError(bookingOperationError(value)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const terminal = booking && isTerminalBooking(booking);
  const steps = booking ? bookingSteps(booking.modalidad) : [];
  const current = booking ? steps.indexOf(booking.estado) : -1;
  const labels: Record<Action, string> = { aceptar: 'Aceptar solicitud', rechazar: 'Rechazar solicitud', 'en-camino': 'Estoy en camino',
    iniciar: 'Iniciar servicio', listo: 'Listo para retirar', cancelar: 'Cancelar solicitud', completar: 'Confirmar finalización', 'codigo-confirmacion': 'Generar código de finalización' };
  return <SafeAreaView style={styles.page}>
    <View style={[styles.header, styles.width]}><Pressable accessibilityRole="button" accessibilityLabel="Volver a solicitudes" disabled={busy} onPress={onBack} style={styles.back}>
      <Ionicons name="arrow-back" size={22} color="#162B22" /></Pressable><Text accessibilityRole="header" style={styles.headerTitle}>Seguimiento del servicio</Text></View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {loading && <View style={styles.state}><ActivityIndicator color="#087D56" /><Text style={styles.hint}>Actualizando estado…</Text></View>}
        {!!loadError && <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>}
        <Pressable accessibilityRole="button" disabled={busy || loading} style={styles.action} onPress={() => { setError(''); setSuccess(''); setRetry((n) => n + 1); }}><Text style={styles.link}>Actualizar estado</Text></Pressable>
        {booking && !loading && <>
          <View style={styles.card}><Text style={styles.section}>{booking.servicio_nombre}</Text>
            <Text style={[styles.value, terminal && booking.estado !== 'COMPLETADA' ? styles.error : styles.green]}>{bookingStatusLabels[booking.estado]}</Text>
            <Text style={styles.text}>{formatBookingDate(booking.inicio_en)}</Text>
            <Text style={styles.hint}>{booking.modalidad === 'DOMICILIO' ? 'A domicilio' : 'En local / taller'} · {booking.duracion_estimada_minutos} min</Text>
            <Text style={styles.text}>{booking.ubicacion_servicio}</Text>
            <View style={styles.between}><Text style={styles.label}>Precio base acordado</Text><Text style={styles.value}>{formatCatalogPrice(booking.precio_base)}</Text></View>
            <Text selectable style={styles.hint}>N.º de solicitud: {booking.id}</Text>
            {booking.actualizado_en && <Text style={styles.hint}>Última actualización: {formatBookingDate(booking.actualizado_en)}</Text>}
          </View>
          {booking.estado === 'CANCELADA' || booking.estado === 'RECHAZADA' ? <View style={styles.card}>
            <Ionicons name="close-circle-outline" size={34} color="#A74444" />
            <Text style={styles.section}>{booking.estado === 'CANCELADA' ? 'Solicitud cancelada' : 'Solicitud rechazada'}</Text>
            <Text style={styles.text}>{booking.motivo_cancelacion ?? 'La solicitud fue rechazada. Una solicitud superpuesta también puede rechazarse al aceptar otra reserva para ese horario.'}</Text>
          </View> : <View style={styles.card}><Text style={styles.section}>Avance del servicio</Text>
            {steps.map((state, index) => <View key={state} style={tracking.step}>
              <View style={tracking.rail}><View style={[tracking.dot, index <= current && tracking.done]}>
                {index < current || booking.estado === 'COMPLETADA' ? <Ionicons name="checkmark" color="#FFFFFF" size={16} /> : <Text style={index === current ? tracking.currentNumber : styles.hint}>{index + 1}</Text>}
              </View>{index < steps.length - 1 && <View style={[tracking.line, index < current && tracking.done]} />}</View>
              <View style={[styles.flex, { paddingTop: 5 }]}><Text style={[styles.value, index === current && styles.green]}>{state === 'ACEPTADA' ? 'Aceptada' : bookingStatusLabels[state]}</Text>
                <Text style={styles.hint}>{index < current || booking.estado === 'COMPLETADA' ? 'Paso completado' : index === current ? 'Estado actual' : 'Próximo paso'}</Text></View>
            </View>)}
          </View>}
          {booking.estado === 'ACEPTADA' && <View style={styles.card}><Text style={styles.section}>Pendiente de pago</Text>
            <Text style={styles.text}>La solicitud ya fue aceptada. El avance al servicio requiere confirmar el pago; la integración de pago todavía no está disponible en la app.</Text></View>}
          {!!success && <Text accessibilityLiveRegion="polite" style={[styles.text, styles.green]}>{success}</Text>}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!pending && <>
            {workerActions(booking, role).map(({ action, label }) => <Pressable key={action} accessibilityRole="button" disabled={busy} onPress={() => select(action)}
              style={[styles.button, action === 'rechazar' && tracking.danger]}><Text style={styles.buttonText}>{label}</Text></Pressable>)}
            {canConfirmBooking(booking) && (role === 'TRABAJADOR' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => select('codigo-confirmacion')} style={styles.button}><Text style={styles.buttonText}>Generar código de finalización</Text></Pressable>
              : <View style={styles.card}><Text style={styles.section}>Confirmar finalización</Text><Text style={styles.text}>Cuando el servicio esté terminado, pide el código al trabajador.</Text>
                <TextInput accessibilityLabel="Código de finalización" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="Código de seis dígitos" style={styles.input} />
                <Pressable accessibilityRole="button" onPress={() => select('completar')} style={styles.button}><Text style={styles.buttonText}>Confirmar servicio terminado</Text></Pressable></View>)}
            {canCancelBooking(booking) && <Pressable accessibilityRole="button" disabled={busy} onPress={() => select('cancelar')} style={styles.action}><Text style={styles.error}>Cancelar solicitud</Text></Pressable>}
          </>}
          {confirmation && <View style={styles.card}><Text style={styles.section}>Código para el cliente</Text><Text selectable style={tracking.code}>{confirmation.codigo}</Text>
            <Text style={styles.hint}>Vence: {formatBookingDate(confirmation.expira_en)}</Text></View>}
          {pending && <View style={styles.card}>
            <Text style={styles.section}>{labels[pending]}</Text>
            <Text style={styles.text}>{pending === 'aceptar' ? 'Reservarás este horario. Las solicitudes pendientes superpuestas podrán rechazarse automáticamente.'
              : pending === 'rechazar' ? 'La solicitud terminará como rechazada.' : pending === 'completar' ? 'Confirma solo cuando el servicio esté terminado.' : 'Confirma esta acción para actualizar la solicitud.'}</Text>
            {pending === 'cancelar' && <TextInput accessibilityLabel="Motivo de cancelación" editable={!busy} value={reason} onChangeText={setReason} maxLength={500} multiline placeholder="Indica el motivo" style={styles.input} />}
            <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, busy && styles.disabled]} onPress={() => void perform()}>
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
  step: { flexDirection: 'row', gap: 14, minHeight: 67 }, rail: { width: 30, alignItems: 'center' },
  dot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#E3EBE6', alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: '#087D56' }, line: { width: 2, flex: 1, marginTop: 4, marginBottom: 4, backgroundColor: '#E3EBE6' },
  currentNumber: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, danger: { backgroundColor: '#A74444' },
  code: { fontSize: 30, fontWeight: '900', color: '#087D56', letterSpacing: 5 },
});
