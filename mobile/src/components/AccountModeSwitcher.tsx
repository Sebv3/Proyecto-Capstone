import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { accountModeError, getAccountModes, type AccountModes } from '../api/accountModes';
import { useAuth } from '../auth/AuthContext';
import { ProfileMenuItem } from './ProfileMenu';
import { bookingStyles as styles } from './bookingStyles';

export function AccountModeSwitcher({ onStatus }: { onStatus: (value: AccountModes | null) => void }) {
  const { user, withAccessToken, switchMode } = useAuth();
  const request = useRef(withAccessToken); request.current = withAccessToken;
  const notify = useRef(onStatus); notify.current = onStatus;
  const [status, setStatus] = useState<AccountModes | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!user || user.rol === 'ADMIN') return;
    const controller = new AbortController();
    setLoading(true); setError(''); setStatus(null); notify.current(null);
    void request.current((token) => getAccountModes(token, controller.signal)).then((value) => {
      if (!controller.signal.aborted) { setStatus(value); notify.current(value); }
    }).catch((reason) => { if (!controller.signal.aborted) setError(accountModeError(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user?.id, user?.rol, retry]));
  async function change() {
    if (lock.current || !status) return;
    lock.current = true; setBusy(true); setError('');
    try { await switchMode(user?.rol === 'TRABAJADOR' ? 'CLIENTE' : 'TRABAJADOR'); }
    catch (reason) { setError(accountModeError(reason)); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!user || user.rol === 'ADMIN') return null;
  return <View>
    {loading ? <View style={[styles.row, { paddingVertical: 16 }]}><ActivityIndicator color="#087D56" /><Text style={styles.hint}>Consultando modos de tu cuenta…</Text></View> : status && (
      user.rol === 'TRABAJADOR' || status.puede_ser_trabajador
    ) ? <ProfileMenuItem icon="swap-horizontal-outline" title={busy ? 'Cambiando modo…' : user.rol === 'TRABAJADOR' ? 'Cambiar a cliente' : 'Cambiar a trabajador'}
      subtitle={user.rol === 'TRABAJADOR' ? 'Busca y contrata servicios con tu misma cuenta' : 'Vuelve a ofrecer tus servicios, sin reenviar documentos'}
      disabled={busy} onPress={() => void change()} /> : status?.tiene_perfil_trabajador && <Text style={[styles.hint, { paddingVertical: 16 }]}>Tu perfil de trabajador necesita una verificación aprobada para volver a ese modo.</Text>}
    {!!error && <View style={{ paddingVertical: 12 }}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => setRetry((n) => n + 1)} style={styles.action}><Text style={styles.link}>Actualizar modos de cuenta</Text></Pressable></View>}
  </View>;
}
