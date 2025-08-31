import React, { useEffect, useMemo, useState } from 'react';
import { Platform, SafeAreaView, View, Text, Image, TextInput, Pressable, FlatList, Modal, Alert, Linking, ScrollView } from 'react-native';

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

// Simple storage helpers (web: localStorage, native: AsyncStorage if available)
const __mem = new Map();
const storage = {
  getItem: async (k) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.getItem(k);
      const req = eval('require');
      const AS = req('@react-native-async-storage/async-storage');
      const AsyncStorage = AS?.default || AS;
      if (AsyncStorage?.getItem) return await AsyncStorage.getItem(k);
    } catch {}
    return __mem.has(k) ? __mem.get(k) : null;
  },
  setItem: async (k, v) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.setItem(k, v);
      const req = eval('require');
      const AS = req('@react-native-async-storage/async-storage');
      const AsyncStorage = AS?.default || AS;
      if (AsyncStorage?.setItem) return await AsyncStorage.setItem(k, v);
    } catch {}
    __mem.set(k, v);
  }
};

const usePersistedState = (key, initial) => {
  const [state, setState] = useState(initial);
  useEffect(() => { (async () => { try { const v = await storage.getItem(key); if (v != null) setState(JSON.parse(v)); } catch {} })(); }, [key]);
  useEffect(() => { (async () => { try { await storage.setItem(key, JSON.stringify(state)); } catch {} })(); }, [key, state]);
  return [state, setState];
};

const BBOX = { minLat: 40.975, maxLat: 41.03, minLng: 29.0, maxLng: 29.085 };
const GENRES = [
  'Hepsi','Akustik','Türkçe Pop','Caz','Rock','Klasik','Enstrümantal','Folk','Elektronik','Rap','Latin'
];
const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => new Date().toISOString().slice(0,10);

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
    active: true,
    followersCount: Math.floor(rand(50, 1200)),
    startedAt: now() - Math.floor(rand(5, 90)) * 60 * 1000,
    plannedMinutes: [45, 60, 75, 90][Math.floor(Math.random() * 4)],
    location: { lat: rand(BBOX.minLat, BBOX.maxLat), lng: rand(BBOX.minLng, BBOX.maxLng) },
  }));
};

export default function App() {
  const makeUser = (provider) => {
    const firsts = ['Ayşe','Mehmet','Deniz','Ece','Kerem','Selin','Can','Elif'];
    const name = firsts[Math.floor(Math.random()*firsts.length)] + ' ' + String.fromCharCode(65+Math.floor(Math.random()*26)) + '.';
    const avatar = `https://i.pravatar.cc/64?img=${Math.floor(rand(1,70))}`;
    return { id: Math.random().toString(36).slice(2,10), name, avatar, provider };
  };
  const [artists, setArtists] = usePersistedState('as.artists', seedArtists());
  const seedEvents = (as) => {
    const today = new Date().toISOString().slice(0, 10);
    return as.slice(0, 5).map((a, i) => ({
      id: i + 1,
      artistId: a.id,
      date: today,
      start: `${18 + (i % 3)}:00`,
      end: `${19 + (i % 3)}:00`,
      venue: 'Sahil Sahnesi',
      lat: a.location.lat + rand(-0.005, 0.005),
      lng: a.location.lng + rand(-0.005, 0.005),
    }));
  };
  
  const openDirections = (lat, lng, label = 'Hedef') => {
    const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    if (Platform.OS === 'ios') {
      const apple = `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`;
      Linking.openURL(apple).catch(() => Linking.openURL(gmaps));
    } else if (Platform.OS === 'android') {
      const googleNav = `google.navigation:q=${lat},${lng}`;
      const geo = `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`;
      Linking.openURL(googleNav).catch(() => Linking.openURL(geo)).catch(() => Linking.openURL(gmaps));
    } else {
      if (typeof window !== 'undefined') window.open(gmaps, '_blank');
      else Linking.openURL(gmaps).catch(() => {});
    }
  };
  const [g, setG] = usePersistedState('as.genre', 'Hepsi');
  const [geo, setGeo] = usePersistedState('as.radius', 220);
  const [pos, setPos] = usePersistedState('as.pos', { lat: 41.0, lng: 29.05 });
  const [events, setEvents] = usePersistedState('as.events', seedEvents(seedArtists()));
  const [sel, setSel] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [showLiveOnly, setShowLiveOnly] = useState(false);
  const [showArtists, setShowArtists] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const mapApi = React.useRef(null);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('user'); // 'user' | 'admin'
  const [follow, setFollow] = usePersistedState('as.follow', []);
  const [tips, setTips] = usePersistedState('as.tips', []);
  const [adminQ, setAdminQ] = useState('');
  const [adminForm, setAdminForm] = useState({ artistIdx: 0, date: todayISO(), start: '18:00', end: '19:00', venue: 'Açık Sahne', lat: 41.0, lng: 29.05 });
  const [dayOffset, setDayOffset] = useState(0);
  const filtered = useMemo(() => {
    const within = (a) => hav(pos, a.location) <= geo;
    const byGenre = (a) => g === 'Hepsi' || a.genre === g;
    const byLive = (a) => !showLiveOnly || a.isLive;
    const byActive = (a) => a.active !== false;
    return artists.filter(byActive).filter(byGenre).filter(byLive).filter(within);
  }, [artists, pos, geo, g, showLiveOnly]);

  const openDetail = (a) => { setSel(a); setDetailOpen(true); };
  const closeDetail = () => { setDetailOpen(false); setSel(null); };

  const cycleGenre = (dir) => {
    const i = GENRES.indexOf(g);
    const next = (i + dir + GENRES.length) % GENRES.length;
    setG(GENRES[next]);
  };

  const signInGoogle = async () => {
    try {
      const req = eval('require');
      const AuthSession = req('expo-auth-session');
      const auth = AuthSession.default || AuthSession;
      const redirectUri = auth.makeRedirectUri({ useProxy: true, scheme: 'aciksahne' });
      const clientId = process.env.GOOGLE_CLIENT_ID || '';
      if (!clientId) throw new Error('no-client-id');
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=profile%20email`;
      const result = await auth.startAsync({ authUrl });
      if (result?.type === 'success') {
        setUser({ id: 'g-' + Date.now(), name: 'Google Kullanıcısı', avatar: 'https://i.pravatar.cc/64?img=12', provider: 'google' });
      } else {
        setUser(makeUser('google'));
      }
    } catch (e) {
      setUser(makeUser('google'));
    }
  };

  const signInApple = async () => {
    try {
      const req = eval('require');
      const Apple = req('expo-apple-authentication');
      if (Apple && Apple.isAvailableAsync) {
        const available = await Apple.isAvailableAsync();
        if (available) {
          await Apple.signInAsync({ requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL] });
          setUser(makeUser('apple'));
          return;
        }
      }
      setUser(makeUser('apple'));
    } catch (e) {
      setUser(makeUser('apple'));
    }
  };

  // Export helpers (CSV / ICS)
  const downloadFile = async (name, text, mime = 'text/plain') => {
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([text], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        return;
      }
      const req = eval('require');
      const FS = req('expo-file-system');
      const Sharing = req('expo-sharing');
      const path = (FS.FileSystem || FS).cacheDirectory + name;
      await (FS.FileSystem || FS).writeAsStringAsync(path, text);
      if (Sharing && (Sharing.isAvailableAsync ? await Sharing.isAvailableAsync() : true)) await (Sharing.shareAsync || Sharing.default?.shareAsync || (()=>Promise.resolve()))(path, { mimeType: mime });
    } catch {}
  };
  const csvEsc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csvArtists = (as) => {
    const h = ['id','name','genre','verified','isLive','active','followersCount'].join(',');
    const r = as.map(a => [a.id,a.name,a.genre,a.verified?1:0,a.isLive?1:0,a.active?1:0,a.followersCount].map(csvEsc).join(','));
    return [h, ...r].join('\n');
  };
  const csvEvents = (evs, as) => {
    const h = ['id','artist','date','start','end','venue','lat','lng'].join(',');
    const r = evs.map(e => { const a = as.find(x=>x.id===e.artistId); return [e.id,a?.name??'?',e.date,e.start,e.end,e.venue,e.lat,e.lng].map(csvEsc).join(','); });
    return [h, ...r].join('\n');
  };
  const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
  const hms = (d) => `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const icsDT = (date, time) => { const [H,M] = time.split(':').map(Number); const x = new Date(`${date}T${pad(H)}:${pad(M)}:00`); return `${ymd(x)}T${hms(x)}`; };
  const toICS = (evs, as) => {
    const L = [
      'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AcikSahne//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH',
      'BEGIN:VTIMEZONE','TZID:Europe/Istanbul','X-LIC-LOCATION:Europe/Istanbul','BEGIN:STANDARD','TZOFFSETFROM:+0300','TZOFFSETTO:+0300','TZNAME:+03','DTSTART:19700101T000000','END:STANDARD','END:VTIMEZONE'
    ];
    const nowD = new Date(); const dtUTC = `${nowD.getUTCFullYear()}${pad(nowD.getUTCMonth()+1)}${pad(nowD.getUTCDate())}T${pad(nowD.getUTCHours())}${pad(nowD.getUTCMinutes())}${pad(nowD.getUTCSeconds())}Z`;
    for (const e of evs) {
      const a = as.find(x=>x.id===e.artistId);
      L.push('BEGIN:VEVENT',`UID:aciksahne-${e.id}@local`, `DTSTAMP:${dtUTC}`, `DTSTART;TZID=Europe/Istanbul:${icsDT(e.date,e.start)}`, `DTEND;TZID=Europe/Istanbul:${icsDT(e.date,e.end)}`, `SUMMARY:${(a?.name)||'Sanatçı'} · ${e.venue}`, `LOCATION:${Number(e.lat).toFixed(5)}, ${Number(e.lng).toFixed(5)}`, 'END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.join('\n');
  };

  const getLoc = async () => {
    if (Platform.OS === 'web' && navigator?.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => alert('Konum alınamadı')
      );
      return;
    }
    try {
      const req = eval('require');
      const Loc = req('expo-location');
      const Location = Loc.default || Loc;
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') throw new Error('no-perm');
      const p = await Location.getCurrentPositionAsync({});
      setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
    } catch (e) {
      Alert.alert('Konum alınamadı', 'Lütfen konum izinlerini kontrol edin.');
    }
  };

  const MobileMap = ({ artists, events, pos, onSelect, onSelectEvent, setMapApi }) => {
    try {
      const req = eval('require');
      const Maps = req('react-native-maps');
      const MapView = Maps.default || Maps;
      const Marker = Maps.Marker || (() => null);
      const Circle = Maps.Circle || null;
      const PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE || undefined;
      const region = {
        latitude: pos.lat || 41.0,
        longitude: pos.lng || 29.05,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      };
      const mapRef = React.useRef(null);
      const regionRef = React.useRef(region);
      React.useEffect(() => {
        if (setMapApi) {
          setMapApi({
            centerTo: (lat, lng) => {
              const r = regionRef.current;
              if (mapRef.current) mapRef.current.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: r.latitudeDelta, longitudeDelta: r.longitudeDelta }, 250);
            },
          });
        }
      }, [setMapApi]);
      return (
        <View style={{ height: 320, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={region}
            provider={PROVIDER_GOOGLE}
            onRegionChangeComplete={(r) => { regionRef.current = r; setPos({ lat: r.latitude, lng: r.longitude }); }}
          >
            {Circle ? (
              <Circle center={{ latitude: regionRef.current.latitude, longitude: regionRef.current.longitude }} radius={geo} strokeColor="#10b981" fillColor="rgba(16,185,129,0.08)" />
            ) : null}
            {artists.filter(a => (adminQ||'').trim()==='' || a.name.toLowerCase().includes(adminQ.toLowerCase()) || a.genre.toLowerCase().includes(adminQ.toLowerCase())).map((a) => (
              <Marker key={`a-${a.id}`} coordinate={{ latitude: a.location.lat, longitude: a.location.lng }} title={a.name} description={a.genre} onPress={() => onSelect(a)} />
            ))}
            {events.map((e) => (
              <Marker key={`e-${e.id}`} coordinate={{ latitude: e.lat, longitude: e.lng }} pinColor="#7c3aed" title={e.venue} description={`${e.date} ${e.start}–${e.end}`} onPress={() => onSelectEvent && onSelectEvent(e)} />
            ))}
            <Marker key="me" coordinate={{ latitude: regionRef.current.latitude, longitude: regionRef.current.longitude }} title="Ben" pinColor="#059669" />
          </MapView>
          <View style={{ position: 'absolute', right: 10, top: 10, gap: 8 }}>
            <Pressable onPress={() => getLoc()} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 }}>
              <Text>Konuma git</Text>
            </Pressable>
            <Pressable onPress={() => mapRef.current && mapRef.current.animateToRegion({ ...regionRef.current, latitudeDelta: regionRef.current.latitudeDelta/1.5, longitudeDelta: regionRef.current.longitudeDelta/1.5 }, 250)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}>
              <Text>＋</Text>
            </Pressable>
            <Pressable onPress={() => mapRef.current && mapRef.current.animateToRegion({ ...regionRef.current, latitudeDelta: regionRef.current.latitudeDelta*1.5, longitudeDelta: regionRef.current.longitudeDelta*1.5 }, 250)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}>
              <Text>－</Text>
            </Pressable>
          </View>
        </View>
      );
    } catch (e) {
      return (
        <View style={{ height: 220, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' }}>
          <Text style={{ color: '#475569', paddingHorizontal: 12, textAlign: 'center' }}>
            Harita için react-native-maps gerekli. "expo install react-native-maps" sonrası tekrar deneyin.
          </Text>
        </View>
      );
    }
  };

  const WebMap = ({ artists, events, pos, onSelect, onSelectEvent, setMapApi }) => {
    const width = 860; const height = 300;
    const toXY = (lat, lng) => ({
      x: ((lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * width,
      y: (1 - (lat - BBOX.minLat) / (BBOX.maxLat - BBOX.minLat)) * height,
    });
    // simple pan/zoom state
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [drag, setDrag] = useState({ on: false, sx: 0, sy: 0, px: 0, py: 0 });
    const svgRef = React.useRef(null);

    React.useEffect(() => {
      if (setMapApi) setMapApi({
        centerTo: (lat, lng) => {
          // simply move pos; markers are based on lat/lng to xy mapping
          setPos({ lat, lng });
        }
      });
    }, [setMapApi]);

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const zoomAt = (sx, sy, factor) => {
      const z = clamp(zoom * factor, 0.5, 5);
      const rect = svgRef.current?.getBoundingClientRect?.();
      if (!rect) { setZoom(z); return; }
      const cx = (sx - rect.left - pan.x) / zoom;
      const cy = (sy - rect.top - pan.y) / zoom;
      const nx = sx - rect.left - cx * z;
      const ny = sy - rect.top - cy * z;
      setZoom(z);
      setPan({ x: nx, y: ny });
    };

    const onWheel = (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1/1.15); };
    const onMouseDown = (e) => { setDrag({ on: true, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }); };
    const onMouseMove = (e) => { if (!drag.on) return; setPan({ x: drag.px + (e.clientX - drag.sx), y: drag.py + (e.clientY - drag.sy) }); };
    const endDrag = () => setDrag((d) => ({ ...d, on: false }));
    const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

    const u = toXY(pos.lat, pos.lng);
    return (
      <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb', position: 'relative' }}>
        <View style={{ backgroundColor: '#f8fafc' }}>
          <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 300 }}
               onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag}>
            <defs>
              <pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#cbd5e1" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width={width} height={height} fill="url(#g)" />
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              <circle cx={u.x} cy={u.y} r={8} fill="#2563eb" />
              <circle cx={u.x} cy={u.y} r={18} fill="#2563eb" opacity="0.15" />
              {artists.map((a) => {
                const p = toXY(a.location.lat, a.location.lng);
                return (
                  <g key={`a-${a.id}`} onClick={() => onSelect(a)} style={{ cursor: 'pointer' }}>
                    <circle cx={p.x} cy={p.y} r={10} fill="#111827" opacity="0.15" />
                    <circle cx={p.x} cy={p.y} r={8} fill="#111827" />
                  </g>
                );
              })}
              {events.map((e) => {
                const p = toXY(e.lat, e.lng);
                return (
                  <g key={`e-${e.id}`} onClick={() => onSelectEvent && onSelectEvent(e)} style={{ cursor: 'pointer' }}>
                    <rect x={p.x - 6} y={p.y - 6} width="12" height="12" fill="#7c3aed" transform={`rotate(45 ${p.x} ${p.y})`} />
                  </g>
                );
              })}
            </g>
          </svg>
        </View>
        <View style={{ position: 'absolute', right: 8, top: 8, gap: 6 }}>
          <Pressable onPress={() => zoomAt((svgRef.current?.getBoundingClientRect?.()?.left||0)+40, (svgRef.current?.getBoundingClientRect?.()?.top||0)+40, 1.2)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>＋</Text></Pressable>
          <Pressable onPress={() => zoomAt((svgRef.current?.getBoundingClientRect?.()?.left||0)+40, (svgRef.current?.getBoundingClientRect?.()?.top||0)+40, 1/1.2)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>－</Text></Pressable>
          <Pressable onPress={resetView} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>↺</Text></Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <View style={{ padding: 12, gap: 12, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700' }}>Açık Sahne</Text>
            <Text style={{ marginLeft: 8, color: '#64748b', fontSize: 12 }}>Mobil/Web</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {!user ? (
              <>
                <Pressable onPress={signInGoogle} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginRight: 6 }}><Text>Google ile Giriş</Text></Pressable>
                <Pressable onPress={signInApple} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>Apple ile Giriş</Text></Pressable>
              </>
            ) : (
              <>
                <Image source={{ uri: user.avatar }} style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }} />
                <Text style={{ marginRight: 8 }}>{user.name}</Text>
                <Pressable onPress={() => setUser(null)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>Çıkış</Text></Pressable>
              </>
            )}
            <View style={{ marginLeft: 10, flexDirection: 'row' }}>
              <Pressable onPress={() => setTab('user')} style={{ backgroundColor: tab==='user'? '#ecfdf5':'#fff', borderColor: tab==='user'? '#a7f3d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginRight: 6 }}><Text>Kullanıcı</Text></Pressable>
              <Pressable onPress={() => setTab('admin')} style={{ backgroundColor: tab==='admin'? '#fef3c7':'#fff', borderColor: tab==='admin'? '#fde68a':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>Admin</Text></Pressable>
            </View>
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
          <View style={{ marginTop: 8, flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pressable onPress={getLoc} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
              <Text>Konumumu Al</Text>
            </Pressable>
            <Pressable onPress={() => setShowLiveOnly(!showLiveOnly)} style={{ backgroundColor: showLiveOnly ? '#ecfdf5' : '#fff', borderColor: showLiveOnly ? '#a7f3d0' : '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
              <Text>{showLiveOnly ? '• Yalnızca canlı' : 'Tüm sanatçılar'}</Text>
            </Pressable>
            <Pressable onPress={() => setShowArtists(!showArtists)} style={{ backgroundColor: showArtists ? '#ecfdf5' : '#fff', borderColor: showArtists ? '#a7f3d0' : '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
              <Text>{showArtists ? 'Sanatçı: Açık' : 'Sanatçı: Kapalı'}</Text>
            </Pressable>
            <Pressable onPress={() => setShowEvents(!showEvents)} style={{ backgroundColor: showEvents ? '#f5f3ff' : '#fff', borderColor: showEvents ? '#ddd6fe' : '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
              <Text>{showEvents ? 'Etkinlik: Açık' : 'Etkinlik: Kapalı'}</Text>
            </Pressable>
          </View>
        </View>

        {tab === 'user' && (
        /* Map */
        Platform.OS !== 'web' ? (
          <MobileMap
            artists={showArtists ? filtered : []}
            events={showEvents ? events : []}
            pos={pos}
            onSelect={(a) => openDetail(a)}
            onSelectEvent={(ev) => {
              const a = artists.find((x) => x.id === ev.artistId);
              if (a) openDetail(a);
            }}
            setMapApi={(api) => { mapApi.current = api; }}
          />
        ) : (
          <WebMap
            artists={showArtists ? filtered : []}
            events={showEvents ? events : []}
            pos={pos}
            onSelect={(a) => openDetail(a)}
            onSelectEvent={(ev) => {
              const a = artists.find((x) => x.id === ev.artistId);
              if (a) openDetail(a);
            }}
            setMapApi={(api) => { mapApi.current = api; }}
          />
        ))}

        {tab === 'user' && <View style={{ flex: 1 }}>
          {filtered.length === 0 ? (
            <Text style={{ color: '#475569' }}>Sonuç yok. Yarıçapı artırmayı deneyin.</Text>
          ) : (
            <FlatList
              data={[...filtered].sort((a,b)=> (follow.includes(b.id)?1:0)-(follow.includes(a.id)?1:0)).slice(0,50)}
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
                    <Pressable onPress={() => {
                      if (Platform.OS !== 'web' && mapApi.current && mapApi.current.centerTo) mapApi.current.centerTo(item.location.lat, item.location.lng);
                      else {
                        const url = `https://www.google.com/maps/search/?api=1&query=${item.location.lat},${item.location.lng}`;
                        if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank'); else Linking.openURL(url).catch(()=>{});
                      }
                    }} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginLeft: 6 }}>
                      <Text>Haritada</Text>
                    </Pressable>
                  </View>
                );
              }}
            />
          )}
          <Text style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>(Yürüdükçe {geo} m yakındaki canlılar için bildirim)</Text>
        </View>}

        {/* Events Panel */}
        {tab === 'user' && <View style={{ backgroundColor: 'white', borderRadius: 12, padding: 12, borderColor: '#e5e7eb', borderWidth: 1, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700' }}>Etkinlikler</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable onPress={() => setDayOffset(dayOffset - 1)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginRight: 6 }}><Text>◀︎</Text></Pressable>
              <Text>{(() => { const d = new Date(); d.setDate(d.getDate()+dayOffset); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; })()}</Text>
              <Pressable onPress={() => setDayOffset(dayOffset + 1)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginLeft: 6 }}><Text>▶︎</Text></Pressable>
            </View>
          </View>
          <View style={{ marginTop: 8 }}>
            {events.filter(e => e.date === (() => { const d = new Date(); d.setDate(d.getDate()+dayOffset); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; })()).length === 0 ? (
              <Text style={{ color: '#475569' }}>Liste boş.</Text>
            ) : (
              events.filter(e => e.date === (() => { const d = new Date(); d.setDate(d.getDate()+dayOffset); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; })()).map(e => {
                const a = artists.find(x => x.id === e.artistId);
                return (
                  <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontWeight: '600', marginRight: 8 }}>{e.start}–{e.end}</Text>
                      <Text>{a ? a.name : 'Sanatçı'}</Text>
                      <Text style={{ color: '#64748b', marginLeft: 6 }}>· {e.venue}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable onPress={() => { if (mapApi.current && mapApi.current.centerTo) mapApi.current.centerTo(e.lat, e.lng); }} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginLeft: 6 }}><Text>Haritada</Text></Pressable>
                      <Pressable onPress={() => openDirections(e.lat, e.lng, e.venue)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginLeft: 6 }}><Text>Tarif</Text></Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>}

        <Modal visible={detailOpen} animationType="slide" onRequestClose={closeDetail}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={{ padding: 12 }}>
              <Pressable onPress={closeDetail} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignSelf: 'flex-start' }}><Text>Kapat</Text></Pressable>
              {sel && (
                <View style={{ alignItems: 'center', marginTop: 12 }}>
                  <Image source={{ uri: sel.avatar }} style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8 }} />
                  <Text style={{ fontSize: 20, fontWeight: '700' }}>{sel.name}</Text>
                  <Text style={{ color: '#475569', marginTop: 4 }}>{sel.genre} {sel.verified ? '· ✓' : ''} {sel.isLive ? '· • Aktif' : ''}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <Pressable onPress={() => setFollow((arr) => arr.includes(sel.id) ? arr.filter(x => x !== sel.id) : [...arr, sel.id])} style={{ backgroundColor: follow.includes(sel.id)? '#ecfdf5':'#fff', borderColor: follow.includes(sel.id)? '#a7f3d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
                      <Text>{follow.includes(sel.id) ? 'Takiptesin' : '+ Takip et'}</Text>
                    </Pressable>
                    <Pressable onPress={() => openDirections(sel.location.lat, sel.location.lng, sel.name)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
                      <Text>Yol tarifi</Text>
                    </Pressable>
                    <Pressable onPress={() => {
                      const url = `https://www.google.com/maps/search/?api=1&query=${sel.location.lat},${sel.location.lng}`;
                      if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank'); else Linking.openURL(url).catch(()=>{});
                    }} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
                      <Text>Google Maps</Text>
                    </Pressable>
                  </View>
                  <View style={{ marginTop: 16, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, width: '100%' }}>
                    <Text style={{ fontWeight: '600', marginBottom: 8 }}>Hızlı Bahşiş</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                      {[20,50,100].map(a => (
                        <Pressable key={a} onPress={() => { const id = (tips[tips.length-1]?.id||0)+1; setTips([...tips, { id, artistId: sel.id, amount: a, at: Date.now() }]); Alert.alert('Teşekkürler', `₺${a} gönderildi`); }} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginHorizontal: 4 }}>
                          <Text>₺{a}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: '#475569', marginBottom: 6 }}>Toplam: ₺{tips.filter(t=>t.artistId===sel.id).reduce((s,t)=>s+t.amount,0).toFixed(2)}</Text>
                      {tips.filter(t=>t.artistId===sel.id).slice(-5).reverse().map(t => (
                        <Text key={t.id} style={{ color: '#64748b', fontSize: 12 }}>• ₺{t.amount} — {new Date(t.at).toLocaleString()}</Text>
                      ))}
                    </View>
                  </View>
                </View>
              )}
            </View>
          </SafeAreaView>
        </Modal>

        {/* Totals */}
        <View style={{ backgroundColor: 'white', borderRadius: 12, padding: 12, borderColor: '#e5e7eb', borderWidth: 1, marginTop: 8 }}>
          <Text style={{ fontWeight: '700', marginBottom: 6 }}>Özet</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Text style={{ marginRight: 16, color: '#475569' }}>Takip: {follow.length}</Text>
            <Text style={{ marginRight: 16, color: '#475569' }}>Bahşiş adedi: {tips.length}</Text>
            <Text style={{ marginRight: 16, color: '#475569' }}>Toplam Bahşiş: ₺{tips.reduce((s,t)=>s+t.amount,0).toFixed(2)}</Text>
          </View>
        </View>

        {tab === 'admin' && (
          <View style={{ backgroundColor: 'white', borderRadius: 12, padding: 12, borderColor: '#e5e7eb', borderWidth: 1, marginTop: 8 }}>
            <Text style={{ fontWeight: '700', marginBottom: 8 }}>Admin · Sanatçı Yönetimi</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
              <Text style={{ marginRight: 12, color: '#475569' }}>Toplam: {artists.length}</Text>
              <Text style={{ marginRight: 12, color: '#475569' }}>Aktif: {artists.filter(a=>a.active!==false).length}</Text>
              <Text style={{ marginRight: 12, color: '#475569' }}>Pasif: {artists.filter(a=>a.active===false).length}</Text>
              <Text style={{ marginRight: 12, color: '#475569' }}>Doğrulanan: {artists.filter(a=>a.verified).length}</Text>
              <Text style={{ marginRight: 12, color: '#475569' }}>Canlı: {artists.filter(a=>a.isLive).length}</Text>
            </View>
            <View /* admin tools */ style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <TextInput placeholder="Search" value={adminQ} onChangeText={(t)=>setAdminQ(t)} style={{ minWidth: 160, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }} />
              <Pressable onPress={() => downloadFile(`artists-${todayISO()}.csv`, csvArtists(artists), 'text/csv')} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Sanatçıları CSV</Text></Pressable>
              <Pressable onPress={() => downloadFile(`events-${todayISO()}.csv`, csvEvents(events, artists), 'text/csv')} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Etkinlikleri CSV</Text></Pressable>
              <Pressable onPress={() => downloadFile(`events-all.ics`, toICS(events, artists), 'text/calendar')} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Tümünü .ics</Text></Pressable>
            </View>
            {artists.map((a) => (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderColor: '#f1f5f9' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Image source={{ uri: a.avatar }} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }} />
                  <Text style={{ fontWeight: '600' }}>{a.name}</Text>
                  <Text style={{ color: '#64748b', marginLeft: 6 }}>· {a.genre}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => setArtists(arr => arr.map(x => x.id===a.id ? { ...x, active: !(x.active!==false) } : x))} style={{ backgroundColor: a.active!==false ? '#ecfdf5':'#fff', borderColor: a.active!==false ? '#a7f3d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>{a.active!==false ? 'Aktif' : 'Pasif'}</Text></Pressable>
                  <Pressable onPress={() => setArtists(arr => arr.map(x => x.id===a.id ? { ...x, verified: !x.verified } : x))} style={{ backgroundColor: a.verified ? '#ecfeff':'#fff', borderColor: a.verified ? '#a5f3fc':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>{a.verified ? 'Doğrulandı' : 'Doğrula'}</Text></Pressable>
                  <Pressable onPress={() => setArtists(arr => arr.map(x => x.id===a.id ? { ...x, isLive: !x.isLive, startedAt: !x.isLive ? now() : x.startedAt } : x))} style={{ backgroundColor: a.isLive ? '#f0fdf4':'#fff', borderColor: a.isLive ? '#bbf7d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>{a.isLive ? 'Canlı' : 'Canlı Yap'}</Text></Pressable>
                  <Pressable onPress={() => setFollow(arr => arr.includes(a.id) ? arr.filter(x=>x!==a.id) : [...arr,a.id])} style={{ backgroundColor: follow.includes(a.id)? '#ecfdf5':'#fff', borderColor: follow.includes(a.id)? '#a7f3d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>{follow.includes(a.id)? 'Takiptesin':'Takip et'}</Text></Pressable>
                  <Pressable onPress={() => { if (mapApi.current?.centerTo) mapApi.current.centerTo(a.location.lat, a.location.lng); }} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>Haritada</Text></Pressable>
                </View>
              </View>
            ))}
            <View /* admin event form */ style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: '#f1f5f9', gap: 8 }}>
              <Text style={{ fontWeight: '700' }}>Etkinlik Ekle</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Text>Sanatçı:</Text>
                <Pressable onPress={()=> setAdminForm(f=>{ const idx=(f.artistIdx-1+artists.length)%artists.length; return { ...f, artistIdx: idx, lat: artists[idx]?.location.lat, lng: artists[idx]?.location.lng }; })} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth:1, paddingHorizontal:8, paddingVertical:6, borderRadius:8 }}><Text>{'<'}</Text></Pressable>
                <Text>{artists[adminForm.artistIdx]?.name || '-'}</Text>
                <Pressable onPress={()=> setAdminForm(f=>{ const idx=(f.artistIdx+1)%artists.length; return { ...f, artistIdx: idx, lat: artists[idx]?.location.lat, lng: artists[idx]?.location.lng }; })} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth:1, paddingHorizontal:8, paddingVertical:6, borderRadius:8 }}><Text>{'>'}</Text></Pressable>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <TextInput value={adminForm.date} onChangeText={(t)=>setAdminForm(f=>({ ...f, date: t }))} placeholder="YYYY-MM-DD" style={{ minWidth:120, paddingVertical:6, paddingHorizontal:8, borderWidth:1, borderColor:'#e5e7eb', borderRadius:8 }} />
                <TextInput value={adminForm.start} onChangeText={(t)=>setAdminForm(f=>({ ...f, start: t }))} placeholder="HH:mm" style={{ width:90, paddingVertical:6, paddingHorizontal:8, borderWidth:1, borderColor:'#e5e7eb', borderRadius:8 }} />
                <TextInput value={adminForm.end} onChangeText={(t)=>setAdminForm(f=>({ ...f, end: t }))} placeholder="HH:mm" style={{ width:90, paddingVertical:6, paddingHorizontal:8, borderWidth:1, borderColor:'#e5e7eb', borderRadius:8 }} />
                <TextInput value={adminForm.venue} onChangeText={(t)=>setAdminForm(f=>({ ...f, venue: t }))} placeholder="Mekan" style={{ minWidth:160, flexGrow:1, paddingVertical:6, paddingHorizontal:8, borderWidth:1, borderColor:'#e5e7eb', borderRadius:8 }} />
                <TextInput value={String(adminForm.lat)} onChangeText={(t)=>setAdminForm(f=>({ ...f, lat: Number(t)||0 }))} placeholder="lat" style={{ width:120, paddingVertical:6, paddingHorizontal:8, borderWidth:1, borderColor:'#e5e7eb', borderRadius:8 }} />
                <TextInput value={String(adminForm.lng)} onChangeText={(t)=>setAdminForm(f=>({ ...f, lng: Number(t)||0 }))} placeholder="lng" style={{ width:120, paddingVertical:6, paddingHorizontal:8, borderWidth:1, borderColor:'#e5e7eb', borderRadius:8 }} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => { const a = artists[adminForm.artistIdx]; if (!a) return; const id = (events[events.length-1]?.id || 0) + 1; setEvents([...events, { id, artistId: a.id, date: adminForm.date, start: adminForm.start, end: adminForm.end, venue: adminForm.venue, lat: adminForm.lat, lng: adminForm.lng }]); Alert.alert('Eklendi', 'Etkinlik eklendi'); }} style={{ backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Ekle</Text></Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
