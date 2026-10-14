import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { getWorkerReviews, reviewError, type WorkerReviews, type PublicReview } from '../api/reviews';
import { bookingStyles as styles } from './bookingStyles';

export function WorkerReviewsCard({ workerId }: { workerId: string }) {
  const [summary, setSummary] = useState<WorkerReviews | null>(null);
  const [items, setItems] = useState<PublicReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const active = useRef<AbortController | null>(null);
  const lock = useRef(false);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(''); setSummary(null); setItems([]);
    void getWorkerReviews(workerId, 0, controller.signal)
      .then((result) => { if (!controller.signal.aborted) { setSummary(result); setItems(result.items); } })
      .catch((value) => { if (!controller.signal.aborted) setError(reviewError(value)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workerId, retry]));
  async function more() {
    const controller = active.current;
    if (lock.current || loading || !summary?.has_more || !controller || controller.signal.aborted) return;
    lock.current = true; setLoading(true); setError('');
    try {
      const result = await getWorkerReviews(workerId, items.length, controller.signal);
      if (!controller.signal.aborted) { setSummary(result); setItems((previous) => [...previous, ...result.items.filter((item) => !previous.some((old) => old.id === item.id))]); }
    } catch (value) { if (!controller.signal.aborted) setError(reviewError(value)); }
    finally { lock.current = false; if (!controller.signal.aborted) setLoading(false); }
  }
  return <View style={styles.card}>
    <Text style={styles.section}>Calificaciones del trabajador</Text>
    {summary && <View style={styles.row}><Ionicons name="star" size={23} color="#D49C26" /><Text style={styles.value}>{summary.promedio == null ? 'Sin calificaciones' : `${summary.promedio.toLocaleString('es-CL', { maximumFractionDigits: 2 })} / 5`}</Text><Text style={styles.hint}>{summary.cantidad} {summary.cantidad === 1 ? 'opinión' : 'opiniones'}</Text></View>}
    {items.map((item) => <View key={item.id} style={{ gap: 5 }}>
      <View style={styles.separator} /><Text style={[styles.label, styles.green]}>{item.puntuacion} / 5 · {item.servicio_nombre}</Text>
      {!!item.comentario && <Text selectable style={styles.text}>{item.comentario}</Text>}
      <Text style={styles.hint}>{new Date(item.creado_en).toLocaleDateString('es-CL')}</Text>
    </View>)}
    {loading && <ActivityIndicator color="#087D56" />}
    {!!error && <><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)} style={styles.action}><Text style={styles.link}>Reintentar</Text></Pressable></>}
    {summary?.has_more && !loading && <Pressable accessibilityRole="button" onPress={() => void more()} style={styles.action}><Text style={styles.link}>Ver más opiniones</Text></Pressable>}
  </View>;
}
