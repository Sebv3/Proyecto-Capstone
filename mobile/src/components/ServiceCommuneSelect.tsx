import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Commune } from '../api/auth';
import { bookingStyles as styles } from './bookingStyles';

export function ServiceCommuneSelect({ communes, value, onChange, disabled, label = 'Comuna de la dirección del servicio' }: {
  communes: Commune[]; value: string; onChange: (id: string) => void; disabled: boolean; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const selected = communes.find((commune) => commune.id === value);
  return <>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={'Seleccionar ' + label.toLowerCase()} disabled={disabled} style={styles.input}
      onPress={() => { setSearch(''); setOpen(true); }}><Text style={styles.text}>{selected?.nombre ?? 'Selecciona una comuna'}</Text></Pressable>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={styles.page}>
        <View style={[styles.content, { flex: 1 }]}>
          <Text accessibilityRole="header" style={styles.section}>{label}</Text>
          <TextInput autoFocus value={search} onChangeText={setSearch} accessibilityLabel="Buscar comuna" placeholder="Buscar comuna" style={styles.input} />
          <FlatList keyboardShouldPersistTaps="handled" data={communes.filter((item) => normalize(item.nombre).includes(normalize(search)))}
            keyExtractor={(item) => item.id} ListEmptyComponent={<Text style={styles.hint}>No encontramos esa comuna.</Text>}
            renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: value === item.id }}
              style={styles.action} onPress={() => { onChange(item.id); setOpen(false); }}><Text style={styles.text}>{item.nombre}</Text></Pressable>} />
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => setOpen(false)}><Text style={styles.buttonText}>Volver</Text></Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  </>;
}
