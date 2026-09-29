import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { blurFocusedElementOnWeb } from '../navigation/webFocus';

const roleOptions = [
  { value: 'CLIENTE', label: 'Cliente', description: 'Quiero contratar servicios' },
  { value: 'TRABAJADOR', label: 'Trabajador', description: 'Quiero ofrecer mis servicios' },
] as const;

export function RegistrationRoleScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'RegistrationRole'>) {
  const openRegistration = (role: 'CLIENTE' | 'TRABAJADOR') => {
    blurFocusedElementOnWeb();
    navigation.navigate('Register', { role });
  };

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>ServiMatch</Text>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Selecciona tu perfil</Text>
          <Text style={styles.description}>Elige cómo quieres participar en ServiMatch.</Text>

          <View accessibilityRole="radiogroup" style={styles.roleList}>
            {roleOptions.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: false }}
                onPress={() => openRegistration(option.value)}
                style={({ pressed }) => [styles.roleOption, pressed && styles.pressed]}
              >
                <View style={styles.roleCopy}>
                  <Text style={styles.roleTitle}>{option.label}</Text>
                  <Text style={styles.roleDescription}>{option.description}</Text>
                </View>
                <Text aria-hidden style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>

          <Pressable accessibilityRole="button" style={styles.link} onPress={() => {
            blurFocusedElementOnWeb();
            navigation.goBack();
          }}>
            <Text style={styles.linkText}>Ya tengo cuenta. Iniciar sesión</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, width: '100%', maxWidth: 520, alignSelf: 'center' },
  brand: { fontSize: 24, color: '#32745C', fontWeight: '800', marginBottom: 24 },
  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#DCE6E1' },
  title: { fontSize: 26, fontWeight: '700', color: '#14251F' },
  description: { fontSize: 15, color: '#52615C', lineHeight: 23, marginTop: 12 },
  roleList: { gap: 12, marginTop: 24 },
  roleOption: { minHeight: 86, flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#F9FBFA', borderWidth: 1, borderColor: '#DCE6E1', borderRadius: 12 },
  pressed: { backgroundColor: '#E7F3EC', borderColor: '#256047' },
  roleCopy: { flex: 1 },
  roleTitle: { fontSize: 17, color: '#14251F', fontWeight: '700' },
  roleDescription: { fontSize: 14, color: '#52615C', marginTop: 5 },
  chevron: { color: '#256047', fontSize: 30, marginLeft: 12 },
  link: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  linkText: { color: '#256047', fontWeight: '600', textAlign: 'center' },
});
