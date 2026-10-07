import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { localBookingFields, parseBookingTime } from '../services/bookingForm';

export function BookingCalendar({ value, onChange, disabled = false, isDayEnabled }: {
  value: string; onChange: (value: string) => void; disabled?: boolean; isDayEnabled?: (date: string) => boolean;
}) {
  const [month, setMonth] = useState(() => {
    const day = parseBookingTime(value, '12:00') ?? new Date();
    return new Date(day.getFullYear(), day.getMonth(), 1);
  });
  useEffect(() => {
    const selected = parseBookingTime(value, '12:00');
    if (selected) setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [value]);
  const offset = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((offset + count) / 7) * 7;
  const today = localBookingFields(new Date()).date;
  return <View style={styles.calendar}>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.month}>{month.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}</Text>
      <View style={styles.arrows}>{[-1, 1].map((direction) => <Pressable key={direction} disabled={disabled} accessibilityRole="button"
        accessibilityLabel={direction < 0 ? 'Mes anterior' : 'Mes siguiente'} style={styles.arrow}
        onPress={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1))}>
        <Ionicons name={direction < 0 ? 'chevron-back' : 'chevron-forward'} size={17} color="#52685D" />
      </Pressable>)}</View>
    </View>
    <View style={styles.grid}>{['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'].map((day) => <View key={day} style={styles.cell}><Text style={styles.weekday}>{day}</Text></View>)}
      {Array.from({ length: cells }, (_, index) => {
        const day = index - offset + 1;
        if (day < 1 || day > count) return <View key={index} style={styles.cell} />;
        const date = localBookingFields(new Date(month.getFullYear(), month.getMonth(), day)).date;
        const unavailable = disabled || (isDayEnabled ? !isDayEnabled(date) : (parseBookingTime(date, '23:59')?.getTime() ?? 0) <= Date.now());
        const selected = date === value;
        return <Pressable key={index} accessibilityRole="button" accessibilityLabel={`Elegir ${date}`}
          accessibilityState={{ selected, disabled: unavailable }} disabled={unavailable} onPress={() => onChange(date)} style={styles.cell}>
          <View style={[styles.day, date === today && styles.today, selected && styles.selected]}>
            <Text style={[styles.dayText, unavailable && styles.unavailable, selected && styles.selectedText]}>{day}</Text>
          </View>
        </Pressable>;
      })}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  calendar: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E8E3', borderRadius: 20, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingLeft: 4, marginBottom: 8 },
  month: { color: '#162B22', fontSize: 16, fontWeight: '800', textTransform: 'capitalize', flexShrink: 1 },
  arrows: { flexDirection: 'row', gap: 4 }, arrow: { minWidth: 44, minHeight: 44, borderWidth: 1, borderColor: '#E0E8E3', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '14.285714%', minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  weekday: { color: '#81938B', fontSize: 12, fontWeight: '700' }, day: { minWidth: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  today: { borderWidth: 1, borderColor: '#98BBA9' }, selected: { backgroundColor: '#087D56', borderColor: '#087D56' },
  dayText: { fontSize: 13, color: '#273D32' }, unavailable: { color: '#CCD6D0' }, selectedText: { color: '#FFFFFF', fontWeight: '800' },
});
