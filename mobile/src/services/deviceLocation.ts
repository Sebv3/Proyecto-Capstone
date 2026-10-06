import * as Location from 'expo-location';
import { isValidCoordinates, type Coordinates } from './serviceDistance';

export async function readDeviceLocation(): Promise<Coordinates> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('No se autorizó la ubicación. Puedes elegir un punto en el mapa.');
  if (!await Location.hasServicesEnabledAsync()) throw new Error('Activa la ubicación del dispositivo o elige un punto en el mapa.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('No pudimos obtener tu ubicación. Elige un punto en el mapa.')), 15000); }),
    ]);
    const coords = { latitud: position.coords.latitude, longitud: position.coords.longitude };
    if (!isValidCoordinates(coords)) throw new Error('La ubicación recibida no es válida.');
    return coords;
  } finally { if (timer) clearTimeout(timer); }
}
