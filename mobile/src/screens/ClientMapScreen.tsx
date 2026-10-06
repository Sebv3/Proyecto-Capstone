import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMapServices, serviceMapErrorMessage, type LocatedService } from '../api/serviceMap';
import { CoverageMap } from '../components/CoverageMap';
import { LocationPicker } from '../components/LocationPicker';
import { readDeviceLocation } from '../services/deviceLocation';
import { coverageLabel, distanceKm, type Coordinates } from '../services/serviceDistance';
import { formatCatalogPrice } from '../services/catalogFilters';
import type { MapEvent } from '../services/coverageMap';

export function ClientMapScreen({ onService }: { onService: (id: string) => void }) {
  const [locations, setLocations] = useState<LocatedService[]>([]);
  const [clientLocation, setClientLocation] = useState<Coordinates | null>(null);
  const [locationPicker, setLocationPicker] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [modality, setModality] = useState<'TODOS' | 'DOMICILIO' | 'TALLER'>('TODOS');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [mapRetry, setMapRetry] = useState(0);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void getMapServices(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setLocations(result);
      setSelectedId((current) => result.some((local) => local.id === current) ? current : null);
      setMapStatus('loading');
    }).catch((reason) => { if (!controller.signal.aborted) setError(serviceMapErrorMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]));

  useEffect(() => {
    if (loading || error || !locations.some((service) => modality === 'TODOS' || service.modalidad === modality) || mapStatus !== 'loading') return;
    const timer = setTimeout(() => setMapStatus('error'), 20000);
    return () => clearTimeout(timer);
  }, [loading, error, locations, mapStatus, mapRetry, modality]);

  const visible = useMemo(() => {
    const items = locations.filter((service) => modality === 'TODOS' || service.modalidad === modality);
    return clientLocation ? items.sort((a, b) => distanceKm(a, clientLocation) - distanceKm(b, clientLocation)) : items;
  }, [locations, modality, clientLocation]);
  const points = useMemo(() => visible.map(({ id, nombre, latitud, longitud, modalidad, radio_cobertura_km }) =>
    ({ id, nombre, latitud, longitud, modalidad, radio_cobertura_km })), [visible]);
  const onEvent = useCallback((event: MapEvent) => {
    if (event.type === 'select') setSelectedId(event.id);
    else if (event.type === 'copyright') void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {});
    else if (event.type === 'ready' || event.type === 'error') setMapStatus(event.type === 'ready' ? 'ready' : 'error');
  }, []);
  const selected = visible.find((local) => local.id === selectedId);
  const samePoint = selected ? visible.filter((service) => service.latitud === selected.latitud && service.longitud === selected.longitud) : [];
  async function useGps() {
    if (gpsBusy) return;
    setGpsBusy(true); setGpsError('');
    try { setClientLocation(await readDeviceLocation()); }
    catch (reason) { setGpsError(reason instanceof Error ? reason.message : 'No pudimos obtener tu ubicación.'); }
    finally { setGpsBusy(false); }
  }

  return <SafeAreaView edges={['top']} style={styles.page}>
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={styles.title}>Mapa de cobertura</Text>
      <Text style={styles.hint}>Verde: a domicilio · Azul: taller. Los círculos indican la cobertura declarada.</Text>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" disabled={gpsBusy} onPress={() => void useGps()}><Text style={styles.link}>{gpsBusy ? 'Buscando…' : 'Usar mi ubicación'}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setLocationPicker(true)}><Text style={styles.link}>Elegir mi ubicación</Text></Pressable>
      </View>
      {clientLocation && <View style={styles.row}><Text style={styles.hint}>Ordenados por cercanía · Distancia en línea recta</Text><Pressable onPress={() => setClientLocation(null)}><Text style={styles.link}>Quitar</Text></Pressable></View>}
      {!!gpsError && <Text accessibilityRole="alert" style={styles.hint}>{gpsError}</Text>}
      <View style={styles.row}>{(['TODOS', 'DOMICILIO', 'TALLER'] as const).map((mode) => <Pressable key={mode} accessibilityRole="radio"
        accessibilityState={{ checked: modality === mode }} onPress={() => { if (modality !== mode) { setModality(mode); setMapStatus('loading'); } }}
        style={[styles.localChip, modality === mode && styles.selectedChip]}><Text style={styles.link}>{mode === 'TODOS' ? 'Todos' : mode === 'DOMICILIO' ? 'Domicilio' : 'Taller'}</Text></Pressable>)}</View>
    </View>
    {loading ? <View style={styles.center}><ActivityIndicator color="#00875A" /><Text style={styles.hint}>Cargando servicios…</Text></View>
      : error ? <View style={styles.center}><Text accessibilityRole="alert" style={styles.hint}>{error}</Text><Pressable style={styles.button} onPress={() => setRetry((v) => v + 1)}><Text style={styles.buttonText}>Reintentar</Text></Pressable></View>
      : !visible.length ? <View style={styles.center}><Text style={styles.localName}>No hay servicios con ubicación disponibles</Text><Text style={styles.hint}>Los servicios publicados con un punto en el mapa aparecerán aquí.</Text><Pressable style={styles.button} onPress={() => setRetry((v) => v + 1)}><Text style={styles.buttonText}>Actualizar</Text></Pressable></View>
      : <>
        <View style={styles.map}>
          <CoverageMap key={mapRetry} points={points} onEvent={onEvent} />
          {mapStatus === 'loading' && <View pointerEvents="none" style={styles.mapLoading}><ActivityIndicator color="#00875A" /><Text style={styles.hint}>Cargando mapa…</Text></View>}
        </View>
        {mapStatus === 'error' && <View style={styles.notice}>
          <Text style={styles.hint}>No pudimos cargar el mapa. Puedes elegir un servicio de la lista.</Text>
          <Pressable accessibilityRole="button" onPress={() => { setMapStatus('loading'); setMapRetry((v) => v + 1); }}><Text style={styles.link}>Reintentar mapa</Text></Pressable>
        </View>}
        {selected && <View style={styles.card}>
          <View style={styles.row}><Text style={styles.localName}>{selected.nombre}</Text><Pressable accessibilityLabel="Cerrar información del servicio" onPress={() => setSelectedId(null)}><Text style={styles.link}>Cerrar</Text></Pressable></View>
          {samePoint.length > 1 && <><Text style={styles.hint}>Servicios en este punto:</Text><ScrollView horizontal contentContainerStyle={{ gap: 12 }}>{samePoint.map((service) => <Pressable key={service.id} onPress={() => setSelectedId(service.id)} accessibilityRole="button"><Text style={styles.link}>{service.nombre}</Text></Pressable>)}</ScrollView></>}
          <Text style={styles.hint}>{selected.ubicacion_publica}</Text>
          <Text style={styles.hint}>{selected.categoria.nombre} · {selected.modalidad === 'DOMICILIO' ? `A domicilio · Cobertura ${selected.radio_cobertura_km} km` : 'En taller'} · {formatCatalogPrice(selected.precio_base)}</Text>
          {clientLocation && <Text style={styles.hint}>{coverageLabel(selected, clientLocation)}</Text>}
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => onService(selected.id)}><Text style={styles.buttonText}>Ver servicio</Text></Pressable>
        </View>}
        <View style={styles.list}>
          <Text style={styles.listTitle}>Servicios disponibles ({visible.length})</Text>
          <ScrollView horizontal contentContainerStyle={styles.listContent}>
            {visible.map((local) => <Pressable key={local.id} accessibilityRole="button" accessibilityState={{ selected: selectedId === local.id }}
              style={[styles.localChip, selectedId === local.id && styles.selectedChip]} onPress={() => setSelectedId(local.id)}><Text style={styles.link}>{local.nombre}</Text>
              <Text style={styles.chipHint}>{local.modalidad === 'DOMICILIO' ? 'A domicilio' : 'Taller'}{clientLocation ? ` · ${distanceKm(local, clientLocation).toFixed(1)} km` : ''}</Text></Pressable>)}
          </ScrollView>
        </View>
      </>}
    </ScrollView>
    {locationPicker && <LocationPicker title="Tu ubicación de referencia" hint="Elige dónde necesitas el servicio. Este punto se usará solo para calcular distancias en esta pantalla."
      initial={clientLocation ?? undefined} onClose={() => setLocationPicker(false)} onSelect={(coords) => { setClientLocation(coords); setGpsError(''); setLocationPicker(false); }} />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  heading: { padding: 16 }, title: { color: '#14251F', fontSize: 27, fontWeight: '900' },
  hint: { color: '#52615C', fontSize: 13, lineHeight: 19, marginTop: 5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  map: { height: 320, marginHorizontal: 12, overflow: 'hidden', borderRadius: 16 },
  mapLoading: { position: 'absolute', top: 12, alignSelf: 'center', padding: 10, borderRadius: 12, backgroundColor: '#FFFFFF' },
  card: { backgroundColor: '#FFFFFF', padding: 14, margin: 12, borderRadius: 16, borderWidth: 1, borderColor: '#DCE6E1' },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  localName: { flexShrink: 1, color: '#14251F', fontSize: 17, fontWeight: '800' },
  button: { backgroundColor: '#00875A', padding: 14, borderRadius: 12, marginTop: 12, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' }, link: { color: '#087A57', fontWeight: '700', paddingVertical: 8 },
  notice: { paddingHorizontal: 16 }, list: { paddingVertical: 10 },
  listTitle: { color: '#14251F', fontWeight: '700', marginHorizontal: 16, marginBottom: 6 },
  listContent: { paddingHorizontal: 12, gap: 8 },
  localChip: { paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#DCE6E1', backgroundColor: '#FFFFFF' },
  selectedChip: { backgroundColor: '#DFF3E9', borderColor: '#00875A' },
  chipHint: { color: '#52615C', fontSize: 11, paddingBottom: 8 },
});
