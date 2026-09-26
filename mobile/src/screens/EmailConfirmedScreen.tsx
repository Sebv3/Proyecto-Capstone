import * as Linking from 'expo-linking';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type EmailConfirmedScreenProps = {
  onContinue: () => void;
};

function confirmationError(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    const error = parsed.searchParams.get('error_description')
      ?? fragment.get('error_description');
    return error ? decodeURIComponent(error.replace(/\+/g, ' ')) : null;
  } catch {
    return null;
  }
}

export function EmailConfirmedScreen({ onContinue }: EmailConfirmedScreenProps) {
  const url = Linking.useLinkingURL();
  const error = useMemo(() => confirmationError(url), [url]);

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.content}>
        <Text style={styles.brand}>ServiMatch</Text>
        <View style={styles.card}>
          <View style={[styles.icon, error && styles.errorIcon]}>
            <Text accessibilityElementsHidden style={styles.iconText}>{error ? '!' : '✓'}</Text>
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {error ? 'No pudimos confirmar tu correo' : 'Correo confirmado correctamente'}
          </Text>
          <Text style={styles.description}>
            {error
              ? 'El enlace puede haber vencido o ya fue utilizado. Intenta iniciar sesión para comprobar tu cuenta.'
              : 'Tu cuenta ya está activa. Puedes volver a ServiMatch e iniciar sesión.'}
          </Text>
          {error && <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>}
          <Pressable accessibilityRole="button" onPress={onContinue} style={styles.button}>
            <Text style={styles.buttonText}>Ir a iniciar sesión</Text>
          </Pressable>
          <Text style={styles.hint}>
            Si abriste este enlace desde tu teléfono, regresa a Expo Go después de confirmar.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { flex: 1, justifyContent: 'center', padding: 24, width: '100%', maxWidth: 560, alignSelf: 'center' },
  brand: { color: '#32745C', fontWeight: '800', fontSize: 24, marginBottom: 24, textAlign: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#DCE6E1', padding: 28, alignItems: 'center' },
  icon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#DDF3E7', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  errorIcon: { backgroundColor: '#FDE7E4' },
  iconText: { color: '#256047', fontSize: 38, fontWeight: '800' },
  title: { color: '#14251F', fontSize: 27, fontWeight: '800', textAlign: 'center' },
  description: { color: '#52615C', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 14 },
  errorText: { color: '#B42318', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 12 },
  button: { width: '100%', minHeight: 54, borderRadius: 10, backgroundColor: '#256047', alignItems: 'center', justifyContent: 'center', padding: 14, marginTop: 26 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  hint: { color: '#6A7772', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 16 },
});
