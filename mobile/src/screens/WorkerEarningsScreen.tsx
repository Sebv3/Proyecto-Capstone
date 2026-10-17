import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { earningsError, getWorkerEarnings, type EarningsDay, type WorkerEarnings } from '../api/earnings';
import { useAuth } from '../auth/AuthContext';
import { bookingStyles as shared } from '../components/bookingStyles';
import { currentEarningsMonth, earningsMoney, earningsMonthLabel, shiftEarningsMonth } from '../services/earnings';

export function WorkerEarningsScreen() {
  const { withAccessToken } = useAuth();
  const request = useRef(withAccessToken); request.current = withAccessToken;
  const [month, setMonth] = useState(currentEarningsMonth);
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<WorkerEarnings | null>(null);
  const [selected, setSelected] = useState<EarningsDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    void request.current((token) => getWorkerEarnings(token, month, offset, controller.signal))
      .then((result) => { if (!controller.signal.aborted) { setData(result); setSelected(null); } })
      .catch((value) => { if (!controller.signal.aborted) setError(earningsError(value)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [month, offset, retry]));
  function changeMonth(delta: number) {
    setData(null); setSelected(null); setOffset(0); setMonth(shiftEarningsMonth(month, delta));
  }
  const max = Math.max(1, ...(data?.dias.map((day) => day.monto) ?? []));
  return <SafeAreaView style={shared.page}>
    <ScrollView contentContainerStyle={shared.content}>
      <View style={shared.between}>
        <View style={{ flex: 1 }}><Text style={shared.eyebrow}>Panel del trabajador</Text><Text accessibilityRole="header" style={styles.title}>Mis ganancias</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Actualizar ganancias" disabled={loading} onPress={() => setRetry((value) => value + 1)} style={shared.back}><Ionicons name="refresh" size={21} color="#087D56" /></Pressable>
      </View>
      <View style={shared.between}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" disabled={month === '2000-01'} onPress={() => changeMonth(-1)} style={shared.back}><Ionicons name="chevron-back" size={22} color="#087D56" /></Pressable>
        <Text style={styles.month}>{earningsMonthLabel(month)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" disabled={month === '2100-12'} onPress={() => changeMonth(1)} style={shared.back}><Ionicons name="chevron-forward" size={22} color="#087D56" /></Pressable>
      </View>
      <Text style={shared.hint}>Ganancias simuladas · No representan saldo disponible ni transferencias.</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Cargando ganancias" color="#087D56" /> : error ? <View style={shared.card}>
        <Text accessibilityRole="alert" style={shared.error}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)} style={shared.action}><Text style={shared.link}>Reintentar</Text></Pressable>
      </View> : data && <>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Servicios completados</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.amount}>{earningsMoney(data.total_completado)}</Text>
          <Text style={styles.heroLabel}>{data.cantidad_completada} {data.cantidad_completada === 1 ? 'servicio completado' : 'servicios completados'}</Text>
        </View>
        <View style={shared.card}>
          <Text style={shared.section}>Ingresos diarios</Text>
          <Text style={shared.hint}>Por fecha de finalización · Hora de Chile</Text>
          {data.cantidad_completada === 0 ? <Text style={shared.text}>Aún no tienes ingresos de servicios completados este mes.</Text> : <>
            <Text style={shared.value}>{selected ? `Día ${Number(selected.fecha.slice(-2))}: ${earningsMoney(selected.monto)}` : 'Toca una barra para ver el importe'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.chart}>
              {data.dias.map((day) => <Pressable key={day.fecha} accessibilityRole="button" accessibilityLabel={`Día ${Number(day.fecha.slice(-2))}: ${earningsMoney(day.monto)}`} accessibilityState={{ selected: selected?.fecha === day.fecha }} onPress={() => setSelected(day)} style={styles.column}>
                <View style={styles.track}><View style={{ width: 14, height: day.monto ? Math.max(3, day.monto / max * 104) : 2, borderRadius: 5, backgroundColor: selected?.fecha === day.fecha ? '#D49C26' : day.monto ? '#087D56' : '#E0E8E3' }} /></View>
                <Text style={shared.hint}>{Number(day.fecha.slice(-2))}</Text>
              </Pressable>)}
            </ScrollView>
          </>}
          <Text style={shared.hint}>Tu ganancia corresponde a la tarifa base. El 15 % de plataforma se suma al pago del cliente.</Text>
        </View>
        <View style={shared.card}>
          <Text style={shared.section}>Servicios pagados en curso</Text>
          <Text style={styles.pending}>{earningsMoney(data.total_en_curso)}</Text>
          <Text style={shared.text}>{data.cantidad_en_curso} {data.cantidad_en_curso === 1 ? 'servicio agendado' : 'servicios agendados'} este mes, pendiente de finalizar.</Text>
          <Text style={shared.hint}>No se incluye en las ganancias hasta completar el servicio.</Text>
        </View>
        <View style={shared.card}>
          <Text style={shared.section}>Detalle del mes</Text>
          {!data.items.length && <Text style={shared.text}>No hay movimientos para este período.</Text>}
          {data.items.map((item) => <View key={item.solicitud_id} style={styles.item}>
            <Text style={shared.value}>{item.servicio_nombre}</Text>
            <Text style={shared.hint}>{item.completada ? 'Finalizado' : 'Agendado'} · {new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(item.fecha))}</Text>
            <View style={shared.between}><Text style={[shared.label, item.completada && shared.green]}>{item.completada ? 'Completado' : 'En curso · No sumado'}</Text><Text style={shared.value}>{earningsMoney(item.monto)}</Text></View>
          </View>)}
          {(offset > 0 || data.has_more) && <View style={shared.between}>
            <Pressable accessibilityRole="button" disabled={offset === 0} onPress={() => setOffset(Math.max(0, offset - 20))} style={[shared.action, offset === 0 && shared.disabled]}><Text style={shared.link}>Anterior</Text></Pressable>
            <Text style={shared.hint}>Página {offset / 20 + 1}</Text>
            <Pressable accessibilityRole="button" disabled={!data.has_more} onPress={() => setOffset(offset + 20)} style={[shared.action, !data.has_more && shared.disabled]}><Text style={shared.link}>Siguiente</Text></Pressable>
          </View>}
        </View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  title: { color: '#162B22', fontSize: 27, fontWeight: '800', marginTop: 4 },
  month: { color: '#162B22', fontSize: 17, fontWeight: '700', textTransform: 'capitalize', flex: 1, textAlign: 'center' },
  hero: { backgroundColor: '#087D56', padding: 22, borderRadius: 22, gap: 8 },
  heroLabel: { color: '#E5F5ED', fontSize: 14 }, amount: { color: '#FFFFFF', fontSize: 36, fontWeight: '800' },
  pending: { color: '#162B22', fontSize: 26, fontWeight: '800' },
  chart: { paddingVertical: 8, gap: 2 }, column: { width: 28, alignItems: 'center', minHeight: 140 },
  track: { height: 108, justifyContent: 'flex-end', marginBottom: 6 },
  item: { borderTopWidth: 1, borderTopColor: '#E0E8E3', paddingVertical: 12, gap: 6 },
});
