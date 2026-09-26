import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getWorkerProfile, getWorkerVerification, missingWorkerResource, workerErrorMessage,
  type WorkerVerification,
} from '../api/workerVerification';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { SessionLoadingScreen } from '../screens/SessionLoadingScreen';
import { WorkerDocumentsScreen } from '../screens/WorkerDocumentsScreen';
import { WorkerHomeScreen } from '../screens/WorkerHomeScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Profile: undefined;
  WorkerDocuments: undefined;
  WorkerHome: undefined;
};
const Stack = createNativeStackNavigator<RootStackParamList>();

type WorkerFlow = {
  userId: string | null;
  state: 'loading' | 'legacy-profile' | 'documents' | 'ready' | 'error';
  verification: WorkerVerification | null;
  error: string | null;
};

export function RootNavigator() {
  const { user, isRestoringSession, withAccessToken, signOut } = useAuth();
  const [flow, setFlow] = useState<WorkerFlow>({
    userId: null, state: 'loading', verification: null, error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = () => setReloadKey((current) => current + 1);

  useEffect(() => {
    if (user?.rol !== 'TRABAJADOR') return;
    let active = true;
    const workerId = user.id;
    setFlow({ userId: workerId, state: 'loading', verification: null, error: null });
    void (async () => {
      try {
        try {
          const profile = await withAccessToken(getWorkerProfile);
          if (!profile.comuna) {
            if (active) setFlow({ userId: workerId, state: 'legacy-profile', verification: null, error: null });
            return;
          }
        }
        catch (reason) {
          if (!missingWorkerResource(reason)) throw reason;
          if (active) setFlow({ userId: workerId, state: 'legacy-profile', verification: null, error: null });
          return;
        }
        let verification: WorkerVerification | null = null;
        try { verification = await withAccessToken(getWorkerVerification); }
        catch (reason) { if (!missingWorkerResource(reason)) throw reason; }
        if (!active) return;
        setFlow({
          userId: workerId,
          state: !verification || verification.estado === 'RECHAZADA' ? 'documents' : 'ready',
          verification,
          error: null,
        });
      } catch (reason) {
        if (active) setFlow({
          userId: workerId, state: 'error', verification: null,
          error: workerErrorMessage(reason),
        });
      }
    })();
    return () => { active = false; };
  }, [user?.id, user?.rol, reloadKey]);

  useEffect(() => {
    if (user?.rol !== 'TRABAJADOR') return;
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => listener.remove();
  }, [user?.id, user?.rol]);

  if (isRestoringSession) return <SessionLoadingScreen />;
  if (user?.rol === 'TRABAJADOR') {
    if (flow.userId !== user.id || flow.state === 'loading') return <SessionLoadingScreen />;
    if (flow.state === 'error') return <SafeAreaView style={styles.page}>
      <View style={styles.errorContent}>
        <Text accessibilityRole="header" style={styles.title}>No pudimos cargar tu registro</Text>
        <Text accessibilityRole="alert" style={styles.hint}>{flow.error}</Text>
        <Pressable accessibilityRole="button" onPress={refresh} style={styles.button}>
          <Text style={styles.buttonText}>Reintentar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.linkButton}>
          <Text style={styles.link}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </SafeAreaView>;
  }

  return <NavigationContainer>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? <>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
      </> : user.rol === 'TRABAJADOR' && flow.state === 'legacy-profile' ?
        <Stack.Screen name="Profile">
          {() => <ProfileScreen onWorkerProfileCreated={refresh} />}
        </Stack.Screen>
      : user.rol === 'TRABAJADOR' && flow.state === 'documents' ?
        <Stack.Screen name="WorkerDocuments">
          {() => <WorkerDocumentsScreen verification={flow.verification} onSubmitted={refresh} />}
        </Stack.Screen>
      : user.rol === 'TRABAJADOR' && flow.verification ? <>
        <Stack.Screen name="WorkerHome">
          {({ navigation }) => <WorkerHomeScreen verification={flow.verification!}
            onProfile={() => navigation.navigate('Profile')} onRefresh={refresh} />}
        </Stack.Screen>
        <Stack.Screen name="Profile">
          {({ navigation }) => <ProfileScreen onBack={() => navigation.goBack()} />}
        </Stack.Screen>
      </> : <Stack.Screen name="Profile" component={ProfileScreen} />}
    </Stack.Navigator>
  </NavigationContainer>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7F6' },
  errorContent: { padding: 24, width: '100%', maxWidth: 600, alignSelf: 'center' },
  title: { color: '#14251F', fontSize: 26, fontWeight: '800' },
  hint: { color: '#52615C', fontSize: 15, marginTop: 12 },
  button: { minHeight: 52, backgroundColor: '#256047', borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  linkButton: { minHeight: 52, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { color: '#256047', fontWeight: '700' },
});
