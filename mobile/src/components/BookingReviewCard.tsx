import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { createReview, getBookingReview, reviewError, type Review } from '../api/reviews';
import type { BookingRole } from '../services/bookingTracking';
import { bookingStyles as styles } from './bookingStyles';

export function BookingReviewCard({ bookingId, role }: { bookingId: string; role: BookingRole }) {
  const { withAccessToken } = useAuth();
  const request = useRef(withAccessToken); request.current = withAccessToken;
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  usePreventRemove(busy, () => {});
  useFocusEffect(useCallback(() => {
    const active = new AbortController();
    setLoading(true); setLoadError(''); setError('');
    void request.current((token) => getBookingReview(token, bookingId, active.signal))
      .then((result) => { if (!active.signal.aborted) setReview(result); })
      .catch((value) => { if (!active.signal.aborted) setLoadError(reviewError(value)); })
      .finally(() => { if (!active.signal.aborted) setLoading(false); });
    return () => active.abort();
  }, [bookingId, retry]));
  async function submit() {
    if (lock.current || loading || loadError || review || role !== 'CLIENTE') return;
    if (!rating) { setError('Selecciona una puntuación de 1 a 5 estrellas.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      setReview(await request.current((token) => createReview(token, bookingId, rating, comment)));
      setComment('');
    } catch (value) { setError(reviewError(value)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <View style={styles.card}>
    <Text style={styles.section}>{review ? 'Calificación del servicio' : role === 'CLIENTE' ? '¿Cómo fue tu experiencia?' : 'Calificación del cliente'}</Text>
    {loading ? <ActivityIndicator color="#087D56" /> : loadError ? <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text> : review ? <>
      <View style={styles.row} accessibilityLabel={`${review.puntuacion} de 5 estrellas`}>
        {[1, 2, 3, 4, 5].map((value) => <Ionicons key={value} name={value <= review.puntuacion ? 'star' : 'star-outline'} size={24} color="#D49C26" />)}
      </View>
      {!!review.comentario && <Text selectable style={styles.text}>{review.comentario}</Text>}
      <Text style={styles.hint}>Calificación enviada · {new Date(review.creado_en).toLocaleDateString('es-CL')}</Text>
    </> : role === 'CLIENTE' ? <>
      <Text style={styles.text}>Tu opinión ayuda a otros clientes a elegir. Puedes calificar este servicio una sola vez.</Text>
      <View style={[styles.row, { justifyContent: 'space-between', gap: 4 }]}>
        {[1, 2, 3, 4, 5].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${value} ${value === 1 ? 'estrella' : 'estrellas'}`} accessibilityState={{ selected: rating === value }} disabled={busy} onPress={() => setRating(value)} style={{ minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={value <= rating ? 'star' : 'star-outline'} size={30} color="#D49C26" /></Pressable>)}
      </View>
      <Text style={styles.label}>Comentario público (opcional)</Text>
      <TextInput accessibilityLabel="Comentario público" editable={!busy} value={comment} onChangeText={setComment} multiline maxLength={1000} placeholder="Cuéntanos cómo fue el servicio…" style={[styles.input, { minHeight: 96, textAlignVertical: 'top' }]} />
      <Text style={styles.hint}>{comment.length}/1000 · La puntuación y el comentario serán públicos.</Text>
      <Pressable accessibilityRole="button" disabled={busy || !rating} onPress={() => void submit()} style={[styles.button, (busy || !rating) && styles.disabled]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Enviar calificación</Text>}</Pressable>
    </> : <Text style={styles.text}>El cliente todavía no ha calificado este servicio.</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {(!!error || !!loadError) && <Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => setRetry((value) => value + 1)} style={styles.action}><Text style={styles.link}>Actualizar calificación</Text></Pressable>}
  </View>;
}
