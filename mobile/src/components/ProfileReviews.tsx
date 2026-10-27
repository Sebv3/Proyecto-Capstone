import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BOOKING_PAGE_SIZE, getBookings } from '../api/bookings';
import { getBookingReview, getWorkerReviews, reviewError, type PublicReview } from '../api/reviews';
import { useAuth } from '../auth/AuthContext';
import { bookingStyles as styles } from './bookingStyles';

export function ProfileReviews() {
  const { user, withAccessToken } = useAuth();
  const request = useRef(withAccessToken); request.current = withAccessToken;
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<PublicReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void (async () => {
      try {
        let reviews: PublicReview[], hasMore: boolean;
        if (user?.rol === 'TRABAJADOR') {
          const page = await getWorkerReviews(user.id, offset, controller.signal);
          reviews = page.items; hasMore = page.has_more;
        } else {
          const bookings = await request.current((token) => getBookings(token, { estado: 'COMPLETADA', vista: 'historial', offset }, controller.signal));
          const results = await request.current((token) => Promise.all(bookings.map((booking) => getBookingReview(token, booking.id, controller.signal))));
          reviews = results.filter((item) => item !== null); hasMore = bookings.length === BOOKING_PAGE_SIZE;
        }
        if (!controller.signal.aborted) { setItems(reviews); setMore(hasMore); }
      } catch (reason) { if (!controller.signal.aborted) setError(reviewError(reason)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [user?.id, user?.rol, offset, retry]);
  return <View style={{ gap: 16 }}>
    <Text style={styles.section}>{user?.rol === 'TRABAJADOR' ? 'Reseñas recibidas' : 'Mis reseñas'}</Text>
    {loading ? <ActivityIndicator accessibilityLabel="Cargando reseñas" color="#087D56" /> : error ? <>
      <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={() => setRetry((n) => n + 1)} style={styles.action}><Text style={styles.link}>Reintentar</Text></Pressable>
    </> : <>
      {!items.length && <Text style={styles.hint}>No hay reseñas en esta página de servicios completados.</Text>}
      {items.map((item) => <View key={item.id} style={styles.card}>
        <Text style={styles.section}>{item.servicio_nombre}</Text>
        <Text accessibilityLabel={`${item.puntuacion} de 5 estrellas`} style={[styles.text, { color: '#895A08' }]}>{'★'.repeat(item.puntuacion)}{'☆'.repeat(5 - item.puntuacion)}</Text>
        {!!item.comentario && <Text style={styles.text}>{item.comentario}</Text>}
        <Text style={styles.hint}>{new Date(item.creado_en).toLocaleDateString('es-CL')}</Text>
      </View>)}
    </>}
    <View style={styles.between}>
      {offset > 0 && <Pressable accessibilityRole="button" disabled={loading} onPress={() => setOffset((n) => Math.max(0, n - BOOKING_PAGE_SIZE))} style={styles.action}><Text style={styles.link}>Anterior</Text></Pressable>}
      {more && !error && <Pressable accessibilityRole="button" disabled={loading} onPress={() => setOffset((n) => n + BOOKING_PAGE_SIZE)} style={styles.action}><Text style={styles.link}>Siguiente</Text></Pressable>}
    </View>
  </View>;
}
