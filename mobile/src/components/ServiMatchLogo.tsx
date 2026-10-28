import { Image, StyleSheet } from 'react-native';

export function ServiMatchLogo() {
  return <Image source={require('../../assets/servimatch-logo.png')}
    accessibilityLabel="ServiMatch" accessible resizeMode="contain" style={styles.logo} />;
}

const styles = StyleSheet.create({
  logo: { width: '100%', maxWidth: 360, height: 144 },
});
