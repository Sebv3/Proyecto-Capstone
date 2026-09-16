import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { register, registerErrorMessage } from '../api/auth';
import { registerSchema, type RegisterValues } from '../auth/registerSchema';
import type { RootStackParamList } from '../navigation/RootNavigator';

const fields = [
  { name: 'nombre', label: 'Nombre', placeholder: 'Tu nombre' },
  { name: 'email', label: 'Correo electrónico', placeholder: 'tu@correo.cl' },
  { name: 'rut', label: 'RUT', placeholder: '12.345.678-5' },
  { name: 'password', label: 'Contraseña', placeholder: 'Al menos ocho caracteres' },
  { name: 'confirmPassword', label: 'Confirmar contraseña', placeholder: 'Repite tu contraseña' },
] as const;

export function RegisterScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Register'>) {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ email: string; confirmation: boolean } | null>(null);
  const submitting = useRef(false);
  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { nombre: '', email: '', rut: '', password: '', confirmPassword: '' },
  });
  const submit = handleSubmit(async (values) => {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    try {
      const result = await register(values);
      reset();
      setShowPassword(false);
      setSuccess({ email: values.email, confirmation: result.email_confirmation_required });
    } catch (err) { setError(registerErrorMessage(err)); }
    finally { submitting.current = false; }
  });

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>ServiMatch</Text>
          {success ? <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>{success.confirmation ? 'Revisa tu correo' : 'Cuenta creada'}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.description}>
              {success.confirmation
                ? `Revisa ${success.email} y abre el enlace de confirmación antes de iniciar sesión. Revisa también spam. Si ya tenías una cuenta, puedes intentar ingresar.`
                : 'Ya puedes iniciar sesión con tu correo y contraseña.'}
            </Text>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => navigation.popTo('Login')}>
              <Text style={styles.buttonText}>Ir a iniciar sesión</Text>
            </Pressable>
          </View> : <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>Crea tu cuenta</Text>
            <Text style={styles.description}>Elige cómo quieres participar en ServiMatch.</Text>
            <Text style={styles.label}>Quiero registrarme como</Text>
            <Controller control={control} name="rol" render={({ field: { value, onChange } }) => (
              <View accessibilityRole="radiogroup" style={styles.roles}>
                {(['CLIENTE', 'TRABAJADOR'] as const).map((role) => (
                  <Pressable key={role} accessibilityRole="radio" accessibilityState={{ checked: value === role, disabled: isSubmitting }}
                    disabled={isSubmitting} onPress={() => { setError(null); onChange(role); }}
                    style={[styles.role, value === role && styles.selected]}>
                    <Text style={styles.roleTitle}>{role === 'CLIENTE' ? 'Cliente' : 'Trabajador'}</Text>
                    <Text style={styles.roleDescription}>{role === 'CLIENTE' ? 'Busco un servicio' : 'Ofrezco mis servicios'}</Text>
                  </Pressable>
                ))}
              </View>
            )} />
            {errors.rol && <Text accessibilityRole="alert" style={styles.error}>{errors.rol.message}</Text>}
            {fields.map(({ name, label, placeholder }) => (
              <View key={name}>
                <Text style={styles.label}>{label}</Text>
                <Controller control={control} name={name} render={({ field: { value, onChange, onBlur, ref } }) => (
                  <TextInput ref={ref} value={value} onChangeText={(text) => { setError(null); onChange(text); }} onBlur={onBlur}
                    accessibilityLabel={label} placeholder={placeholder} placeholderTextColor="#77847E"
                    style={[styles.input, errors[name] && styles.invalid]} editable={!isSubmitting}
                    autoCapitalize={name === 'nombre' ? 'words' : 'none'} autoCorrect={false}
                    keyboardType={name === 'email' ? 'email-address' : 'default'}
                    secureTextEntry={(name === 'password' || name === 'confirmPassword') && !showPassword}
                    autoComplete={name === 'email' ? 'email' : name === 'nombre' ? 'name' : name === 'rut' ? 'off' : 'new-password'}
                    onSubmitEditing={name === 'confirmPassword' ? () => void submit() : undefined}
                    returnKeyType={name === 'confirmPassword' ? 'go' : 'default'} />
                )} />
                {errors[name] && <Text accessibilityRole="alert" style={styles.error}>{errors[name]?.message}</Text>}
              </View>
            ))}
            <Pressable accessibilityRole="button" style={styles.link} onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.linkText}>{showPassword ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}</Text>
            </Pressable>
            {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
            <Pressable accessibilityRole="button" disabled={isSubmitting} accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
              style={[styles.button, isSubmitting && styles.disabled]} onPress={() => void submit()}>
              {isSubmitting && <ActivityIndicator color="#FFFFFF" />}
              <Text style={styles.buttonText}>{isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={isSubmitting} style={styles.link} onPress={() => navigation.goBack()}>
              <Text style={styles.linkText}>Ya tengo cuenta. Iniciar sesión</Text>
            </Pressable>
          </View>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { flexGrow: 1, padding: 24, width: '100%', maxWidth: 520, alignSelf: 'center' },
  brand: { fontSize: 24, color: '#32745C', fontWeight: '800', marginBottom: 24 },
  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#DCE6E1' },
  title: { fontSize: 26, fontWeight: '700', color: '#14251F' },
  description: { fontSize: 15, color: '#52615C', lineHeight: 23, marginTop: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#14251F', marginTop: 20, marginBottom: 8 },
  roles: { gap: 10 }, role: { borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 10, padding: 14 },
  selected: { backgroundColor: '#E7F3EC', borderColor: '#256047', borderWidth: 2 },
  roleTitle: { fontSize: 16, color: '#14251F', fontWeight: '700' },
  roleDescription: { fontSize: 14, color: '#52615C', marginTop: 4 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: '#14251F' },
  invalid: { borderColor: '#B42318' }, error: { color: '#B42318', fontSize: 13, lineHeight: 20, marginTop: 8 },
  button: { backgroundColor: '#256047', borderRadius: 10, minHeight: 54, padding: 14, marginTop: 24, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' }, disabled: { opacity: 0.7 },
  link: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  linkText: { color: '#256047', fontWeight: '600', textAlign: 'center' },
});
