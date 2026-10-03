import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  catalogErrorMessage,
  Category,
  CatalogService,
  getCategories,
  getFeaturedServices,
} from '../api/catalog';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Props = { onExplore: () => void };

const categoryStyles = [
  { background: '#DDF2E9', foreground: '#087A57' },
  { background: '#E3ECFC', foreground: '#2267D8' },
  { background: '#F3EAE1', foreground: '#C25D12' },
  { background: '#EEE8FA', foreground: '#7B3FE4' },
  { background: '#FCE8E8', foreground: '#C43C45' },
];

function categoryIcon(slug: string): IconName {
  if (slug.includes('electric')) return 'flash-outline';
  if (slug.includes('gasfiteria')) return 'water-outline';
  if (slug.includes('carpinteria')) return 'hammer-outline';
  if (slug.includes('jardineria')) return 'leaf-outline';
  if (slug.includes('mascota')) return 'paw-outline';
  if (slug.includes('bicicleta')) return 'bicycle-outline';
  if (slug.includes('seguridad')) return 'shield-checkmark-outline';
  if (slug.includes('climatizacion')) return 'snow-outline';
  if (slug.includes('aseo')) return 'sparkles-outline';
  if (slug.includes('pintura')) return 'color-palette-outline';
  if (slug.includes('cerrajeria')) return 'key-outline';
  return 'construct-outline';
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
  }).format(price);
}

export function HomeCatalogSections({ onExplore }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextCategories, nextServices] = await Promise.all([
        getCategories(), getFeaturedServices(),
      ]);
      setCategories(nextCategories);
      setServices(nextServices);
    } catch (requestError) {
      setError(catalogErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <View style={styles.stateCard}>
    <ActivityIndicator color="#087A57" />
    <Text style={styles.stateText}>Cargando catálogo…</Text>
  </View>;

  if (error) return <View style={styles.stateCard}>
    <Ionicons name="cloud-offline-outline" size={26} color="#A74444" />
    <Text style={styles.stateText}>{error}</Text>
    <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retryButton}>
      <Text style={styles.retryText}>Reintentar</Text>
    </Pressable>
  </View>;

  return <>
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>CATEGORÍAS</Text>
      <Pressable accessibilityRole="button" onPress={onExplore}>
        <Text style={styles.seeAll}>Ver todas</Text>
      </Pressable>
    </View>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categories}
    >
      {categories.map((category, index) => {
        const colors = categoryStyles[index % categoryStyles.length];
        return <Pressable
          accessibilityRole="button"
          key={category.id}
          onPress={onExplore}
          style={styles.category}
        >
          <View style={[styles.categoryIcon, { backgroundColor: colors.background }]}>
            <Ionicons name={categoryIcon(category.slug)} size={29} color={colors.foreground} />
          </View>
          <Text numberOfLines={2} style={styles.categoryName}>{category.nombre}</Text>
        </Pressable>;
      })}
    </ScrollView>

    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>SERVICIOS DESTACADOS</Text>
      <Pressable accessibilityRole="button" onPress={onExplore}>
        <Text style={styles.seeAll}>Ver todos</Text>
      </Pressable>
    </View>
    {services.length === 0
      ? <View style={styles.emptyCard}>
        <Ionicons name="briefcase-outline" size={30} color="#82918B" />
        <Text style={styles.emptyTitle}>Aún no hay servicios publicados</Text>
        <Text style={styles.emptyHint}>Los nuevos servicios aparecerán aquí.</Text>
      </View>
      : services.map((service, index) => {
        const colors = categoryStyles[index % categoryStyles.length];
        return <Pressable
          accessibilityRole="button"
          key={service.id}
          onPress={onExplore}
          style={styles.serviceCard}
        >
          <View style={[styles.serviceIcon, { backgroundColor: colors.background }]}>
            <Ionicons
              name={categoryIcon(service.categoria.slug)}
              size={28}
              color={colors.foreground}
            />
          </View>
          <View style={styles.serviceBody}>
            <Text numberOfLines={1} style={styles.serviceName}>{service.nombre}</Text>
            <Text numberOfLines={1} style={styles.serviceMeta}>
              {service.trabajador.nombre} · {service.trabajador.comuna?.nombre ?? 'Comuna pendiente'}
            </Text>
            <Text style={styles.serviceMode}>
              {service.modalidad === 'DOMICILIO' ? 'A domicilio' : 'En taller'}
            </Text>
            <Text style={styles.price}>{formatPrice(service.precio_base)}</Text>
            <Text style={styles.soonMeta}>Distancia y calificaciones · Próximamente</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#8A9993" />
        </Pressable>;
      })}
  </>;
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 12 },
  sectionLabel: { color: '#66756F', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  seeAll: { color: '#087A57', fontSize: 13, fontWeight: '800' },
  categories: { gap: 13, paddingRight: 8 },
  category: { width: 76, alignItems: 'center' },
  categoryIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  categoryName: { color: '#52615C', fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 7 },
  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE6E1', borderRadius: 18, padding: 12, marginBottom: 10 },
  serviceIcon: { width: 64, height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  serviceBody: { flex: 1 },
  serviceName: { color: '#14251F', fontSize: 15, fontWeight: '800' },
  serviceMeta: { color: '#66756F', fontSize: 12, marginTop: 3 },
  serviceMode: { color: '#32745C', fontSize: 11, fontWeight: '700', marginTop: 3 },
  price: { color: '#14251F', fontSize: 16, fontWeight: '800', marginTop: 4 },
  soonMeta: { color: '#8A9993', fontSize: 10, marginTop: 3 },
  emptyCard: { alignItems: 'center', padding: 24, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#DCE6E1' },
  emptyTitle: { color: '#14251F', fontSize: 15, fontWeight: '700', marginTop: 10 },
  emptyHint: { color: '#66756F', fontSize: 13, marginTop: 4 },
  stateCard: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 24, padding: 18, backgroundColor: '#FFFFFF', borderRadius: 18 },
  stateText: { color: '#52615C', fontSize: 13, textAlign: 'center' },
  retryButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#E7F3EC' },
  retryText: { color: '#256047', fontSize: 13, fontWeight: '800' },
});
