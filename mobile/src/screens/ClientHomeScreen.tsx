import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { HomeCatalogSections } from './HomeCatalogSections';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return '¡Buenos días!';
  if (hour < 20) return '¡Buenas tardes!';
  return '¡Buenas noches!';
}

export function ClientHomeScreen({ onSearch }: { onSearch: () => void }) {
  const { user } = useAuth();
  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting()}</Text>
          <Text accessibilityRole="header" style={styles.title}>{user?.nombre ?? 'Cliente'}</Text>
        </View>
        <View accessibilityLabel="Notificaciones próximamente" style={styles.notification}>
          <Ionicons name="notifications-outline" size={23} color="#14251F" />
          <View style={styles.notificationDot} />
        </View>
      </View>

      <Pressable accessibilityRole="button" onPress={onSearch} style={styles.searchRow}>
        <Text style={styles.searchPlaceholder}>Buscar servicio (ej. destape)</Text>
        <View style={styles.searchButton}>
          <Ionicons name="search" size={25} color="#FFFFFF" />
        </View>
      </Pressable>

      <HomeCatalogSections onExplore={onSearch} />
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { padding: 16, paddingBottom: 42, width: '100%', maxWidth: 680, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  greeting: { color: '#66756F', fontSize: 13, fontWeight: '600' },
  title: { color: '#14251F', fontSize: 22, fontWeight: '900', marginTop: 2 },
  notification: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE6E1', alignItems: 'center', justifyContent: 'center' },
  notificationDot: { position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: '#E33E3E' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchPlaceholder: { flex: 1, minHeight: 52, paddingHorizontal: 16, textAlignVertical: 'center', color: '#77847F', fontSize: 14, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#DCE6E1' },
  searchButton: { width: 58, height: 52, borderRadius: 14, backgroundColor: '#087A57', alignItems: 'center', justifyContent: 'center' },
});
