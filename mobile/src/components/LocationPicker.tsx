import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoverageMap } from './CoverageMap';
import { readDeviceLocation } from '../services/deviceLocation';
import type { Coordinates } from '../services/serviceDistance';
import type { MapEvent } from '../services/coverageMap';

export function LocationPicker({ initial, onSelect, onClose, title = 'Elegir ubicación', hint = 'Toca el mapa para marcar un punto.' }: {
  initial?: Coordinates; onSelect: (value: Coordinates) => void; onClose: () => void; title?: string; hint?: string;
}) {
  const [seed, setSeed] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => { setMapReady(false); }, [seed, retry]);
  useEffect(() => {
    if (mapReady) return;
    const timer = setTimeout(() => setError('No pudimos cargar el mapa. Reintenta o usa la ubicación del dispositivo.'), 20000);
    return () => clearTimeout(timer);
  }, [mapReady, seed, retry]);
  const points = useMemo(() => seed ? [{ id: 'chosen', nombre: 'Ubicación elegida', ...seed }] : [], [seed]);
  const options = useMemo(() => ({ allowPick: true, center: seed }), [seed]);
  const onEvent = useCallback((event: MapEvent) => {
    if (event.type === 'ready') setMapReady(true);
    if (event.type === 'pick') { setDraft({ latitud: event.latitud, longitud: event.longitud }); setError(''); }
    if (event.type === 'error') setError('No pudimos cargar el mapa. Reintenta o usa la ubicación del dispositivo.');
    if (event.type === 'copyright') void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {});
  }, []);
  async function useGps() {
    if (gpsBusy) return;
    setGpsBusy(true); setError('');
    try { const coords = await readDeviceLocation(); setSeed(coords); setDraft(coords); setRetry((v) => v + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No pudimos obtener la ubicación.'); }
    finally { setGpsBusy(false); }
  }
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.page}>
      <View style={styles.header}><Pressable accessibilityRole="button" onPress={onClose}><Text style={styles.link}>Cancelar</Text></Pressable>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text><Text style={styles.hint}>{hint}</Text>
        <Pressable accessibilityRole="button" disabled={gpsBusy} onPress={() => void useGps()}><Text style={styles.link}>{gpsBusy ? 'Buscando ubicación…' : 'Usar ubicación del dispositivo'}</Text></Pressable>
      </View>
      <View style={styles.map}><CoverageMap key={retry} points={points} options={options} onEvent={onEvent} />
        {!mapReady && !error && <View pointerEvents="none" style={styles.loading}><ActivityIndicator color="#00875A" /><Text style={styles.hint}>Cargando mapa…</Text></View>}
      </View>
      <View style={styles.footer}>
        {!!error && <><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable onPress={() => { setError(''); setRetry((v) => v + 1); }}><Text style={styles.link}>Reintentar mapa</Text></Pressable></>}
        <Text style={styles.hint}>{draft ? 'Punto seleccionado. Confirma para usarlo.' : 'Selecciona un punto en el mapa.'}</Text>
        <Pressable accessibilityRole="button" disabled={!draft || gpsBusy} style={[styles.button, (!draft || gpsBusy) && styles.disabled]}
          onPress={() => { if (draft) onSelect(draft); }}>{gpsBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Confirmar ubicación</Text>}</Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' }, header: { padding: 16 }, title: { color: '#14251F', fontSize: 22, fontWeight: '800' },
  hint: { color: '#52615C', fontSize: 13, lineHeight: 19, marginTop: 6 }, link: { color: '#087A57', fontWeight: '700', paddingVertical: 12 },
  map: { flex: 1, minHeight: 150 }, footer: { padding: 16 }, error: { color: '#A74444', fontSize: 13 },
  button: { backgroundColor: '#00875A', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 12 }, buttonText: { color: '#FFFFFF', fontWeight: '700' }, disabled: { opacity: 0.5 },
  loading: { position: 'absolute', top: 12, alignSelf: 'center', padding: 10, backgroundColor: '#FFFFFF', borderRadius: 12 },
});
