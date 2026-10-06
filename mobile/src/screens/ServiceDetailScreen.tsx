import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { catalogErrorMessage, getServiceDetail, type CatalogService } from '../api/catalog';
import { formatCatalogPrice } from '../services/catalogFilters';

export function ServiceDetailScreen({ serviceId, onBack }: { serviceId: string; onBack: () => void }) {
  const [service, setService] = useState<CatalogService | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setService(null);
    void getServiceDetail(serviceId, controller.signal).then((item) => {
      if (!controller.signal.aborted) setService(item);
    }).catch((reason) => {
      if (!controller.signal.aborted) setError(catalogErrorMessage(reason));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [serviceId, retryKey]));

  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color="#256047" /><Text style={styles.link}>Volver</Text>
      </Pressable>
      {loading && <View style={styles.state}><ActivityIndicator color="#087A57" /><Text style={styles.hint}>Cargando servicio…</Text></View>}
      {!!error && <View style={styles.state}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => setRetryKey((key) => key + 1)} style={styles.back}><Text style={styles.link}>Reintentar</Text></Pressable></View>}
      {service && <>
        <Text style={styles.category}>{service.categoria.nombre}</Text>
        <Text accessibilityRole="header" style={styles.title}>{service.nombre}</Text>
        <View style={styles.card}>
          <Text style={styles.hint}>Precio base</Text>
          <Text style={styles.price}>{formatCatalogPrice(service.precio_base)}</Text>
          <Text style={styles.hint}>La comisión de la plataforma se calculará al contratar.</Text>
          <View style={styles.fact}>
            <Ionicons name={service.modalidad === 'DOMICILIO' ? 'home-outline' : 'construct-outline'} size={24} color="#087A57" />
            <View style={styles.flex}><Text style={styles.label}>{service.modalidad === 'DOMICILIO' ? 'A domicilio' : 'En taller'}</Text>
              <Text style={styles.hint}>{service.modalidad === 'DOMICILIO' ? 'El trabajador realiza el servicio en la ubicación del cliente.' : 'El servicio se realiza en la ubicación del trabajador.'}</Text></View>
          </View>
          <View style={styles.fact}><Ionicons name="time-outline" size={24} color="#087A57" /><Text style={styles.label}>{service.duracion_estimada_minutos} minutos estimados</Text></View>
        </View>
        <View style={styles.card}><Text style={styles.sectionTitle}>Descripción del servicio</Text><Text style={styles.description}>{service.descripcion}</Text></View>
        {service.ubicacion_publica && <View style={styles.card}>
          <Text style={styles.sectionTitle}>{service.modalidad === 'TALLER' ? 'Ubicación del taller' : 'Sector de atención'}</Text>
          <Text style={styles.description}>{service.ubicacion_publica}</Text>
          {service.modalidad === 'DOMICILIO' && <Text style={styles.hint}>Cobertura declarada: {service.radio_cobertura_km} km desde su punto de referencia.</Text>}
        </View>}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Trabajador</Text>
          <Text style={styles.worker}>{service.trabajador.nombre}</Text>
          <View style={styles.fact}><Ionicons name="location-outline" size={22} color="#087A57" /><Text style={styles.label}>{service.trabajador.comuna?.nombre ?? 'Comuna no informada'}</Text></View>
        </View>
        {service.categoria.requiere_certificacion && <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Requisito de la categoría</Text>
          <Text style={styles.noticeText}>{service.categoria.certificacion_requerida}</Text>
          <Text style={styles.noticeText}>Para publicar en esta categoría, el trabajador debe tener su certificación aprobada por un administrador.</Text>
        </View>}
        <Text style={styles.pending}>La contratación de servicios estará disponible próximamente.</Text>
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { padding: 16, paddingBottom: 42, width: '100%', maxWidth: 680, alignSelf: 'center' },
  flex: { flex: 1 },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  link: { color: '#256047', fontWeight: '700', fontSize: 14 },
  title: { color: '#14251F', fontSize: 27, fontWeight: '900', marginTop: 8 },
  category: { color: '#087A57', fontSize: 13, fontWeight: '700', marginTop: 16 },
  hint: { color: '#66756F', fontSize: 12, lineHeight: 18, marginTop: 4 },
  card: { padding: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE6E1', borderRadius: 18, marginTop: 16 },
  price: { color: '#14251F', fontSize: 30, fontWeight: '900', marginTop: 6 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  label: { color: '#14251F', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  sectionTitle: { color: '#14251F', fontSize: 17, fontWeight: '800' },
  description: { color: '#52615C', fontSize: 15, lineHeight: 23, marginTop: 12 },
  worker: { color: '#14251F', fontSize: 18, fontWeight: '700', marginTop: 12 },
  notice: { padding: 16, borderRadius: 14, backgroundColor: '#FFF6DF', marginTop: 16 },
  noticeTitle: { color: '#6F4709', fontSize: 14, fontWeight: '700' },
  noticeText: { color: '#6F4709', fontSize: 12, lineHeight: 18, marginTop: 6 },
  pending: { color: '#66756F', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 24 },
  state: { alignItems: 'center', gap: 10, padding: 24 },
  error: { color: '#A74444', fontSize: 14, lineHeight: 20 },
});
