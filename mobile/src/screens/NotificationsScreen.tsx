import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getNotifications, readNotifications, notificationError, type Notification } from '../api/notifications';
import { useAuth } from '../auth/AuthContext';
import { bookingStyles as styles } from '../components/bookingStyles';

export function NotificationsScreen({ onBack, onOpen }: { onBack: () => void; onOpen: (item: Notification) => void }) {
  const { withAccessToken, user } = useAuth();
  const request = useRef(withAccessToken); request.current = withAccessToken;
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const actionLock = useRef(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const offset = useRef(0);
  async function load(append = false) {
    const pending = controller.current;
    if (!pending || pending.signal.aborted || busy.current || actionLock.current) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const rows = await request.current((token) => getNotifications(token, append ? offset.current : 0, pending.signal));
      if (!pending.signal.aborted) {
        offset.current = (append ? offset.current : 0) + rows.length;
        setItems((old) => append ? [...old, ...rows.filter((row) => !old.some((existing) => existing.id === row.id))] : rows);
        setMore(rows.length === 20);
      }
    } catch (reason) { if (!pending.signal.aborted) setError(notificationError(reason)); }
    finally { if (!pending.signal.aborted) { busy.current = false; setLoading(false); } }
  }
  useFocusEffect(useCallback(() => {
    const pending = new AbortController(); controller.current = pending; busy.current = false;
    setActionBusy(false);
    void load();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void load();
    }, 30_000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void load(); });
    return () => { pending.abort(); clearInterval(timer); listener.remove(); };
  }, [user?.id]));

  async function mark(item?: Notification, open = false) {
    if (actionLock.current || busy.current) return;
    const pending = controller.current;
    actionLock.current = true; setActionBusy(true); setError('');
    try {
      if (!item?.leida_en) await request.current((token) => readNotifications(token, item?.id));
      if (pending?.signal.aborted) return;
      const readAt = new Date().toISOString();
      setItems((old) => old.map((row) => !item || row.id === item.id ? { ...row, leida_en: row.leida_en ?? readAt } : row));
      if (item && open) onOpen(item);
    } catch (reason) { if (!pending?.signal.aborted) setError(notificationError(reason)); }
    finally { actionLock.current = false; if (!pending?.signal.aborted) setActionBusy(false); }
  }
  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.action}><Text style={styles.link}>← Volver</Text></Pressable>
      <Text accessibilityRole="header" style={styles.headerTitle}>Notificaciones</Text>
      <Text style={styles.text}>Avisos de tus solicitudes, verificaciones y certificaciones.</Text>
      <View style={styles.between}>
        <Pressable accessibilityRole="button" disabled={loading || actionBusy} onPress={() => void load()} style={styles.action}><Text style={styles.link}>Actualizar</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={loading || actionBusy} onPress={() => void mark()} style={styles.action}><Text style={styles.link}>Marcar todas como leídas</Text></Pressable>
      </View>
      {loading && <ActivityIndicator color="#087D56" />}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!loading && !error && !items.length && <View style={styles.card}><Text style={styles.section}>No tienes notificaciones</Text><Text style={styles.hint}>Aquí aparecerán los nuevos avisos de tu cuenta.</Text></View>}
      {items.map((item) => <View key={item.id} style={[styles.card, !item.leida_en && { borderColor: '#087D56', borderWidth: 1 }]}>
        <Pressable accessibilityRole="button" disabled={loading || actionBusy} onPress={() => void mark(item, true)}>
          <Text style={styles.section}>{!item.leida_en ? '● ' : ''}{item.titulo}</Text>
          <Text style={styles.text}>{item.mensaje}</Text>
          <Text style={styles.hint}>{new Date(item.creado_en).toLocaleString('es-CL')}</Text>
          <Text style={styles.link}>Ver detalles</Text>
        </Pressable>
        {!item.leida_en && <Pressable accessibilityRole="button" disabled={loading || actionBusy} onPress={() => void mark(item)} style={styles.action}><Text style={styles.link}>Marcar como leída</Text></Pressable>}
      </View>)}
      {more && <Pressable accessibilityRole="button" disabled={loading || actionBusy} onPress={() => void load(true)} style={styles.button}><Text style={styles.buttonText}>Cargar más</Text></Pressable>}
    </ScrollView>
  </SafeAreaView>;
}
