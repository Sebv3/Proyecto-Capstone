import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, Text, View } from 'react-native';
import { createMercadoPagoCheckout, getMercadoPagoCheckout, mercadoPagoError, safeCheckoutUrl,
  syncMercadoPagoCheckout, type MercadoPagoCheckout } from '../api/mercadopago';
import { useAuth } from '../auth/AuthContext';
import { bookingStyles as styles } from './bookingStyles';
import { CheckoutBrowserError, launchCheckout } from '../services/checkoutLaunch';

const messages: Record<MercadoPagoCheckout['estado'], string> = {
  CREANDO: 'El checkout se está preparando. Actualiza antes de reintentar.',
  LISTO: 'Todo listo. Completa el pago en Mercado Pago.',
  PENDIENTE: 'Pago pendiente de confirmación. Espera el resultado antes de volver a pagar.',
  RECHAZADO: 'El intento fue rechazado o cancelado. Puedes volver al checkout para reintentar.',
  APROBADO: 'Pago aprobado y confirmado.',
  REVISION: 'Este pago requiere revisión. No vuelvas a pagar; contacta al administrador.',
};
export function MercadoPagoCard({ bookingId, canPay, approved, onConfirmed }: {
  bookingId: string; canPay: boolean; approved: boolean; onConfirmed: () => void;
}) {
  const { withAccessToken } = useAuth();
  const request = useRef(withAccessToken); request.current = withAccessToken;
  const confirmed = useRef(onConfirmed); confirmed.current = onConfirmed;
  const [checkout, setCheckout] = useState<MercadoPagoCheckout | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  usePreventRemove(busy, () => {});
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    let checking = false;
    async function refresh(fromFocus = false) {
      if (checking || lock.current || controller.signal.aborted) return;
      // A focused screen must load even while Expo Go's initial AppState is null
      // or transitioning. Skipping it after setLoading(true) stranded the button.
      if (!fromFocus && (AppState.currentState === 'background' || AppState.currentState === 'inactive'
          || (typeof document !== 'undefined' && document.visibilityState === 'hidden'))) return;
      checking = true;
      try {
        const existing = await request.current((token) => getMercadoPagoCheckout(token, bookingId, controller.signal));
        if (controller.signal.aborted) return;
        setCheckout(existing); setChecked(true);
        const result = existing ? await request.current((token) => syncMercadoPagoCheckout(token, bookingId, controller.signal)) : null;
        if (controller.signal.aborted) return;
        setCheckout(result); setError('');
        if (result?.estado === 'APROBADO' && !approved) confirmed.current();
      } catch (value) { if (!controller.signal.aborted) setError(mercadoPagoError(value)); }
      finally { checking = false; if (!controller.signal.aborted) setLoading(false); }
    }
    setLoading(true); setChecked(false); void refresh(true);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    const visibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
    // No background loop: server webhooks reconcile independently. Foreground and explicit refresh recover missed events.
    return () => {
      controller.abort(); listener.remove();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility);
    };
  }, [bookingId, approved, retry]));
  async function pay() {
    if (lock.current || loading || !checked || !canPay || checkout?.estado === 'REVISION' || checkout?.estado === 'PENDIENTE') return;
    lock.current = true; setBusy(true); setError('');
    let refreshOnClose = false;
    try {
      const result = await request.current((token) => createMercadoPagoCheckout(token, bookingId));
      setCheckout(result);
      if (result.estado === 'APROBADO') { confirmed.current(); return; }
      if (result.estado === 'REVISION' || result.estado === 'PENDIENTE') return;
      if (!result.checkout_url) throw new Error('Checkout sin dirección.');
      const browser = await launchCheckout(safeCheckoutUrl(result.checkout_url), Platform.OS, {
        openLink: Linking.openURL, openBrowser: WebBrowser.openBrowserAsync,
      });
      refreshOnClose = browser.closed;
    } catch (value) { setError(value instanceof CheckoutBrowserError ? value.message : mercadoPagoError(value)); }
    finally {
      lock.current = false; setBusy(false);
      if (refreshOnClose) setRetry((value) => value + 1);
    }
  }
  if (approved && checkout?.estado !== 'REVISION') return error
    ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null;
  return <View style={styles.card}>
    <Text style={styles.section}>Mercado Pago</Text>
    <Text style={styles.hint}>Entorno de demostración: no se cobrará dinero real.</Text>
    {loading ? <View style={styles.row}><ActivityIndicator accessibilityLabel="Consultando estado del pago" color="#087D56" /><Text style={styles.hint}>Consultando estado del pago…</Text></View> : checkout && <Text accessibilityLiveRegion="polite" style={styles.text}>{messages[checkout.estado]}</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {canPay && !approved && !['PENDIENTE', 'REVISION', 'APROBADO'].includes(checkout?.estado ?? '') && <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || loading || !checked }} disabled={busy || loading || !checked} onPress={() => void pay()} style={[styles.button, (busy || loading || !checked) && styles.disabled]}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{checkout?.checkout_url ? 'Volver a Mercado Pago' : 'Pagar con Mercado Pago'}</Text>}
    </Pressable>}
    <Text style={styles.hint}>Al terminar, vuelve a Expo Go. El estado se verificará al regresar.</Text>
  </View>;
}
