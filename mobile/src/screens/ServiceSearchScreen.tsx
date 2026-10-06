import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { catalogErrorMessage, getCategories, searchServices, type CatalogFilters, type CatalogService, type Category } from '../api/catalog';
import { blurFocusedElementOnWeb } from '../navigation/webFocus';
import { catalogFiltersSchema, formatCatalogPrice, type CatalogFilterForm } from '../services/catalogFilters';

const emptyForm: CatalogFilterForm = { q: '', categoria_id: '', modalidad: '', precio_min: '', precio_max: '' };
const PAGE_SIZE = 20;

export function ServiceSearchScreen({ initialCategoryId, onService }: {
  initialCategoryId?: string; onService: (id: string) => void;
}) {
  const [form, setForm] = useState<CatalogFilterForm>({ ...emptyForm, categoria_id: initialCategoryId ?? '' });
  const [filters, setFilters] = useState<CatalogFilters>(initialCategoryId ? { categoria_id: initialCategoryId } : {});
  const [showFilters, setShowFilters] = useState(!!initialCategoryId);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CatalogFilterForm, string>>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesError, setCategoriesError] = useState('');
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryRetry, setCategoryRetry] = useState(0);
  const [items, setItems] = useState<CatalogService[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setCategoriesLoading(true);
    setCategoriesError('');
    void getCategories().then((result) => { if (active) setCategories(result); })
      .catch((reason) => { if (active) setCategoriesError(catalogErrorMessage(reason)); })
      .finally(() => { if (active) setCategoriesLoading(false); });
    return () => { active = false; };
  }, [categoryRetry]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void searchServices(filters, PAGE_SIZE, offset, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setItems((current) => offset === 0 ? result.items : [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      if (offset === 0 || result.items.length) setTotal(result.total);
      setHasMore(result.items.length > 0 && offset + result.items.length < result.total);
    }).catch((reason) => {
      if (!controller.signal.aborted) setError(catalogErrorMessage(reason));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, offset, retryKey]);

  function change<K extends keyof CatalogFilterForm>(key: K, value: CatalogFilterForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function apply(next = form) {
    const parsed = catalogFiltersSchema.safeParse(next);
    if (!parsed.success) {
      const errors: Partial<Record<keyof CatalogFilterForm, string>> = {};
      for (const issue of parsed.error.issues) errors[issue.path[0] as keyof CatalogFilterForm] = issue.message;
      setFieldErrors(errors);
      setShowFilters(true);
      return;
    }
    Keyboard.dismiss();
    blurFocusedElementOnWeb();
    setFieldErrors({});
    setItems([]);
    setTotal(0);
    setOffset(0);
    setHasMore(false);
    setError('');
    setLoading(true);
    setFilters(parsed.data);
  }

  const header = <View>
    <Text accessibilityRole="header" style={styles.title}>Buscar servicios</Text>
    <Text style={styles.hint}>Encuentra un servicio para lo que necesitas.</Text>
    <View style={styles.searchRow}>
      <TextInput accessibilityLabel="Buscar por nombre o descripción" placeholder="Ej. grifería o reparación" placeholderTextColor="#82918B"
        value={form.q} onChangeText={(text) => change('q', text)} maxLength={100} returnKeyType="search"
        onSubmitEditing={() => apply()} style={[styles.input, styles.flex]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Buscar servicios" onPress={() => apply()} style={styles.searchButton}>
        <Ionicons name="search" size={24} color="#FFFFFF" />
      </Pressable>
    </View>
    {!!fieldErrors.q && <Text accessibilityRole="alert" style={styles.error}>{fieldErrors.q}</Text>}
    <View style={styles.filterHeader}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters(!showFilters)} style={styles.linkButton}>
        <Ionicons name="options-outline" size={20} color="#256047" /><Text style={styles.link}>{showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => { setForm({ ...emptyForm }); apply(emptyForm); }} style={styles.linkButton}>
        <Text style={styles.link}>Limpiar</Text>
      </Pressable>
    </View>
    {showFilters && <View style={styles.filterCard}>
      <Text style={styles.label}>Categoría</Text>
      {categoriesLoading && <ActivityIndicator color="#087A57" style={styles.spinner} />}
      {!!categoriesError && <View><Text accessibilityRole="alert" style={styles.error}>{categoriesError}</Text>
        <Pressable accessibilityRole="button" onPress={() => setCategoryRetry((key) => key + 1)} style={styles.linkButton}><Text style={styles.link}>Reintentar categorías</Text></Pressable></View>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {[{ id: '', nombre: 'Todas' }, ...categories].map((category) => <Pressable key={category.id} accessibilityRole="radio"
          accessibilityState={{ checked: form.categoria_id === category.id }} onPress={() => change('categoria_id', category.id)}
          style={[styles.chip, form.categoria_id === category.id && styles.selected]}><Text style={styles.chipText}>{category.nombre}</Text></Pressable>)}
      </ScrollView>
      {!!fieldErrors.categoria_id && <Text accessibilityRole="alert" style={styles.error}>{fieldErrors.categoria_id}</Text>}
      <Text style={styles.label}>Modalidad</Text>
      <View style={[styles.chips, styles.modes]}>
        {(['', 'DOMICILIO', 'TALLER'] as const).map((mode) => <Pressable key={mode} accessibilityRole="radio"
          accessibilityState={{ checked: form.modalidad === mode }} onPress={() => change('modalidad', mode)}
          style={[styles.chip, form.modalidad === mode && styles.selected]}>
          <Text style={styles.chipText}>{mode === '' ? 'Todas' : mode === 'DOMICILIO' ? 'A domicilio' : 'En taller'}</Text>
        </Pressable>)}
      </View>
      <View style={styles.prices}>
        {(['precio_min', 'precio_max'] as const).map((name) => <View key={name} style={styles.flex}>
          <Text style={styles.label}>{name === 'precio_min' ? 'Precio mínimo' : 'Precio máximo'}</Text>
          <TextInput accessibilityLabel={name === 'precio_min' ? 'Precio mínimo en CLP' : 'Precio máximo en CLP'}
            value={form[name]} onChangeText={(text) => change(name, text)} placeholder="CLP" placeholderTextColor="#82918B"
            keyboardType="number-pad" inputMode="numeric" maxLength={16} style={styles.input} />
          {!!fieldErrors[name] && <Text accessibilityRole="alert" style={styles.error}>{fieldErrors[name]}</Text>}
        </View>)}
      </View>
      <Pressable accessibilityRole="button" onPress={() => apply()} style={styles.applyButton}><Text style={styles.buttonText}>Aplicar filtros</Text></Pressable>
    </View>}
    <Text accessibilityLiveRegion="polite" style={styles.resultCount}>{loading && offset === 0 ? 'Buscando…' : `${total} ${total === 1 ? 'servicio encontrado' : 'servicios encontrados'}`}</Text>
  </View>;

  return <SafeAreaView style={styles.page}>
    <FlatList data={items} keyExtractor={(item) => item.id} contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled" ListHeaderComponent={header}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${item.nombre}`}
        onPress={() => { blurFocusedElementOnWeb(); onService(item.id); }} style={styles.serviceCard}>
        <View style={styles.serviceBody}>
          <Text style={styles.serviceName}>{item.nombre}</Text>
          <Text style={styles.hint}>{item.categoria.nombre}</Text>
          <Text style={styles.hint}>{item.trabajador.nombre} · {item.trabajador.comuna?.nombre ?? 'Comuna no informada'}</Text>
          <Text style={styles.mode}>{item.modalidad === 'DOMICILIO' ? 'A domicilio' : 'En taller'} · {item.duracion_estimada_minutos} min</Text>
          <Text style={styles.price}>{formatCatalogPrice(item.precio_base)} <Text style={styles.hint}>precio base</Text></Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#82918B" />
      </Pressable>}
      ListEmptyComponent={!loading && !error ? <View style={styles.state}>
        <Ionicons name="search-outline" size={32} color="#82918B" />
        <Text style={styles.serviceName}>No encontramos servicios</Text>
        <Text style={styles.hint}>Prueba con otras palabras o ajusta los filtros.</Text>
      </View> : null}
      ListFooterComponent={<View style={styles.footer}>
        {loading && <ActivityIndicator color="#087A57" />}
        {!!error && <View style={styles.state}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => setRetryKey((key) => key + 1)} style={styles.linkButton}><Text style={styles.link}>Reintentar</Text></Pressable></View>}
        {!loading && !error && hasMore && <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setOffset((current) => current + PAGE_SIZE); }} style={styles.applyButton}><Text style={styles.buttonText}>Cargar más</Text></Pressable>}
      </View>} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { padding: 16, paddingBottom: 42, width: '100%', maxWidth: 680, alignSelf: 'center' },
  flex: { flex: 1 },
  title: { color: '#14251F', fontSize: 26, fontWeight: '900' },
  hint: { color: '#66756F', fontSize: 12, lineHeight: 18, marginTop: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 12, minHeight: 50, padding: 12, color: '#14251F', fontSize: 14, marginTop: 5 },
  searchButton: { width: 52, height: 50, marginTop: 5, borderRadius: 12, backgroundColor: '#087A57', alignItems: 'center', justifyContent: 'center' },
  filterHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  linkButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  link: { color: '#256047', fontSize: 13, fontWeight: '700' },
  filterCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#DCE6E1' },
  label: { color: '#14251F', fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, paddingVertical: 10 },
  modes: { flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  chipText: { fontSize: 12, color: '#256047', fontWeight: '600' },
  selected: { backgroundColor: '#E7F3EC', borderColor: '#087A57' },
  prices: { flexDirection: 'row', gap: 12, marginTop: 5 },
  applyButton: { minHeight: 48, backgroundColor: '#256047', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  error: { color: '#A74444', fontSize: 12, lineHeight: 18, marginTop: 5 },
  spinner: { marginVertical: 8 },
  resultCount: { color: '#66756F', fontSize: 13, marginVertical: 18 },
  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#DCE6E1', marginBottom: 10 },
  serviceBody: { flex: 1 },
  serviceName: { color: '#14251F', fontSize: 16, fontWeight: '800' },
  mode: { color: '#32745C', fontSize: 12, marginTop: 6 },
  price: { color: '#14251F', fontSize: 18, fontWeight: '800', marginTop: 8 },
  state: { alignItems: 'center', gap: 8, padding: 22, backgroundColor: '#FFFFFF', borderRadius: 16 },
  footer: { paddingTop: 8 },
});
