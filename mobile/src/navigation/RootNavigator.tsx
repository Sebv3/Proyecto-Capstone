import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { SessionLoadingScreen } from '../screens/SessionLoadingScreen';

export type RootStackParamList = { Login: undefined; Register: undefined; Profile: undefined };
const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { user, isRestoringSession } = useAuth();

  if (isRestoringSession) return <SessionLoadingScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? <Stack.Screen name="Profile" component={ProfileScreen} />
          : <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
            </>}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
