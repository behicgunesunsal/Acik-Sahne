import { Platform } from 'react-native';

export type Coords = { latitude: number; longitude: number };

export function getCurrentPosition(): Promise<Coords> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const nav = (globalThis as any).navigator;
      if (!nav?.geolocation) return reject(new Error('Geolocation not supported'));
      nav.geolocation.getCurrentPosition(
        (p: any) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        (e: any) => reject(e ?? new Error('Failed to get location'))
      );
    });
  }
  // Native: try expo-location if available
  return (async () => {
    try {
      const Mod = require('expo-location');
      const Location: any = Mod?.default ?? Mod;
      if (!Location) throw new Error('expo-location not installed');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Permission denied');
      const p = await Location.getCurrentPositionAsync({});
      return { latitude: p.coords.latitude, longitude: p.coords.longitude };
    } catch (e) {
      throw e instanceof Error ? e : new Error('Location unavailable');
    }
  })();
}

