import { Platform } from 'react-native';

export function blurFocusedElementOnWeb(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const focused = document.activeElement;
  if (focused instanceof HTMLElement) focused.blur();
}
