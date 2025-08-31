import React, { useEffect, useMemo, useState } from 'react';
import { Platform, SafeAreaView, View, Text, Image, TextInput, Pressable, FlatList, Modal, Alert } from 'react-native';

// Minimal JS-only version to avoid TS parsing issues and unblock "connecting..."

const now = () => Date.now();
const rand = (a, b) => Math.random() * (b - a) + a;
const hav = (a, b) => {
  const R = 6371000;
  const r = (d) => (d * Math.PI) / 180;
  const dLa = r(b.lat - a.lat);
  const dLn = r(b.lng - a.lng);
  const la1 = r(a.lat);
  const la2 = r(b.lat);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};
const fmt = (m) => `${Math.max(0, Math.floor(m))} dk`;

const BBOX = { minLat: 40.975, maxLat: 41.03, minLng: 29.0, maxLng: 29.085 };
const GENRES = [
  'Hepsi','Akustik','Türkçe Pop','Caz','Rock','Klasik','Enstrümantal','Folk','Elektronik','Rap','Latin'
];

const seedArtists = () => {
  const n = [
    { name: 'Mahmut', genre: 'Akustik', avatar: 'https://i.pravatar.cc/64?img=12' },
    { name: 'Ahmet', genre: 'Türkçe Pop', avatar: 'https://i.pravatar.cc/64?img=15' },
    { name: 'Derya', genre: 'Caz', avatar: 'https://i.pravatar.cc/64?img=30' },
    { name: 'Baran', genre: 'Rock', avatar: 'https://i.pravatar.cc/64?img=5' },
    { name: 'Melis', genre: 'Klasik', avatar: 'https://i.pravatar.cc/64?img=47' },
    { name: 'Emre', genre: 'Enstrümantal', avatar: 'https://i.pravatar.cc/64?img=49' },
    { name: 'Zeynep', genre: 'Folk', avatar: 'https://i.pravatar.cc/64?img=41' },
    { name: 'Efe', genre: 'Elektronik', avatar: 'https://i.pravatar.cc/64?img=22' },
    { name: 'Sena', genre: 'Rap', avatar: 'https://i.pravatar.cc/64?img=10' },
    { name: 'Kaan', genre: 'Latin', avatar: 'https://i.pravatar.cc/64?img=28' },
  ];
  return n.map((m, i) => ({
    id: i + 1,
    ...m,
    isLive: Math.random() > 0.2,
    verified: Math.random() > 0.5,
    followersCount: Math.floor(rand(50, 1200)),
    startedAt: now() - Math.floor(rand(5, 90)) * 60 * 1000,
    plannedMinutes: [45, 60, 75, 90][Math.floor(Math.random() * 4)],
    location: { lat: rand(BBOX.minLat, BBOX.maxLat), lng: rand(BBOX.minLng, BBOX.maxLng) },
  }));
};

export default function App() {
  const [artists] = useState(() => seedArtists());
  const [g, setG] = useState('Hepsi');
  const [geo, setGeo] = useState(220);
  const [pos, setPos] = useState({ lat: 41.0, lng: 29.05 });
  const [sel, setSel] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const filtered = useMemo(() => {
    const within = (a) => hav(pos, a.location) <= geo;
    const byGenre = (a) => g === 'Hepsi' || a.genre === g;
    return artists.filter(byGenre).filter(within);
  }, [artists, pos, geo, g]);

  const openDetail = (a) => { setSel(a); setDetailOpen(true); };
  const closeDetail = () => { setDetailOpen(false); setSel(null); };

  const cycleGenre = (dir) => {
    const i = GENRES.indexOf(g);
    const next = (i + dir + GENRES.length) % GENRES.length;
    setG(GENRES[next]);
  };

  const getLoc = () => {
    if (Platform.OS === 'web' && navigator?.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => alert('Konum alınamadı')
      );
      return;
    }
    Alert.alert('Bilgi', 'Konum alma sadece web için etkin.');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <View style={{ padding: 12, gap: 12, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700' }}>Açık Sahne</Text>
            <Text style={{ marginLeft: 8, color: '#64748b', fontSize: 12 }}>Basit</Text>
          </View>
        </View>

        <View style={{ backgroundColor: 'white', borderRadius: 12, padding: 12, borderColor: '#e5e7eb', borderWidth: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontWeight: '600', marginRight: 8 }}>Tür:</Text>
              <Pressable onPress={() => cycleGenre(-1)} style={{ paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginRight: 6 }}><Text>◀︎</Text></Pressable>
              <Text>{g}</Text>
              <Pressable onPress={() => cycleGenre(1)} style={{ paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginLeft: 6 }}><Text>▶︎</Text></Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontWeight: '600', marginRight: 6 }}>Yarıçap:</Text>
              <TextInput value={String(geo)} onChangeText={(t) => setGeo(Math.max(50, Number(t) || 0))} keyboardType="numeric" style={{ width: 80, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }} />
              <Text style={{ marginLeft: 6, color: '#64748b' }}>m</Text>
            </View>
          </View>
          <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={getLoc} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
              <Text>Konumumu Al</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ flex: 1 }}>
          {filtered.length === 0 ? (
            <Text style={{ color: '#475569' }}>Sonuç yok. Yarıçapı artırmayı deneyin.</Text>
          ) : (
            <FlatList
              data={filtered.slice(0, 50)}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => {
                const el = (now() - item.startedAt) / 60000;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, backgroundColor: 'white', borderRadius: 12, marginBottom: 8, borderColor: '#e5e7eb', borderWidth: 1 }}>
                    <Image source={{ uri: item.avatar }} style={{ width: 44, height: 44, borderRadius: 22, marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontWeight: '600', marginRight: 6 }}>{item.name}</Text>
                        {item.verified ? <Text style={{ color: '#059669', fontSize: 12 }}>✓</Text> : null}
                        {item.isLive ? <Text style={{ color: '#059669', fontSize: 12, marginLeft: 6 }}>• Aktif</Text> : null}
                      </View>
                      <Text style={{ color: '#475569', fontSize: 13 }}>{item.genre} · {fmt(el)} sahnede · Plan {fmt(item.plannedMinutes)}</Text>
                    </View>
                    <Pressable onPress={() => openDetail(item)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginLeft: 6 }}><Text>Aç</Text></Pressable>
                  </View>
                );
              }}
            />
          )}
          <Text style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>(Yürüdükçe {geo} m yakındaki canlılar için bildirim)</Text>
        </View>

        <Modal visible={detailOpen} animationType="slide" onRequestClose={closeDetail}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={{ padding: 12 }}>
              <Pressable onPress={closeDetail} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignSelf: 'flex-start' }}><Text>Kapat</Text></Pressable>
              {sel && (
                <View style={{ alignItems: 'center', marginTop: 12 }}>
                  <Image source={{ uri: sel.avatar }} style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8 }} />
                  <Text style={{ fontSize: 20, fontWeight: '700' }}>{sel.name}</Text>
                  <Text style={{ color: '#475569', marginTop: 4 }}>{sel.genre} {sel.verified ? '· ✓' : ''} {sel.isLive ? '· • Aktif' : ''}</Text>
                </View>
              )}
            </View>
          </SafeAreaView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

