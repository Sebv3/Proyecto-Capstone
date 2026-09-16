import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { loginErrorMessage } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

const schema = z.object({
  email: z.string().trim().email('Ingresa un correo válido.'),
  password: z.string().min(1, 'Ingresa tu contraseña.'),
});
type LoginValues = z.infer<typeof schema>;

export function LoginScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  const { signIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const submitting = useRef(false);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(schema), defaultValues: { email: '', password: '' },
  });
  const submit = handleSubmit(async ({ email, password }) => {
    if (submitting.current) return;
    submitting.current = true;
    setMessage(null);
    try { await signIn(email, password); }
    catch (error) { setMessage(loginErrorMessage(error)); }
    finally { submitting.current = false; }
  });

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.eyebrow}>SERVICIOS PARA EL HOGAR</Text>
            <Text style={styles.logo}>ServiMatch</Text>
            <Text style={styles.description}>Encuentra ayuda de confianza, cerca de ti.</Text>
          </View>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>Bienvenido de nuevo</Text>
            <Text style={styles.subtitle}>Ingresa a tu cuenta para continuar.</Text>
            <Text style={styles.label}>Correo electrónico</Text>
            <Controller control={control} name="email" render={({ field: { value, onChange, onBlur, ref } }) => (
              <TextInput
                ref={ref} value={value} onChangeText={(text) => { setMessage(null); onChange(text); }}
                onBlur={onBlur} placeholder="tu@correo.cl" placeholderTextColor="#77847E"
                accessibilityLabel="Correo electrónico" autoCapitalize="none" autoCorrect={false}
                keyboardType="email-address" autoComplete="email" textContentType="emailAddress"
                returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!isSubmitting} style={[styles.input, errors.email && styles.invalid]}
              />
            )} />
            {errors.email && <Text accessibilityRole="alert" style={styles.error}>{errors.email.message}</Text>}
            <Text style={styles.label}>Contraseña</Text>
            <View style={[styles.passwordRow, errors.password && styles.invalid]}>
              <Controller control={control} name="password" render={({ field: { value, onChange, onBlur, ref } }) => (
                <TextInput
                  ref={(input) => { passwordRef.current = input; ref(input); }}
                  value={value} onChangeText={(text) => { setMessage(null); onChange(text); }} onBlur={onBlur}
                  placeholder="Tu contraseña" placeholderTextColor="#77847E"
                  accessibilityLabel="Contraseña" secureTextEntry={!showPassword}
                  autoCapitalize="none" autoCorrect={false} autoComplete="current-password"
                  textContentType="password" returnKeyType="go" onSubmitEditing={() => void submit()}
                  editable={!isSubmitting} style={styles.passwordInput}
                />
              )} />
              <Pressable onPress={() => setShowPassword(!showPassword)} accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={styles.toggle}>
                <Text style={styles.toggleText}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
              </Pressable>
            </View>
            {errors.password && <Text accessibilityRole="alert" style={styles.error}>{errors.password.message}</Text>}
            {message && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
            <Pressable onPress={() => void submit()} disabled={isSubmitting} accessibilityRole="button"
              accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
              style={({ pressed }) => [styles.button, (pressed || isSubmitting) && styles.buttonPressed]}>
              {isSubmitting && <ActivityIndicator color="#FFFFFF" />}
              <Text style={styles.buttonText}>{isSubmitting ? 'Ingresando…' : 'Iniciar sesión'}</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" disabled={isSubmitting}
            onPress={() => navigation.navigate('Register')} style={styles.toggle}>
            <Text style={[styles.footer, styles.toggleText]}>¿No tienes cuenta? Crear cuenta</Text>
          </Pressable>
          <Text style={styles.footer}>Personas que necesitan ayuda.{'\n'}Personas que saben ayudar.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, width: '100%', maxWidth: 520, alignSelf: 'center' },
  brand: { marginBottom: 32 },
  eyebrow: { color: '#32745C', fontSize: 12, fontWeight: '700', letterSpacing: 1.6, marginBottom: 10 },
  logo: { color: '#14251F', fontSize: 40, fontWeight: '800', letterSpacing: -1.5 },
  description: { color: '#52615C', fontSize: 16, lineHeight: 24, marginTop: 10 },
  card: { padding: 22, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE6E1' },
  title: { color: '#14251F', fontSize: 23, fontWeight: '700' },
  subtitle: { color: '#52615C', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 10 },
  label: { color: '#14251F', fontSize: 14, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: '#14251F' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 10 },
  passwordInput: { flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: 12, fontSize: 16, color: '#14251F' },
  toggle: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 },
  toggleText: { color: '#256047', fontWeight: '600', fontSize: 13 },
  invalid: { borderColor: '#B42318' }, error: { color: '#B42318', fontSize: 13, marginTop: 6 },
  notice: { color: '#8E261C', backgroundColor: '#FFF0EE', padding: 12, borderRadius: 8, lineHeight: 21, marginTop: 18 },
  button: { minHeight: 54, padding: 14, borderRadius: 10, backgroundColor: '#256047', marginTop: 26, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  buttonPressed: { opacity: 0.7 }, buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  footer: { textAlign: 'center', color: '#65736E', fontSize: 13, lineHeight: 21, marginTop: 28 },
});
