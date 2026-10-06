import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getLocation, locationErrorMessage, type PublicLocation } from '../api/locations';
import { formatCatalogPrice } from '../services/catalogFilters';

export function LocalServicesScreen({ locationId, onBack, onService }: {
  locationId: string; onBack: () => void; onService: (id: string) => void;
}) {
  const [local, setLocal] = useState<PublicLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setLocal(null);
    void getLocation(locationId, controller.signal).then((value) => { if (!controller.signal.aborted) setLocal(value); })
      .catch((reason) => { if (!controller.signal.aborted) setError(locationErrorMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [locationId, retry]));
  return <SafeAreaView edges={['top']} style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={onBack}><Text style={styles.link}>‹ Volver al mapa</Text></Pressable>
    <Text accessibilityRole="header" style={styles.title}>{local?.nombre ?? 'Servicios del local'}</Text>
    {loading && <ActivityIndicator color="#00875A" />}
    {error && <><Text accessibilityRole="alert" style={styles.hint}>{error}</Text><Pressable onPress={() => setRetry((v) => v + 1)}><Text style={styles.link}>Reintentar</Text></Pressable></>}
    {local && <>
      <Text style={styles.hint}>{local.direccion_publica}</Text>
      <Text style={styles.hint}>Atiende: {local.trabajador_nombre}</Text>
      {local.servicios.map((service) => <Pressable accessibilityRole="button" key={service.id} style={styles.card} onPress={() => onService(service.id)}>
        <Text style={styles.link}>{service.categoria_nombre}</Text><Text style={styles.name}>{service.nombre}</Text>
        <Text style={styles.price}>{formatCatalogPrice(service.precio_base)}</Text><Text style={styles.hint}>Atención en taller · Ver detalle ›</Text>
      </Pressable>)}
    </>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' }, content: { padding: 16, paddingBottom: 40, width: '100%', maxWidth: 680, alignSelf: 'center' },
  title: { color: '#14251F', fontSize: 27, fontWeight: '900', marginVertical: 12 },
  link: { color: '#087A57', fontWeight: '700', paddingVertical: 10 }, hint: { color: '#52615C', fontSize: 13, lineHeight: 20 },
  card: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#DCE6E1', marginTop: 14 },
  name: { color: '#14251F', fontSize: 18, fontWeight: '800' }, price: { color: '#14251F', fontSize: 22, fontWeight: '800', marginVertical: 10 },
});
