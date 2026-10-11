import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { unreadNotificationCount } from '../api/notifications';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/RootNavigator';

export function NotificationBell() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { withAccessToken, user } = useAuth();
  const request = useRef(withAccessToken); request.current = withAccessToken;
  const [count, setCount] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true; let busy = false;
    const controller = new AbortController();
    setCount(0);
    async function refresh() {
      if (!active || busy || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      busy = true;
      try {
        const value = await request.current((token) => unreadNotificationCount(token, controller.signal));
        if (active) setCount(value);
      } catch { /* The notification screen displays failures and allows retrying. */ }
      finally { busy = false; }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => { active = false; controller.abort(); clearInterval(timer); listener.remove(); };
  }, [user?.id]));
  return <Pressable accessibilityRole="button" accessibilityLabel={count > 0 ? `Notificaciones, ${count} sin leer` : 'Notificaciones'}
    onPress={() => navigation.navigate('Notifications')} style={styles.bell}>
    <Ionicons name="notifications-outline" size={23} color="#14251F" />
    {count > 0 && <View style={styles.dot} />}
  </Pressable>;
}
const styles = StyleSheet.create({
  bell: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE6E1', alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: '#E33E3E' },
});
