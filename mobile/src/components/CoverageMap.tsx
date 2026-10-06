import { useMemo } from 'react';
import { WebView } from 'react-native-webview';
import { buildMapHtml, parseMapEvent, type MapEvent, type MapPoint, type MapOptions } from '../services/coverageMap';

export type CoverageMapProps = { points: MapPoint[]; onEvent: (event: MapEvent) => void; options?: MapOptions };

export function CoverageMap({ points, onEvent, options }: CoverageMapProps) {
  const html = useMemo(() => buildMapHtml(points, options), [points, options]);
  // A real project origin supplies a meaningful Referer; no API credentials enter this document.
  const configuredOrigin = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const baseUrl = configuredOrigin?.startsWith('https://') ? `${configuredOrigin}/` : undefined;
  return <WebView style={{ flex: 1 }} source={{ html, baseUrl }}
    originWhitelist={['*']}
    onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || request.url === baseUrl}
    applicationNameForUserAgent="ServiMatch/1.0"
    javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={false}
    allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
    mixedContentMode="never" geolocationEnabled={false} domStorageEnabled={false}
    onError={() => onEvent({ type: 'error' })}
    onHttpError={() => onEvent({ type: 'error' })}
    onMessage={({ nativeEvent }) => {
      const event = parseMapEvent(nativeEvent.data, points, options?.allowPick);
      if (event) onEvent(event);
    }} />;
}
