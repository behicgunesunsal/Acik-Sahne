import { Platform, Alert } from 'react-native';

export async function download(name: string, text: string, mime = 'text/plain') {
  if (Platform.OS === 'web') {
    try {
      const blob = new Blob([text], { type: `${mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    } catch (e) {
      // fallthrough to alert
    }
  }
  // Native (or web fallback error)
  try {
    const FSmod = require('expo-file-system');
    const ShareMod = require('expo-sharing');
    const FileSystem: any = FSmod?.default ?? FSmod;
    const Sharing: any = ShareMod?.default ?? ShareMod;
    if (FileSystem && Sharing) {
      const path = FileSystem.cacheDirectory + name;
      await FileSystem.writeAsStringAsync(path, text, { encoding: FileSystem.EncodingType.UTF8 });
      const can = await Sharing.isAvailableAsync();
      if (can) {
        await Sharing.shareAsync(path, { mimeType: mime, dialogTitle: name });
      } else {
        Alert.alert('Dosya hazır', `Kaydedildi: ${path}`);
      }
      return;
    }
  } catch {
    // modules not installed
  }
  Alert.alert('İndirme desteklenmiyor', 'Bu platformda dosya indirme/paylaşma modülleri yüklü değil.');
}

