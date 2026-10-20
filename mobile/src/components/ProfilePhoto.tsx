import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { avatarError, removeProfileAvatar, uploadProfileAvatar, validateAvatar } from '../api/profileAvatar';
import { useAuth } from '../auth/AuthContext';
import { bookingStyles as styles } from './bookingStyles';

export function ProfileAvatar({ url, name }: { url?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const shape = { width: 60, height: 60, borderRadius: 30 };
  return url && !failed
    ? <Image accessibilityLabel="Foto de perfil" source={{ uri: url }} onError={() => setFailed(true)} style={shape} />
    : <View style={[shape, { backgroundColor: '#256047', alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '700' }}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>;
}

export function EditableProfilePhoto() {
  const { user, withAccessToken, updateUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function choosePhoto() {
    if (lock.current) return;
    lock.current = true;
    setError('');
    try {
      // The system photo picker grants access to the selected image only.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: Platform.OS !== 'web', aspect: [1, 1], quality: 0.8,
      });
      if (!mounted.current || result.canceled || !result.assets[0]) return;
      validateAvatar(result.assets[0]);
      setMenuOpen(false);
      setPending(result.assets[0]);
    } catch (reason) { if (mounted.current) setError(avatarError(reason)); }
    finally { lock.current = false; }
  }

  async function save() {
    if (lock.current || (!pending && !removing)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = pending
        ? await withAccessToken((token) => uploadProfileAvatar(token, pending))
        : await withAccessToken(removeProfileAvatar);
      if (!mounted.current) return;
      updateUser(result);
      setMenuOpen(false); setPending(null); setRemoving(false);
    } catch (reason) { if (mounted.current) setError(avatarError(reason)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }

  function close() {
    if (!lock.current) { setMenuOpen(false); setPending(null); setRemoving(false); setError(''); }
  }
  return <View style={{ alignSelf: 'flex-start' }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Cambiar foto de perfil"
      accessibilityHint="Abre las opciones para cambiar o quitar tu foto" disabled={busy}
      onPress={() => { setMenuOpen(true); setError(''); }}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name="camera-outline" size={16} color="#087D56" />
      <Text style={styles.link}>Cambiar foto</Text>
    </Pressable>
    <Modal visible={menuOpen || !!pending || removing} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.page}>
        <View style={[styles.content, { gap: 20 }]}>
          <Text accessibilityRole="header" style={styles.section}>{menuOpen ? 'Foto de perfil' : removing ? 'Quitar foto de perfil' : 'Nueva foto de perfil'}</Text>
          {menuOpen && <>
            <Pressable accessibilityRole="button" onPress={() => void choosePhoto()} style={styles.button}><Text style={styles.buttonText}>Elegir nueva foto</Text></Pressable>
            {!!user?.avatar_url && <Pressable accessibilityRole="button" style={styles.action}
              onPress={() => { setMenuOpen(false); setRemoving(true); setError(''); }}><Text style={styles.link}>Quitar foto</Text></Pressable>}
          </>}
          {pending && <Image source={{ uri: pending.uri }} accessibilityLabel="Vista previa de la nueva foto"
            style={{ width: 200, height: 200, borderRadius: 100, alignSelf: 'center' }} />}
          {(pending || removing) && <Text style={styles.text}>{removing ? 'Se quitará tu foto y se mostrará la inicial de tu nombre.'
            : 'Esta foto será pública. No uses documentos de identidad ni imágenes con datos privados.'}</Text>}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {(pending || removing) && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.button, busy && styles.disabled]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{removing ? 'Confirmar eliminación' : 'Guardar foto'}</Text>}
          </Pressable>}
          <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={styles.action}><Text style={styles.link}>{menuOpen ? 'Cerrar' : 'Cancelar'}</Text></Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  </View>;
}
