import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { passwordRecoveryErrorMessage, requestPasswordRecovery, resetPassword } from '../api/auth';
import { passwordResetSchema, recoveryEmailSchema } from '../auth/passwordRecoverySchema';

export function PasswordRecoveryScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'PasswordRecovery'>) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [stage, setStage] = useState<'email' | 'reset' | 'success'>('email');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const submitting = useRef(false);
  const remaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  async function sendCode() {
    if (submitting.current || Date.now() < cooldownUntil) return;
    const parsed = recoveryEmailSchema.safeParse(email);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    submitting.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      await requestPasswordRecovery(parsed.data);
      setEmail(parsed.data); setStage('reset'); setCode('');
      setNotice('Si el correo está registrado, recibirás un código de recuperación. Revisa también la carpeta de spam.');
      setCooldownUntil(Date.now() + 60_000); setNow(Date.now());
    } catch (reason) { setError(passwordRecoveryErrorMessage(reason)); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function savePassword() {
    if (submitting.current) return;
    const parsed = passwordResetSchema.safeParse({ email, code, password, confirmPassword });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    submitting.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      await resetPassword(parsed.data.email, parsed.data.code, parsed.data.password);
      setCode(''); setPassword(''); setConfirmPassword(''); setStage('success');
    } catch (reason) { setError(passwordRecoveryErrorMessage(reason)); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <SafeAreaView style={styles.page}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => navigation.goBack()} style={styles.linkButton}>
          <Text style={styles.link}>← Volver a iniciar sesión</Text>
        </Pressable>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>{stage === 'success' ? 'Contraseña actualizada' : 'Recuperar contraseña'}</Text>
          {stage === 'success' ? <>
            <Text style={styles.subtitle}>Ya puedes ingresar a tu cuenta con la nueva contraseña.</Text>
            <Pressable accessibilityRole="button" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })} style={styles.button}>
              <Text style={styles.buttonText}>Iniciar sesión</Text>
            </Pressable>
          </> : <>
            <Text style={styles.subtitle}>{stage === 'email'
              ? 'Ingresa el correo de tu cuenta. Te enviaremos un código para cambiar tu contraseña.'
              : 'Ingresa el código de tu correo y elige una nueva contraseña.'}</Text>
            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput value={email} onChangeText={(value) => { setEmail(value); setError(null); }}
              editable={!busy && stage === 'email'} accessibilityLabel="Correo electrónico"
              placeholder="tu@correo.cl" placeholderTextColor="#77847E" autoCapitalize="none"
              autoCorrect={false} keyboardType="email-address" autoComplete="email"
              style={styles.input} />
            {stage === 'reset' && <>
              <Text style={styles.label}>Código de recuperación</Text>
              <TextInput value={code} onChangeText={(value) => { setCode(value); setError(null); }}
                editable={!busy} accessibilityLabel="Código de recuperación" keyboardType="number-pad"
                autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10}
                placeholder="Código del correo" placeholderTextColor="#77847E" style={styles.input} />
              <Text style={styles.label}>Nueva contraseña</Text>
              <TextInput value={password} onChangeText={(value) => { setPassword(value); setError(null); }}
                editable={!busy} accessibilityLabel="Nueva contraseña" secureTextEntry={!showPassword}
                autoCapitalize="none" autoCorrect={false} autoComplete="new-password" maxLength={128}
                placeholder="Al menos ocho caracteres" placeholderTextColor="#77847E" style={styles.input} />
              <Text style={styles.label}>Confirmar nueva contraseña</Text>
              <TextInput value={confirmPassword} onChangeText={(value) => { setConfirmPassword(value); setError(null); }}
                editable={!busy} accessibilityLabel="Confirmar nueva contraseña" secureTextEntry={!showPassword}
                autoCapitalize="none" autoCorrect={false} autoComplete="new-password" maxLength={128}
                placeholder="Repite tu nueva contraseña" placeholderTextColor="#77847E" style={styles.input} />
              <Pressable accessibilityRole="button" onPress={() => setShowPassword(!showPassword)} style={styles.linkButton}>
                <Text style={styles.link}>{showPassword ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}</Text>
              </Pressable>
            </>}
            {notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <Pressable accessibilityRole="button" disabled={busy || (stage === 'email' && remaining > 0)}
              accessibilityState={{ disabled: busy || (stage === 'email' && remaining > 0), busy }}
              onPress={() => void (stage === 'email' ? sendCode() : savePassword())}
              style={[styles.button, (busy || (stage === 'email' && remaining > 0)) && styles.disabled]}>
              {busy && <ActivityIndicator color="#FFFFFF" />}
              <Text style={styles.buttonText}>{busy ? 'Procesando…' : stage === 'email'
                ? remaining > 0 ? `Espera ${remaining} s` : 'Enviar código' : 'Guardar contraseña'}</Text>
            </Pressable>
            {stage === 'reset' && <>
              <Pressable accessibilityRole="button" disabled={busy || remaining > 0}
                onPress={() => void sendCode()} style={styles.linkButton}>
                <Text style={styles.link}>{remaining > 0 ? `Reenviar código en ${remaining} s` : 'Reenviar código'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy} style={styles.linkButton}
                onPress={() => { setStage('email'); setCode(''); setPassword(''); setConfirmPassword(''); setError(null); setNotice(null); }}>
                <Text style={styles.link}>Usar otro correo</Text>
              </Pressable>
            </>}
          </>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flex: 1, backgroundColor: '#F5F7F6' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, width: '100%', maxWidth: 520, alignSelf: 'center' },
  card: { padding: 22, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE6E1' },
  title: { color: '#14251F', fontSize: 23, fontWeight: '700' },
  subtitle: { color: '#52615C', fontSize: 15, lineHeight: 22, marginTop: 8 },
  label: { color: '#14251F', fontSize: 14, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#C9D6CF', borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: '#14251F' },
  button: { minHeight: 54, padding: 14, borderRadius: 10, backgroundColor: '#256047', marginTop: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, disabled: { opacity: 0.6 },
  linkButton: { minHeight: 48, justifyContent: 'center' }, link: { color: '#256047', fontWeight: '600', fontSize: 14 },
  notice: { color: '#256047', backgroundColor: '#E8F5ED', padding: 12, borderRadius: 8, lineHeight: 21, marginTop: 16 },
  error: { color: '#B42318', fontSize: 14, lineHeight: 21, marginTop: 16 },
});
