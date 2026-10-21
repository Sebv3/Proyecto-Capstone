import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Booking, BookingStatus } from '../api/bookings';
import type { BookingRole } from '../services/bookingTracking';
import { readableColors, textLayout } from '../services/accessibility';

const stages = ['Enviada', 'Aceptada', 'Pagada', 'En proceso', 'Completada'];
const indices: Record<BookingStatus, number> = { PENDIENTE: 0, ACEPTADA: 1, PAGADA: 2, EN_CAMINO: 3, EN_CURSO: 3, LISTO: 3, COMPLETADA: 4, CANCELADA: -1, RECHAZADA: -1 };
export const trackingBadges: Record<BookingStatus, string> = {
  PENDIENTE: 'Solicitud enviada', ACEPTADA: 'Aceptada', PAGADA: 'Pago confirmado', EN_CAMINO: 'En camino',
  EN_CURSO: 'En proceso', LISTO: 'Listo para retirar', COMPLETADA: 'Completada', CANCELADA: 'Cancelada', RECHAZADA: 'Rechazada',
};
export function BookingProgressCard({ booking, role }: { booking: Booking; role: BookingRole }) {
  const { width, fontScale } = useWindowDimensions();
  const { stepSize } = textLayout(width, fontScale);
  const current = indices[booking.estado];
  const message: Record<BookingStatus, string> = {
    PENDIENTE: role === 'CLIENTE' ? 'Esperando que el trabajador responda a tu solicitud.' : 'Tienes una nueva solicitud. Revísala para aceptar o rechazar.',
    ACEPTADA: role === 'CLIENTE' ? 'Tu solicitud fue aceptada. Confirma el pago para continuar.' : 'Solicitud aceptada. Esperando que el cliente confirme el pago.',
    PAGADA: role === 'CLIENTE' ? 'Pago confirmado. Coordina los detalles del servicio con el trabajador.' : 'Pago confirmado. Ya puedes continuar con el servicio.',
    EN_CAMINO: 'El trabajador está en camino hacia la dirección del servicio.',
    EN_CURSO: role === 'CLIENTE' ? 'Servicio en curso. Cuando esté terminado y estés conforme, genera el código de finalización.' : 'Servicio en curso. Al terminar, pide al cliente su código para finalizar.',
    LISTO: role === 'CLIENTE' ? 'Tu servicio está listo. Al recogerlo, genera el código y entrégalo al trabajador.' : 'Listo para retirar. Cuando el cliente recoja su trabajo, ingresa su código para finalizar.',
    COMPLETADA: 'Servicio completado con el código del cliente. Gracias por usar ServiMatch.',
    CANCELADA: booking.motivo_cancelacion ?? 'La solicitud fue cancelada.',
    RECHAZADA: 'La solicitud fue rechazada. Puedes buscar otro servicio u horario.',
  };
  if (current < 0) return <View style={s.card}><Text style={s.closed}>{trackingBadges[booking.estado]}</Text><Text style={s.hint}>{message[booking.estado]}</Text></View>;
  return <View style={s.card}>
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={[s.steps,
      (fontScale >= 1.3 || width < 360) && { minWidth: stages.length * 72 * fontScale }]}
      accessibilityLabel={`Estado: ${trackingBadges[booking.estado]}`}>
      {stages.map((label, index) => <View key={label} style={s.step}>
        <View style={[s.top, { minHeight: stepSize }]}>
          {index > 0 && <View style={[s.connector, s.left, index <= current && s.green]} />}
          {index < stages.length - 1 && <View style={[s.connector, s.right, index < current && s.green]} />}
          <View style={[s.dot, { minWidth: stepSize, minHeight: stepSize, borderRadius: stepSize / 2 }, index <= current && s.activeDot]}><Text style={[s.number, index <= current && s.activeNumber]}>{index + 1}</Text></View>
        </View>
        <Text style={[s.label, index <= current && s.activeLabel]}>{index === 3 ? 'En\nproceso' : label}</Text>
      </View>)}
    </ScrollView>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 5, now: current + 1, text: trackingBadges[booking.estado] }} style={s.track}>
      <View style={[s.fill, { width: `${(current + 1) * 20}%` }]} />
    </View>
    <Text accessibilityLiveRegion="polite" style={s.hint}>{message[booking.estado]}</Text>
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E8E3', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 20, gap: 12, boxShadow: '0px 5px 16px rgba(22,43,34,0.05)' },
  steps: { flexDirection: 'row', flexGrow: 1, marginBottom: 8 }, step: { flex: 1, alignItems: 'center', gap: 8 }, top: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  dot: { borderWidth: 2, padding: 3, borderColor: '#E1E8E5', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  activeDot: { borderColor: '#087D56', backgroundColor: '#087D56' }, number: { color: readableColors.secondary, fontSize: 13, fontWeight: '800' }, activeNumber: { color: '#FFFFFF' },
  label: { width: '100%', minHeight: 26, fontSize: 12, lineHeight: 18, fontWeight: '600', color: readableColors.secondary, textAlign: 'center' }, activeLabel: { color: '#087D56' },
  connector: { position: 'absolute', height: 2, width: '50%', backgroundColor: '#E1E8E5' }, left: { left: 0 }, right: { right: 0 }, green: { backgroundColor: '#087D56' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#E1E8E5', overflow: 'hidden' }, fill: { height: '100%', borderRadius: 4, backgroundColor: '#087D56' },
  hint: { fontSize: 13, lineHeight: 20, color: readableColors.secondary }, closed: { color: '#A74444', fontSize: 16, fontWeight: '800' },
});
