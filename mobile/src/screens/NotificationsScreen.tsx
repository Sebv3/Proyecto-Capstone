import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearNotifications, getNotifications, readNotifications, notificationError, type Notification } from '../api/notifications';
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
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearError, setClearError] = useState('');
  const [notice, setNotice] = useState('');
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
    setConfirmClear(false); setClearError(''); setNotice('');
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
  async function clear() {
    const pending = controller.current;
    if (!pending || pending.signal.aborted || actionLock.current || busy.current) return;
    actionLock.current = true; setActionBusy(true); setClearError(''); setNotice('');
    let succeeded = false;
    try {
      const deleted = await request.current(clearNotifications);
      if (pending.signal.aborted) return;
      setConfirmClear(false);
      offset.current = 0; setMore(false);
      setNotice(deleted === 0 ? 'No hay avisos de solicitudes finalizadas o vencidas para limpiar.'
        : deleted === 1 ? '1 notificación eliminada.' : `${deleted} notificaciones eliminadas.`);
      succeeded = true;
    } catch (reason) { if (!pending.signal.aborted) setClearError(notificationError(reason)); }
    finally { actionLock.current = false; if (!pending.signal.aborted) setActionBusy(false); }
    if (succeeded && !pending.signal.aborted) await load();
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
      <Pressable accessibilityRole="button" accessibilityLabel="Limpiar notificaciones"
        accessibilityHint="Elimina solo avisos de solicitudes finalizadas o vencidas, con confirmación"
        accessibilityState={{ disabled: loading || actionBusy || !items.length }}
        disabled={loading || actionBusy || !items.length}
        style={({ pressed }) => [styles.row, {
          alignSelf: 'flex-end', minHeight: 44, paddingHorizontal: 16, paddingVertical: 10,
          borderRadius: 12, borderWidth: 1, borderColor: '#BCD7C8',
          backgroundColor: pressed ? '#D5EADF' : '#E4F3EB',
        }, (loading || actionBusy || !items.length) && styles.disabled]}
        onPress={() => { setClearError(''); setConfirmClear(true); }}>
        <Ionicons name="trash-outline" size={18} color="#087D56" />
        <Text style={styles.link}>Limpiar</Text>
      </Pressable>
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.hint}>{notice}</Text>}
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
    <Modal visible={confirmClear} transparent animationType="fade" onRequestClose={() => { if (!actionLock.current) setConfirmClear(false); }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 }}>
        <View style={[styles.card, { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16 }]}>
          <Text accessibilityRole="header" style={styles.section}>Limpiar notificaciones</Text>
          <Text style={styles.text}>Se eliminarán los avisos de solicitudes completadas, canceladas o rechazadas, y de citas cuya fecha pasó y siguen pendientes o aceptadas sin pago. Incluye avisos leídos y sin leer de todas las páginas.</Text>
          <Text style={styles.hint}>Se conservarán los avisos de servicios pagados, en curso o por retirar, y los de verificaciones. No se modificarán solicitudes ni servicios. Los avisos eliminados no se pueden recuperar.</Text>
          {!!clearError && <Text accessibilityRole="alert" style={styles.error}>{clearError}</Text>}
          <Pressable accessibilityRole="button" disabled={actionBusy || loading} onPress={() => void clear()} style={[styles.button, { backgroundColor: '#A74444' }, (actionBusy || loading) && styles.disabled]}>
            {actionBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Limpiar finalizadas y vencidas</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" disabled={actionBusy} onPress={() => setConfirmClear(false)} style={styles.action}><Text style={styles.link}>Cancelar</Text></Pressable>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}
