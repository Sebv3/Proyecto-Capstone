import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getOwnServices, WorkerService, workerServicesErrorMessage } from '../api/workerServices';
import type { WorkerVerification } from '../api/workerVerification';
import { useAuth } from '../auth/AuthContext';
import { HomeCatalogSections } from './HomeCatalogSections';

function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
  }).format(price);
}

export function WorkerHomeScreen({
  verification, onProfile, onRefresh,
}: { verification: WorkerVerification; onProfile: () => void; onRefresh: () => void }) {
  const { user, signOut, withAccessToken } = useAuth();
  const [services, setServices] = useState<WorkerService[]>([]);
  const [servicesError, setServicesError] = useState('');
  const approved = verification.estado === 'APROBADA';

  const loadServices = useCallback(async () => {
    setServicesError('');
    try {
      setServices(await withAccessToken(getOwnServices));
    } catch (error) {
      setServicesError(workerServicesErrorMessage(error));
    }
  }, [withAccessToken]);

  useEffect(() => { void loadServices(); }, [loadServices]);

  const activeServices = services.filter((service) => service.activo).length;
  const remainingServices = Math.max(0, 5 - activeServices);
  const comingSoon = () => Alert.alert('Próximamente', 'Esta función estará disponible en un siguiente Scrum.');

  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Panel del trabajador</Text>
          <Text accessibilityRole="header" style={styles.title}>Hola, {user?.nombre ?? 'Trabajador'}</Text>
        </View>
        <View accessibilityLabel="Notificaciones próximamente" style={styles.notification}>
          <Ionicons name="notifications-outline" size={23} color="#14251F" />
          <View style={styles.notificationDot} />
        </View>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Tus publicaciones</Text>
        <Text style={styles.summaryValue}>{activeServices} servicios activos</Text>
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
        <Pressable accessibilityRole="button" onPress={comingSoon} style={styles.primaryAction}>
          <Ionicons name="add" size={26} color="#FFFFFF" />
          <View>
            <Text style={styles.primaryActionText}>Publicar servicio</Text>
            <Text style={styles.primaryActionSoon}>Próximamente</Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={comingSoon} style={styles.secondaryAction}>
          <Ionicons name="document-text-outline" size={23} color="#14251F" />
          <Text style={styles.secondaryActionText}>Solicitudes</Text>
          <Text style={styles.secondaryActionSoon}>Próximamente</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>TUS SERVICIOS RECIENTES</Text>
      </View>
      {servicesError
        ? <View style={styles.infoCard}>
          <Text style={styles.errorText}>{servicesError}</Text>
          <Pressable onPress={() => void loadServices()}><Text style={styles.link}>Reintentar</Text></Pressable>
        </View>
        : services.length === 0
          ? <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Aún no tienes servicios</Text>
            <Text style={styles.hint}>La publicación desde la aplicación estará disponible próximamente.</Text>
          </View>
          : services.slice(0, 3).map((service) => <View key={service.id} style={styles.serviceCard}>
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
          </View>)}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>GANANCIAS Y PRÓXIMAS CITAS</Text>
      </View>
      <View style={styles.comingCard}>
        <Ionicons name="bar-chart-outline" size={30} color="#82918B" />
        <View>
          <Text style={styles.infoTitle}>Estadísticas de trabajo</Text>
          <Text style={styles.hint}>Ganancias, solicitudes y citas · Próximamente</Text>
        </View>
      </View>

      <HomeCatalogSections onExplore={comingSoon} />

      <Pressable accessibilityRole="button" onPress={onProfile} style={styles.profileButton}>
        <Text style={styles.profileButtonText}>Mi perfil</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
        <Text style={styles.link}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { padding: 16, paddingBottom: 42, width: '100%', maxWidth: 680, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  eyebrow: { color: '#66756F', fontSize: 13, fontWeight: '600' },
  title: { color: '#14251F', fontSize: 23, fontWeight: '900', marginTop: 2 },
  notification: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE6E1', alignItems: 'center', justifyContent: 'center' },
  notificationDot: { position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: '#E33E3E' },
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
  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, marginBottom: 9, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#DCE6E1' },
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
  profileButton: { marginTop: 26, minHeight: 52, borderRadius: 10, backgroundColor: '#256047', alignItems: 'center', justifyContent: 'center' },
  profileButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  signOut: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 10 },
});
