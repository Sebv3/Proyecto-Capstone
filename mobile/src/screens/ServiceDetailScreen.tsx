import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { catalogErrorMessage, getServiceDetail, type CatalogService } from '../api/catalog';
import { bookingErrorMessage, getAvailability, type Availability } from '../api/bookings';
import { firstBookingStart, formatBookingDate } from '../services/bookingForm';
import { formatCatalogPrice } from '../services/catalogFilters';
import { bookingStyles as styles } from '../components/bookingStyles';

export function ServiceDetailScreen({ serviceId, onBack, onSchedule }: {
  serviceId: string; onBack: () => void; onSchedule: () => void;
}) {
  const [service, setService] = useState<CatalogService | null>(null);
  const [blocks, setBlocks] = useState<Availability[]>([]);
  const [availabilityError, setAvailabilityError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setService(null); setBlocks([]); setAvailabilityError('');
    void Promise.allSettled([getServiceDetail(serviceId, controller.signal), getAvailability(serviceId, controller.signal)])
      .then(([offer, availability]) => {
        if (controller.signal.aborted) return;
        if (offer.status === 'rejected') { setError(catalogErrorMessage(offer.reason)); return; }
        setService(offer.value);
        if (availability.status === 'fulfilled') setBlocks(availability.value
          .filter((block) => block.servicio_id === serviceId && firstBookingStart(block, offer.value.duracion_estimada_minutos))
          .sort((a, b) => Date.parse(a.inicio_en) - Date.parse(b.inicio_en)));
        else setAvailabilityError(bookingErrorMessage(availability.reason));
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [serviceId, retryKey]));
  const initials = service?.trabajador.nombre.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const icon = service?.categoria.slug.includes('electric') ? 'flash-outline'
    : service?.categoria.slug.includes('gas') || service?.categoria.slug.includes('plom') ? 'water-outline' : 'construct-outline';
  return <SafeAreaView style={styles.page}>
    <View style={[styles.header, styles.width]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={styles.back}><Ionicons name="arrow-back" size={22} color="#162B22" /></Pressable>
      <Text accessibilityRole="header" style={styles.headerTitle}>Detalle del servicio</Text>
    </View>
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      {loading && <View style={styles.state}><ActivityIndicator color="#087D56" /><Text style={styles.hint}>Cargando servicio…</Text></View>}
      {!!error && <View style={styles.content}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => setRetryKey((key) => key + 1)}><Text style={styles.link}>Reintentar</Text></Pressable></View>}
      {service && <View style={styles.width}>
        <View style={detail.hero}><View style={detail.heroCircle}><Ionicons name={icon} size={66} color="#066342" /></View></View>
        <View style={[styles.content, { paddingTop: 0 }]}>
          <View style={[styles.card, { marginTop: -32 }]}>
            <View style={[styles.between, { alignItems: 'flex-start' }]}>
              <View style={styles.flex}><Text style={[styles.section, { fontSize: 19 }]}>{service.nombre}</Text><Text style={styles.hint}>{service.categoria.nombre}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={detail.price}>{formatCatalogPrice(service.precio_base)}</Text><Text style={styles.hint}>precio base</Text></View>
            </View>
            <View style={[styles.chips, { marginTop: 8 }]}>
              <View style={[styles.chip, styles.active]}><Ionicons name={service.modalidad === 'DOMICILIO' ? 'car-outline' : 'storefront-outline'} size={17} color="#087D56" />
                <Text style={[styles.label, styles.green]}>{service.modalidad === 'DOMICILIO' ? 'A domicilio' : 'En local / taller'}</Text></View>
              <View style={styles.chip}><Ionicons name="time-outline" size={17} color="#243E30" /><Text style={styles.label}>{service.duracion_estimada_minutos} min</Text></View>
            </View>
          </View>
          <View style={styles.card}><Text style={styles.section}>Descripción</Text><Text style={styles.text}>{service.descripcion}</Text></View>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={detail.avatar}><Text style={detail.initials}>{initials}</Text></View>
              <View style={styles.flex}><Text style={styles.section}>{service.trabajador.nombre}</Text>
                <Text style={styles.text}>{service.trabajador.comuna?.nombre ?? 'Trabajador de ServiMatch'}</Text>
                <Text style={styles.hint}>Identidad verificada</Text></View>
              <Ionicons name="shield-checkmark-outline" size={22} color="#087D56" />
            </View>
            {service.categoria.requiere_certificacion && <><View style={styles.separator} /><View style={styles.row}>
              <Ionicons name="ribbon-outline" size={20} color="#087D56" /><View style={styles.flex}>
                <Text style={[styles.label, styles.green]}>Certificación aprobada</Text><Text style={styles.hint}>{service.categoria.certificacion_requerida}</Text>
              </View></View></>}
          </View>
          {service.ubicacion_publica && <View style={styles.card}>
            <View style={styles.row}><Ionicons name="location-outline" size={20} color="#087D56" /><Text style={styles.section}>{service.modalidad === 'TALLER' ? 'Ubicación del taller' : 'Sector de atención'}</Text></View>
            <Text style={styles.text}>{service.ubicacion_publica}</Text>
            {service.modalidad === 'DOMICILIO' && service.radio_cobertura_km != null && <Text style={styles.hint}>Cobertura declarada: {service.radio_cobertura_km} km desde el punto de referencia.</Text>}
          </View>}
          <Text style={styles.eyebrow}>DISPONIBILIDAD</Text>
          <View style={styles.card}>
            {availabilityError ? <Text accessibilityRole="alert" style={styles.error}>{availabilityError}</Text> : !blocks.length ? <Text style={styles.text}>El trabajador aún no tiene horarios publicados para este servicio.</Text>
              : blocks.slice(0, 3).map((block, index) => <View key={block.id}>
                {index > 0 && <View style={styles.separator} />}
                <Text style={[styles.value, styles.green]}>Horario publicado</Text>
                <Text style={styles.text}>{formatBookingDate(block.inicio_en)} — {formatBookingDate(block.fin_en)}</Text>
              </View>)}
            {blocks.length > 3 && <Text style={styles.hint}>Hay más bloques disponibles. Consúltalos al agendar.</Text>}
            <Pressable accessibilityRole="button" onPress={() => setRetryKey((key) => key + 1)} style={styles.action}><Text style={styles.link}>Actualizar disponibilidad</Text></Pressable>
          </View>
        </View>
      </View>}
    </ScrollView>
    {service && <View style={styles.footer}><Pressable accessibilityRole="button" style={styles.button} onPress={onSchedule}>
      <Ionicons name="calendar-outline" size={21} color="#FFFFFF" /><Text style={styles.buttonText}>Agendar servicio</Text>
    </Pressable></View>}
  </SafeAreaView>;
}
const detail = StyleSheet.create({
  hero: { backgroundColor: '#D7EEE3', height: 160, alignItems: 'center', justifyContent: 'center' },
  heroCircle: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#CBE7D9', alignItems: 'center', justifyContent: 'center' },
  price: { color: '#162B22', fontSize: 24, fontWeight: '900' },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#E4F3EB', justifyContent: 'center', alignItems: 'center' },
  initials: { color: '#087D56', fontSize: 21, fontWeight: '900' },
});
