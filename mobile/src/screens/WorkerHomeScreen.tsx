import { Ionicons } from '@expo/vector-icons';
import { NotificationBell } from '../components/NotificationBell';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteWorkerService, getOwnServices, WorkerService, workerServicesErrorMessage } from '../api/workerServices';
import type { WorkerVerification } from '../api/workerVerification';
import { useAuth } from '../auth/AuthContext';
import { getUpcomingBookings, bookingOperationError, type Booking } from '../api/bookings';
import { formatBookingDate } from '../services/bookingForm';
import { bookingStatusLabels } from '../services/bookingTracking';

function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
  }).format(price);
}

export function WorkerHomeScreen({
  verification, onRefresh, onPublish, onEdit, onCertifications, publishedServiceName, updatedServiceName, onDismissSuccess, onBooking, onAgenda, onEarnings,
}: {
  verification: WorkerVerification; onRefresh: () => void; onPublish: () => void;
  onCertifications: () => void;
  onEdit: (serviceId: string) => void;
  onBooking: (bookingId: string) => void; onAgenda: () => void;
  onEarnings: () => void;
  publishedServiceName?: string; updatedServiceName?: string; onDismissSuccess: () => void;
}) {
  const { user, withAccessToken } = useAuth();
  const request = useRef(withAccessToken);
  request.current = withAccessToken;
  const [services, setServices] = useState<WorkerService[]>([]);
  const [servicesError, setServicesError] = useState('');
  const [loadingServices, setLoadingServices] = useState(true);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const approved = verification.estado === 'APROBADA';
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const [upcomingError, setUpcomingError] = useState('');
  const [upcomingRetry, setUpcomingRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setLoadingUpcoming(true); setUpcomingError(''); setUpcoming([]);
    void request.current((token) => getUpcomingBookings(token, controller.signal))
      .then((items) => { if (!controller.signal.aborted) setUpcoming(items); })
      .catch((reason) => { if (!controller.signal.aborted) setUpcomingError(bookingOperationError(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingUpcoming(false); });
    return () => controller.abort();
  }, [upcomingRetry]));

  const loadServices = useCallback(async () => {
    setLoadingServices(true);
    setServicesError('');
    try {
      setServices(await request.current(getOwnServices));
    } catch (error) {
      setServicesError(workerServicesErrorMessage(error));
    } finally {
      setLoadingServices(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadServices(); }, [loadServices]));

  async function removeService(service: WorkerService) {
    if (deletingRef.current) return;
    deletingRef.current = true; setDeleting(true); setActionError(''); setActionSuccess('');
    try {
      await request.current((token) => deleteWorkerService(token, service.id));
      setServices((items) => items.map((item) => item.id === service.id ? { ...item, activo: false } : item));
      setDeleteCandidate(null); setActionSuccess(`${service.nombre} fue eliminado de tus publicaciones activas.`);
    } catch (reason) { setActionError(workerServicesErrorMessage(reason)); }
    finally { deletingRef.current = false; setDeleting(false); }
  }

  const activeServices = services.filter((service) => service.activo).length;
  const remainingServices = Math.max(0, 5 - activeServices);
  const canPublish = approved && !loadingServices && !servicesError && activeServices < 5;

  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Panel del trabajador</Text>
          <Text accessibilityRole="header" style={styles.title}>Hola, {user?.nombre ?? 'Trabajador'}</Text>
        </View>
        <NotificationBell />
      </View>

      {!!(publishedServiceName || updatedServiceName) && <View style={styles.successCard}>
        <View style={styles.verificationBody}>
          <Text accessibilityLiveRegion="polite" style={styles.infoTitle}>{updatedServiceName ? 'Servicio actualizado' : 'Servicio publicado'}</Text>
          <Text style={styles.hint}>{updatedServiceName || publishedServiceName} {updatedServiceName ? 'se guardó correctamente.' : 'ya está disponible en el catálogo.'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar confirmación" onPress={onDismissSuccess} style={styles.dismiss}>
          <Ionicons name="close" size={22} color="#256047" />
        </Pressable>
      </View>}

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Tus publicaciones</Text>
        <Text style={styles.summaryValue}>{loadingServices ? 'Cargando…' : `${activeServices} servicios activos`}</Text>
        <Text style={styles.summaryHint}>Puedes mantener hasta 5 servicios activos.</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressActive, { flex: activeServices }]} />
          <View style={{ flex: remainingServices }} />
        </View>
        <View style={styles.summaryFooter}>
          <Text style={styles.summaryFooterText}>{activeServices} de 5 utilizados</Text>
          <Text style={styles.summaryFooterText}>{approved ? 'Identidad aprobada' : 'En revisión'}</Text>
        </View>
      </View>

      {!approved && <View style={styles.verificationCard}>
        <Ionicons name="time-outline" size={24} color="#9A6410" />
        <View style={styles.verificationBody}>
          <Text style={styles.verificationTitle}>Verificación pendiente</Text>
          <Text style={styles.hint}>Recibimos tus documentos. Te avisaremos cuando sean revisados.</Text>
        </View>
        {!approved && <Pressable accessibilityRole="button" onPress={onRefresh} style={styles.linkButton}>
          <Text style={styles.link}>Actualizar estado</Text>
        </Pressable>}
      </View>}

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canPublish }} disabled={!canPublish}
          onPress={onPublish} style={[styles.primaryAction, !canPublish && styles.disabledAction]}>
          <Ionicons name="add" size={26} color="#FFFFFF" />
          <View>
            <Text style={styles.primaryActionText}>Publicar servicio</Text>
            <Text style={styles.primaryActionSoon}>{!approved ? 'Requiere identidad aprobada'
              : loadingServices ? 'Comprobando servicios…' : servicesError ? 'Reintenta cargar tus servicios'
                : activeServices >= 5 ? 'Límite de 5 servicios alcanzado' : 'Crea una nueva publicación'}</Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCertifications} style={styles.secondaryAction}>
          <Ionicons name="ribbon-outline" size={23} color="#14251F" />
          <Text style={styles.secondaryActionText}>Subir certificaciones</Text>
          <Text style={styles.secondaryActionSoon}>Documentos y estado</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>TUS SERVICIOS</Text>
      </View>
      {!!actionError && <Text accessibilityRole="alert" style={styles.errorText}>{actionError}</Text>}
      {!!actionSuccess && <Text accessibilityLiveRegion="polite" style={styles.link}>{actionSuccess}</Text>}
      {loadingServices ? <View style={styles.infoCard}><Text style={styles.hint}>Cargando tus servicios…</Text></View> : servicesError
        ? <View style={styles.infoCard}>
          <Text style={styles.errorText}>{servicesError}</Text>
          <Pressable onPress={() => void loadServices()}><Text style={styles.link}>Reintentar</Text></Pressable>
        </View>
        : activeServices === 0
          ? <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Aún no tienes servicios</Text>
            <Text style={styles.hint}>{approved ? 'Publica tu primer servicio para que los clientes puedan encontrarlo.' : 'Podrás publicar cuando tu identidad esté aprobada.'}</Text>
          </View>
          : services.filter((service) => service.activo).map((service) => <View key={service.id} style={styles.serviceWrapper}>
            <View style={styles.serviceRow}>
            <View style={styles.serviceIcon}>
              <Ionicons name="construct-outline" size={25} color="#087A57" />
            </View>
            <View style={styles.serviceBody}>
              <Text numberOfLines={1} style={styles.serviceName}>{service.nombre}</Text>
              <Text style={styles.serviceMeta}>
                {service.modalidad === 'DOMICILIO' ? 'A domicilio' : 'En taller'} · {formatPrice(service.precio_base)}
              </Text>
            </View>
            <View style={[styles.status, service.activo ? styles.activeStatus : styles.inactiveStatus]}>
              <Text style={service.activo ? styles.activeText : styles.inactiveText}>
                {service.activo ? 'Activo' : 'Inactivo'}
              </Text>
            </View>
            </View>
            <View style={styles.serviceActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${service.nombre}`} disabled={deleting}
                style={styles.serviceAction} onPress={() => { setDeleteCandidate(null); setActionError(''); onEdit(service.id); }}>
                <Ionicons name="create-outline" size={18} color="#256047" /><Text style={styles.link}>Editar</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Eliminar ${service.nombre}`} disabled={deleting}
                style={styles.serviceAction} onPress={() => { setDeleteCandidate(service.id); setActionError(''); setActionSuccess(''); }}>
                <Ionicons name="trash-outline" size={18} color="#A74444" /><Text style={styles.deleteText}>Eliminar</Text>
              </Pressable>
            </View>
            {deleteCandidate === service.id && <View style={styles.deleteNotice}>
              <Text style={styles.infoTitle}>¿Eliminar este servicio?</Text>
              <Text style={styles.hint}>Se retirará del catálogo y del mapa. Las solicitudes existentes conservarán su historial.</Text>
              <View style={styles.serviceActions}>
                <Pressable accessibilityRole="button" disabled={deleting} style={styles.serviceAction} onPress={() => setDeleteCandidate(null)}><Text style={styles.link}>Cancelar</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={deleting} style={styles.serviceAction} onPress={() => void removeService(service)}>
                  {deleting ? <ActivityIndicator color="#A74444" /> : <Text style={styles.deleteText}>Confirmar eliminación</Text>}
                </Pressable>
              </View>
            </View>}
          </View>)}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>GANANCIAS</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Ver mis ganancias" onPress={onEarnings} style={styles.comingCard}>
        <Ionicons name="bar-chart-outline" size={30} color="#82918B" />
        <View>
          <Text style={styles.infoTitle}>Estadísticas de trabajo</Text>
          <Text style={styles.hint}>Ver ganancias simuladas y servicios completados</Text>
        </View>
      </Pressable>

      <View style={[styles.sectionHeader, styles.upcomingHeader]}>
        <Text accessibilityRole="header" style={styles.sectionLabel}>PRÓXIMAS CITAS</Text>
        <Pressable accessibilityRole="button" onPress={onAgenda} style={styles.serviceAction}><Text style={styles.link}>Ver todas</Text></Pressable>
      </View>
      {loadingUpcoming ? <View style={styles.infoCard}><ActivityIndicator color="#087A57" /><Text style={styles.hint}>Cargando próximas citas…</Text></View>
        : upcomingError ? <View style={styles.infoCard}><Text accessibilityRole="alert" style={styles.errorText}>{upcomingError}</Text>
          <Pressable accessibilityRole="button" style={styles.serviceAction} onPress={() => setUpcomingRetry((n) => n + 1)}><Text style={styles.link}>Reintentar</Text></Pressable></View>
          : !upcoming.length ? <View style={styles.infoCard}><Text style={styles.infoTitle}>No tienes próximas citas</Text><Text style={styles.hint}>Tus solicitudes aceptadas aparecerán aquí cuando tengan una fecha futura.</Text></View>
            : upcoming.map((booking) => {
              const start = new Date(booking.inicio_en);
              return <Pressable key={booking.id} accessibilityRole="button" accessibilityLabel={`Ver cita de ${booking.servicio_nombre}, ${formatBookingDate(booking.inicio_en)}`}
                onPress={() => onBooking(booking.id)} style={[styles.serviceWrapper, styles.serviceRow]}>
                <View style={styles.dateBadge}><Text style={styles.dateDay}>{start.getDate()}</Text><Text style={styles.dateMonth}>{start.toLocaleDateString('es-CL', { month: 'short' }).toUpperCase()}</Text></View>
                <View style={styles.serviceBody}><Text style={styles.serviceName}>{booking.servicio_nombre}</Text>
                  <Text style={styles.hint}>{booking.cliente_nombre ?? 'Cliente'} · {booking.comuna_servicio_nombre ?? 'Comuna por confirmar'}</Text>
                  <Text style={styles.hint}>{formatBookingDate(booking.inicio_en)}</Text>
                  <Text style={styles.hint}>{booking.modalidad === 'DOMICILIO' ? 'A domicilio' : 'En local / taller'}</Text>
                  <Text style={styles.link}>{bookingStatusLabels[booking.estado]}</Text></View>
                <Ionicons name="chevron-forward" size={20} color="#087A57" />
              </Pressable>;
            })}

    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  upcomingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dateBadge: { minWidth: 52, borderRadius: 12, backgroundColor: '#DDF2E9', padding: 8, alignItems: 'center' },
  dateDay: { color: '#087A57', fontSize: 24, fontWeight: '900' },
  dateMonth: { color: '#256047', fontSize: 11, fontWeight: '700' },
  successCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginBottom: 14, backgroundColor: '#DDF2E9', borderRadius: 14 },
  dismiss: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  disabledAction: { opacity: 0.5 },
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { padding: 16, paddingBottom: 42, width: '100%', maxWidth: 680, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  eyebrow: { color: '#66756F', fontSize: 13, fontWeight: '600' },
  title: { color: '#14251F', fontSize: 23, fontWeight: '900', marginTop: 2 },
  summaryCard: { padding: 18, backgroundColor: '#087A57', borderRadius: 20 },
  summaryLabel: { color: '#DDF2E9', fontSize: 13, fontWeight: '700' },
  summaryValue: { color: '#FFFFFF', fontSize: 29, fontWeight: '900', marginTop: 10 },
  summaryHint: { color: '#DDF2E9', fontSize: 12, marginTop: 4 },
  progressTrack: { height: 7, flexDirection: 'row', overflow: 'hidden', backgroundColor: '#4CA081', borderRadius: 5, marginTop: 16 },
  progressActive: { backgroundColor: '#FFFFFF', borderRadius: 5 },
  summaryFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  summaryFooterText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  verificationCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginTop: 12, backgroundColor: '#FFF6DF', borderRadius: 14, borderWidth: 1, borderColor: '#F1D799' },
  verificationBody: { flex: 1 },
  verificationTitle: { color: '#6F4709', fontSize: 14, fontWeight: '800' },
  hint: { color: '#66756F', fontSize: 12, lineHeight: 18, marginTop: 3 },
  linkButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 10 },
  link: { color: '#256047', fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  primaryAction: { flex: 1, minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: '#14251F' },
  primaryActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  primaryActionSoon: { color: '#AFC5BB', fontSize: 10, marginTop: 2 },
  secondaryAction: { flex: 1, minHeight: 72, alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE6E1' },
  secondaryActionText: { color: '#14251F', fontSize: 13, fontWeight: '800', marginTop: 3 },
  secondaryActionSoon: { color: '#82918B', fontSize: 10, marginTop: 1 },
  sectionHeader: { marginTop: 26, marginBottom: 11 },
  sectionLabel: { color: '#66756F', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  infoCard: { padding: 18, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#DCE6E1' },
  infoTitle: { color: '#14251F', fontSize: 15, fontWeight: '800' },
  errorText: { color: '#A74444', fontSize: 13, marginBottom: 10 },
  serviceWrapper: { padding: 12, marginBottom: 9, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#DCE6E1' },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  serviceActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 6 },
  serviceAction: { minHeight: 44, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  deleteText: { color: '#A74444', fontSize: 14, fontWeight: '700' },
  deleteNotice: { padding: 12, borderRadius: 12, backgroundColor: '#FFF2EF', marginTop: 8 },
  serviceIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#DDF2E9' },
  serviceBody: { flex: 1 },
  serviceName: { color: '#14251F', fontSize: 14, fontWeight: '800' },
  serviceMeta: { color: '#66756F', fontSize: 11, marginTop: 4 },
  status: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  activeStatus: { backgroundColor: '#DDF2E9' },
  inactiveStatus: { backgroundColor: '#EDF1EE' },
  activeText: { color: '#087A57', fontSize: 10, fontWeight: '800' },
  inactiveText: { color: '#66756F', fontSize: 10, fontWeight: '800' },
  comingCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#DCE6E1' },
});
