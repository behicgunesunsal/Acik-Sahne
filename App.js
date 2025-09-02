import React, { useEffect, useMemo, useState } from 'react';
import { Platform, SafeAreaView, View, Text, Image, TextInput, Pressable, FlatList, Modal, Alert, Linking, ScrollView } from 'react-native';
// Static test data (JSON)
import artistsData from './assets/testdata/artists.json';
import eventsData from './assets/testdata/events.json';
import tipsData from './assets/testdata/tips.json';

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

// Use static JSON as deterministic test data
const seedArtists = () => artistsData;

const TEST_USERS = [
  { id: 't-001', name: 'Ayşe K.',  avatar: 'https://i.pravatar.cc/64?img=12', provider: 'google', followIds: [1,2,3] },
  { id: 't-002', name: 'Mehmet T.',avatar: 'https://i.pravatar.cc/64?img=22', provider: 'google', followIds: [4,5,6] },
  { id: 't-003', name: 'Sanatçı Demo', avatar: 'https://i.pravatar.cc/64?img=32', provider: 'apple',  followIds: [7,8] },
  { id: 't-004', name: 'Admin Demo',   avatar: 'https://i.pravatar.cc/64?img=42', provider: 'apple',  isAdmin: true, followIds: [1,4,7] },
  { id: 't-005', name: 'Ziyaretçi',    avatar: 'https://i.pravatar.cc/64?img=52', provider: 'google', followIds: [] },
];

export default function App() {
  const makeUser = (provider) => {
    const firsts = ['Ayşe','Mehmet','Deniz','Ece','Kerem','Selin','Can','Elif'];
    const name = firsts[Math.floor(Math.random()*firsts.length)] + ' ' + String.fromCharCode(65+Math.floor(Math.random()*26)) + '.';
    const avatar = `https://i.pravatar.cc/64?img=${Math.floor(rand(1,70))}`;
    return { id: Math.random().toString(36).slice(2,10), name, avatar, provider };
  };
  const [artists, setArtists] = usePersistedState('as.artists', seedArtists());
  const seedEvents = () => eventsData;
  
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
  const [events, setEvents] = usePersistedState('as.events', seedEvents());
  const [sel, setSel] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [showLiveOnly, setShowLiveOnly] = useState(false);
  const [showArtists, setShowArtists] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const mapApi = React.useRef(null);
  const [user, setUser] = usePersistedState('as.user', null);
  const [tab, setTab] = useState('user'); // 'user' | 'admin'
  const [loginOpen, setLoginOpen] = useState(false);
  const [stage, setStage] = usePersistedState('as.stage', 'splash'); // 'splash' | 'login' | 'profile' | 'main'
  const [profile, setProfile] = usePersistedState('as.profile', null); // { name, role, artistId? }
  const [shareOpen, setShareOpen] = useState(false);
  const [shareType, setShareType] = useState('Müzik');
  const [follow, setFollow] = usePersistedState('as.follow', []);
  const [tips, setTips] = usePersistedState('as.tips', tipsData);
  const [adminQ, setAdminQ] = useState('');
  const [adminOnlyActive, setAdminOnlyActive] = useState(false);
  const [adminOnlyVerified, setAdminOnlyVerified] = useState(false);
  const [adminOnlyLive, setAdminOnlyLive] = useState(false);
  const [adminPage, setAdminPage] = useState(0);
  const [adminSel, setAdminSel] = useState([]); // selected artist ids
  const ADMIN_PAGE_SIZE = 20;
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
        <View style={{ height: 140, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' }}>
          <Text style={{ color: '#64748b', paddingHorizontal: 12, textAlign: 'center', fontSize: 13 }}>
            Harita modülü yüklü değil. Listeden seçim yapabilir veya modülü ekleyebilirsiniz.
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
      {/* Stage: Splash */}
      {stage === 'splash' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Image source={require('./assets/icon.png')} style={{ width: 96, height: 96, borderRadius: 20 }} />
          <Text style={{ fontSize: 22, fontWeight: '700' }}>Açık Sahne</Text>
          <Pressable onPress={() => setStage('login')} style={{ backgroundColor: '#111827', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}>
            <Text style={{ color: 'white' }}>Devam</Text>
          </Pressable>
        </View>
      )}
      {/* Stage: Login */}
      {stage === 'login' && !user && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Text style={{ fontSize: 18, fontWeight: '600' }}>Giriş yap</Text>
          <Pressable onPress={signInGoogle} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}><Text>Google ile Giriş</Text></Pressable>
          <Pressable onPress={signInApple} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}><Text>Apple ile Giriş</Text></Pressable>
          <View style={{ height: 1, backgroundColor: '#e5e7eb', width: 200 }} />
          {TEST_USERS.map(tu => (
            <Pressable key={tu.id} onPress={() => { setUser(tu); if (Array.isArray(tu.followIds)) setFollow(tu.followIds); if (tu.isAdmin) setTab('admin'); setStage('profile'); }} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 }}>
              <Text>{tu.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {/* Stage: Profile */}
      {user && (!profile || stage === 'profile') && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <View style={{ width: '100%', maxWidth: 420, backgroundColor: 'white', borderRadius: 14, borderColor: '#e5e7eb', borderWidth: 1, padding: 12, gap: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '700' }}>Profil</Text>
            <TextInput value={(profile?.name) ?? user.name} onChangeText={(t)=> setProfile(p => ({ ...(p||{}), name: t }))} placeholder="Ad" style={{ paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={()=> setProfile(p=> ({ ...(p||{}), role: 'Dinleyen' }))} style={{ backgroundColor: (profile?.role==='Dinleyen')? '#ecfdf5':'#fff', borderColor: (profile?.role==='Dinleyen')? '#a7f3d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Dinleyen</Text></Pressable>
              <Pressable onPress={()=> setProfile(p=> ({ ...(p||{}), role: 'Sanatçı' }))} style={{ backgroundColor: (profile?.role==='Sanatçı')? '#ecfeff':'#fff', borderColor: (profile?.role==='Sanatçı')? '#a5f3fc':'#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Sanatçı</Text></Pressable>
            </View>
            {(profile?.role==='Sanatçı') && (
              <View style={{ gap: 8 }}>
                <Text>Sanatçı Hesabı</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {artists.map(a => (
                    <Pressable key={a.id} onPress={()=> setProfile(p=> ({ ...(p||{}), artistId: a.id }))} style={{ backgroundColor: (profile?.artistId===a.id)? '#e0e7ff':'#fff', borderColor: (profile?.artistId===a.id)? '#c7d2fe':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
                      <Text>{a.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            <Pressable onPress={()=> { if (!profile?.name) setProfile(p=> ({ ...(p||{}), name: user.name })); setStage('main'); }} style={{ backgroundColor: '#111827', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, alignSelf: 'flex-end' }}>
              <Text style={{ color: 'white' }}>Kaydet ve Devam</Text>
            </Pressable>
          </View>
        </View>
      )}
      {/* Stop rendering rest until main */}
      {stage !== 'main' && (stage==='splash' || (stage==='login' && !user) || (user && (!profile || stage==='profile'))) ? null : (
      <View style={{ padding: 12, gap: 12, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700' }}>Açık Sahne</Text>
            <Text style={{ marginLeft: 8, color: '#64748b', fontSize: 12 }}>Mobil</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {user ? (
              <Pressable onPress={() => setLoginOpen(v=>!v)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}>
                <Image source={{ uri: user.avatar }} style={{ width: 22, height: 22, borderRadius: 11, marginRight: 6 }} />
                <Text>{user.name.split(' ')[0]}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setLoginOpen(v=>!v)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 }}>
                <Text>Giriş</Text>
              </Pressable>
            )}
            <View style={{ marginLeft: 8, flexDirection: 'row' }}>
              <Pressable onPress={() => setTab('user')} style={{ backgroundColor: tab==='user'? '#ecfdf5':'#fff', borderColor: tab==='user'? '#a7f3d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, marginRight: 6 }}><Text>Kullanıcı</Text></Pressable>
              <Pressable onPress={() => setTab('admin')} style={{ backgroundColor: tab==='admin'? '#fef3c7':'#fff', borderColor: tab==='admin'? '#fde68a':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}><Text>Admin</Text></Pressable>
            </View>
          </View>
        </View>
        {loginOpen && (
          <View style={{ position: 'absolute', right: 12, top: 46, backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, borderRadius: 12, padding: 8, zIndex: 50, gap: 6 }}>
            {!user ? (
              <>
                <Pressable onPress={() => { setLoginOpen(false); signInGoogle(); }} style={{ paddingHorizontal: 10, paddingVertical: 8 }}><Text>Google ile Giriş</Text></Pressable>
                <Pressable onPress={() => { setLoginOpen(false); signInApple(); }} style={{ paddingHorizontal: 10, paddingVertical: 8 }}><Text>Apple ile Giriş</Text></Pressable>
                <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 4 }} />
                {TEST_USERS.map(tu => (
                  <Pressable key={tu.id} onPress={() => { setUser(tu); if (Array.isArray(tu.followIds)) setFollow(tu.followIds); if (tu.isAdmin) setTab('admin'); setLoginOpen(false); }} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
                    <Text>{tu.name}</Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <Pressable onPress={() => { setUser(null); setLoginOpen(false); }} style={{ paddingHorizontal: 10, paddingVertical: 8 }}><Text>Çıkış</Text></Pressable>
            )}
          </View>
        )}

        <View style={{ backgroundColor: 'white', borderRadius: 14, padding: 10, borderColor: '#e5e7eb', borderWidth: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 14 }}>
              <Text style={{ fontWeight: '600', marginRight: 6 }}>Tür:</Text>
              <Pressable onPress={() => cycleGenre(-1)} style={{ paddingHorizontal: 6, paddingVertical: 4, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginRight: 6 }}><Text>◀︎</Text></Pressable>
              <Text>{g}</Text>
              <Pressable onPress={() => cycleGenre(1)} style={{ paddingHorizontal: 6, paddingVertical: 4, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginLeft: 6 }}><Text>▶︎</Text></Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 14 }}>
              <Text style={{ fontWeight: '600', marginRight: 6 }}>Yarıçap:</Text>
              <TextInput value={String(geo)} onChangeText={(t) => setGeo(Math.max(50, Number(t) || 0))} keyboardType="numeric" style={{ width: 70, paddingVertical: 4, paddingHorizontal: 6 }} />
              <Text style={{ marginLeft: 4, color: '#64748b' }}>m</Text>
            </View>
            <Pressable onPress={getLoc} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 }}>
              <Text>Konum</Text>
            </Pressable>
            <Pressable onPress={() => setShowLiveOnly(!showLiveOnly)} style={{ backgroundColor: showLiveOnly ? '#ecfdf5' : '#fff', borderColor: showLiveOnly ? '#a7f3d0' : '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 }}>
              <Text>{showLiveOnly ? 'Yalnızca canlı' : 'Tümü'}</Text>
            </Pressable>
            <Pressable onPress={() => setShowArtists(!showArtists)} style={{ backgroundColor: showArtists ? '#ecfdf5' : '#fff', borderColor: showArtists ? '#a7f3d0' : '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 }}>
              <Text>Sanatçı {showArtists ? 'Açık' : 'Kapalı'}</Text>
            </Pressable>
            <Pressable onPress={() => setShowEvents(!showEvents)} style={{ backgroundColor: showEvents ? '#f5f3ff' : '#fff', borderColor: showEvents ? '#ddd6fe' : '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 }}>
              <Text>Etkinlik {showEvents ? 'Açık' : 'Kapalı'}</Text>
            </Pressable>
          </View>
        </View>

        {tab === 'user' && (
        /* Quick share – only for artists */
        (profile?.role === 'Sanatçı') && (
          <View style={{ backgroundColor: 'white', borderRadius: 14, borderColor: '#e5e7eb', borderWidth: 1, padding: 8 }}>
            <Text style={{ fontWeight: '700', marginBottom: 6 }}>Hızlı Paylaş</Text>
            <View style={{ height: 160, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}>
              {Platform.OS !== 'web' ? (
                <MobileMap artists={[]} events={[]} pos={pos} onSelect={()=>{}} setMapApi={(api)=> (mapApi.current = api)} />
              ) : (
                <WebMap artists={[]} events={[]} pos={pos} onSelect={()=>{}} />
              )}
              <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <Pressable onPress={()=> setShareOpen(true)} style={{ backgroundColor: '#111827', padding: 18, borderRadius: 999, opacity: 0.9 }}>
                  <Text style={{ color: 'white', fontWeight: '700' }}>Paylaş</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
        {shareOpen && (
          <Modal transparent animationType="fade" onRequestClose={()=> setShareOpen(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <View style={{ width: '100%', maxWidth: 360, backgroundColor: 'white', borderRadius: 12, padding: 12, gap: 10 }}>
                <Text style={{ fontWeight: '700', fontSize: 16 }}>Etkinlik Türü</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['Müzik','Sohbet','Dans'].map(t => (
                    <Pressable key={t} onPress={()=> setShareType(t)} style={{ backgroundColor: (shareType===t)? '#ecfdf5':'#fff', borderColor: (shareType===t)? '#a7f3d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
                      <Text>{t}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                  <Pressable onPress={()=> setShareOpen(false)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Kapat</Text></Pressable>
                  <Pressable onPress={async ()=> {
                    try {
                      await getLoc();
                    } catch {}
                    const aId = profile?.artistId || artists[0]?.id;
                    if (!aId) { setShareOpen(false); return; }
                    const nowD = new Date();
                    const d = `${nowD.getFullYear()}-${String(nowD.getMonth()+1).padStart(2,'0')}-${String(nowD.getDate()).padStart(2,'0')}`;
                    const st = `${String(nowD.getHours()).padStart(2,'0')}:${String(nowD.getMinutes()).padStart(2,'0')}`;
                    const etH = new Date(nowD.getTime()+60*60000);
                    const en = `${String(etH.getHours()).padStart(2,'0')}:${String(etH.getMinutes()).padStart(2,'0')}`;
                    const id = (events[events.length-1]?.id || 0) + 1;
                    setEvents([...events, { id, artistId: aId, date: d, start: st, end: en, venue: shareType, lat: pos.lat, lng: pos.lng }]);
                    setArtists(arr => arr.map(x => x.id===aId ? { ...x, isLive: true, startedAt: now(), plannedMinutes: 60 } : x));
                    Alert.alert('Paylaşıldı', `${shareType} etkinliği paylaşıldı`);
                    setShareOpen(false);
                  }} style={{ backgroundColor: '#111827', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text style={{ color: 'white' }}>Paylaş</Text></Pressable>
                </View>
              </View>
            </View>
          </Modal>
        )}
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
              numColumns={2}
              columnWrapperStyle={{ gap: 8 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyExtractor={(item) => String(item.id)}
              ListHeaderComponent={() => (
                <View style={{ backgroundColor: '#ffffffee', borderColor: '#e5e7eb', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <Text style={{ fontWeight: '600' }}>Filtre:</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ color: '#111827', marginRight: 6 }}>Tür: {g}</Text>
                      <Pressable onPress={() => cycleGenre(-1)} style={{ paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginRight: 4 }}><Text>◀︎</Text></Pressable>
                      <Pressable onPress={() => cycleGenre(1)} style={{ paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}><Text>▶︎</Text></Pressable>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ color: '#111827' }}>Yarıçap: {geo}m</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ color: '#111827' }}>Sonuç: {filtered.length}</Text>
                    </View>
                    <Pressable onPress={getLoc} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                      <Text>Konum</Text>
                    </Pressable>
                    <Pressable onPress={() => setShowLiveOnly(v=>!v)} style={{ backgroundColor: showLiveOnly? '#ecfdf5':'#fff', borderColor: showLiveOnly? '#a7f3d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                      <Text>{showLiveOnly? 'Yalnızca canlı':'Tümü'}</Text>
                    </Pressable>
                    <Pressable onPress={() => setShowArtists(v=>!v)} style={{ backgroundColor: showArtists? '#ecfdf5':'#fff', borderColor: showArtists? '#a7f3d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                      <Text>Sanatçı {showArtists? 'Açık':'Kapalı'}</Text>
                    </Pressable>
                    <Pressable onPress={() => setShowEvents(v=>!v)} style={{ backgroundColor: showEvents? '#f5f3ff':'#fff', borderColor: showEvents? '#ddd6fe':'#e5e7eb', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                      <Text>Etkinlik {showEvents? 'Açık':'Kapalı'}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              stickyHeaderIndices={[0]}
              renderItem={({ item }) => {
                const el = (now() - item.startedAt) / 60000;
                const dist = Math.round(hav(pos, item.location));
                return (
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 6, backgroundColor: 'white', borderRadius: 12, marginBottom: 8, borderColor: '#e5e7eb', borderWidth: 1 }}>
                    <Image source={{ uri: item.avatar }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={{ fontWeight: '600', marginRight: 4 }}>{item.name}</Text>
                        {item.verified ? <Text style={{ color: '#059669', fontSize: 11 }}>✓</Text> : null}
                        {item.isLive ? <Text style={{ color: '#059669', fontSize: 11, marginLeft: 6 }}>• Canlı</Text> : null}
                      </View>
                      <Text style={{ color: '#475569', fontSize: 12 }} numberOfLines={1}>{item.genre} · {fmt(el)} · Plan {fmt(item.plannedMinutes)} · {dist}m</Text>
                    </View>
                    <Pressable onPress={() => openDetail(item)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, marginLeft: 6 }}><Text>Aç</Text></Pressable>
                    <Pressable onPress={() => {
                      if (Platform.OS !== 'web' && mapApi.current && mapApi.current.centerTo) { mapApi.current.centerTo(item.location.lat, item.location.lng); }
                      else {
                        const url = `https://www.google.com/maps/search/?api=1&query=${item.location.lat},${item.location.lng}`;
                        if (Platform.OS === 'web' && typeof window !== 'undefined') { window.open(url, '_blank'); } else { Linking.openURL(url).catch(()=>{}); }
                      }
                    }} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, marginLeft: 6 }}>
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
                      if (Platform.OS === 'web' && typeof window !== 'undefined') { window.open(url, '_blank'); } else { Linking.openURL(url).catch(()=>{}); }
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
              <Pressable onPress={()=>setAdminOnlyActive(v=>!v)} style={{ backgroundColor: adminOnlyActive? '#ecfdf5':'#fff', borderColor: adminOnlyActive? '#a7f3d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 }}>
                <Text>Aktif {adminOnlyActive? '✓':''}</Text>
              </Pressable>
              <Pressable onPress={()=>setAdminOnlyVerified(v=>!v)} style={{ backgroundColor: adminOnlyVerified? '#ecfeff':'#fff', borderColor: adminOnlyVerified? '#a5f3fc':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 }}>
                <Text>Doğrulanan {adminOnlyVerified? '✓':''}</Text>
              </Pressable>
              <Pressable onPress={()=>setAdminOnlyLive(v=>!v)} style={{ backgroundColor: adminOnlyLive? '#f0fdf4':'#fff', borderColor: adminOnlyLive? '#bbf7d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 }}>
                <Text>Canlı {adminOnlyLive? '✓':''}</Text>
              </Pressable>
              <Pressable onPress={() => downloadFile(`artists-${todayISO()}.csv`, csvArtists(artists), 'text/csv')} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Sanatçıları CSV</Text></Pressable>
              <Pressable onPress={() => downloadFile(`events-${todayISO()}.csv`, csvEvents(events, artists), 'text/csv')} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Etkinlikleri CSV</Text></Pressable>
              <Pressable onPress={() => downloadFile(`events-all.ics`, toICS(events, artists), 'text/calendar')} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Tümünü .ics</Text></Pressable>
              <Pressable onPress={() => {
                const fs = artists
                  .filter(a => (adminQ||'').trim()==='' || a.name.toLowerCase().includes(adminQ.toLowerCase()) || a.genre.toLowerCase().includes(adminQ.toLowerCase()))
                  .filter(a => !adminOnlyActive || a.active!==false)
                  .filter(a => !adminOnlyVerified || !!a.verified)
                  .filter(a => !adminOnlyLive || !!a.isLive);
                downloadFile(`artists-filtered-${todayISO()}.csv`, csvArtists(fs), 'text/csv');
              }} style={{ backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Filtreli Sanatçı CSV</Text></Pressable>
              <Pressable onPress={() => {
                const fs = artists
                  .filter(a => (adminQ||'').trim()==='' || a.name.toLowerCase().includes(adminQ.toLowerCase()) || a.genre.toLowerCase().includes(adminQ.toLowerCase()))
                  .filter(a => !adminOnlyActive || a.active!==false)
                  .filter(a => !adminOnlyVerified || !!a.verified)
                  .filter(a => !adminOnlyLive || !!a.isLive);
                const ids = new Set(fs.map(a=>a.id));
                const evFiltered = events.filter(e => ids.has(e.artistId));
                downloadFile(`events-filtered-${todayISO()}.csv`, csvEvents(evFiltered, artists), 'text/csv');
              }} style={{ backgroundColor: '#ecfeff', borderColor: '#a5f3fc', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Filtreli Etkinlik CSV</Text></Pressable>
                {adminSel.length > 0 && (
                <>
                  <Pressable onPress={() => {
                    const ids = new Set(adminSel);
                    const sel = artists.filter(a => ids.has(a.id));
                    downloadFile(`artists-selected-${todayISO()}.csv`, csvArtists(sel), 'text/csv');
                  }} style={{ backgroundColor: '#e0e7ff', borderColor: '#c7d2fe', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Seçili Sanatçı CSV</Text></Pressable>
                  <Pressable onPress={() => {
                    const ids = new Set(adminSel);
                    const evSel = events.filter(e => ids.has(e.artistId));
                    downloadFile(`events-selected-${todayISO()}.csv`, csvEvents(evSel, artists), 'text/csv');
                  }} style={{ backgroundColor: '#e0f2fe', borderColor: '#bae6fd', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Seçili Etkinlik CSV</Text></Pressable>
                  <Pressable onPress={() => {
                    const ids = new Set(adminSel);
                    const evSel = events.filter(e => ids.has(e.artistId));
                    downloadFile(`events-selected.ics`, toICS(evSel, artists), 'text/calendar');
                  }} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text>Seçili .ics</Text></Pressable>
                </>
              )}
            </View>
            {/** admin filtered + pagination */}
            {(() => {
              const adminFiltered = artists
                .filter(a => (adminQ||'').trim()==='' || a.name.toLowerCase().includes(adminQ.toLowerCase()) || a.genre.toLowerCase().includes(adminQ.toLowerCase()))
                .filter(a => !adminOnlyActive || a.active!==false)
                .filter(a => !adminOnlyVerified || !!a.verified)
                .filter(a => !adminOnlyLive || !!a.isLive);
              const start = adminPage * ADMIN_PAGE_SIZE;
              const pageItems = adminFiltered.slice(start, start + ADMIN_PAGE_SIZE);
              return pageItems.map((a) => (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderColor: '#f1f5f9' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Image source={{ uri: a.avatar }} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }} />
                  <Text style={{ fontWeight: '600' }}>{a.name}</Text>
                  <Text style={{ color: '#64748b', marginLeft: 6 }}>· {a.genre}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => setAdminSel(ids => ids.includes(a.id) ? ids.filter(x=>x!==a.id) : [...ids, a.id])} style={{ backgroundColor: adminSel.includes(a.id)? '#e0e7ff':'#fff', borderColor: adminSel.includes(a.id)? '#c7d2fe':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>{adminSel.includes(a.id)? 'Seçili':'Seç'}</Text></Pressable>
                  <Pressable onPress={() => setArtists(arr => arr.map(x => x.id===a.id ? { ...x, active: !(x.active!==false) } : x))} style={{ backgroundColor: a.active!==false ? '#ecfdf5':'#fff', borderColor: a.active!==false ? '#a7f3d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>{a.active!==false ? 'Aktif' : 'Pasif'}</Text></Pressable>
                  <Pressable onPress={() => setArtists(arr => arr.map(x => x.id===a.id ? { ...x, verified: !x.verified } : x))} style={{ backgroundColor: a.verified ? '#ecfeff':'#fff', borderColor: a.verified ? '#a5f3fc':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>{a.verified ? 'Doğrulandı' : 'Doğrula'}</Text></Pressable>
                  <Pressable onPress={() => setArtists(arr => arr.map(x => x.id===a.id ? { ...x, isLive: !x.isLive, startedAt: !x.isLive ? now() : x.startedAt } : x))} style={{ backgroundColor: a.isLive ? '#f0fdf4':'#fff', borderColor: a.isLive ? '#bbf7d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>{a.isLive ? 'Canlı' : 'Canlı Yap'}</Text></Pressable>
                  <Pressable onPress={() => setFollow(arr => arr.includes(a.id) ? arr.filter(x=>x!==a.id) : [...arr,a.id])} style={{ backgroundColor: follow.includes(a.id)? '#ecfdf5':'#fff', borderColor: follow.includes(a.id)? '#a7f3d0':'#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>{follow.includes(a.id)? 'Takiptesin':'Takip et'}</Text></Pressable>
                  <Pressable onPress={() => { if (mapApi.current?.centerTo) mapApi.current.centerTo(a.location.lat, a.location.lng); }} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>Haritada</Text></Pressable>
                </View>
              </View>
            ))})()}
            {/* Pagination & selection actions */}
            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable onPress={()=> setAdminPage(p=> Math.max(0, p-1))} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>◀︎</Text></Pressable>
                <Text>Sayfa {adminPage+1}</Text>
                <Pressable onPress={()=> setAdminPage(p=> p+1)} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>▶︎</Text></Pressable>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text>Seçili: {adminSel.length}</Text>
                <Pressable onPress={()=> setAdminSel([])} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>Temizle</Text></Pressable>
                <Pressable onPress={()=> setArtists(arr => arr.map(a => adminSel.length? (adminSel.includes(a.id)? {...a, active:true}:a) : ({...a, active:true})))} style={{ backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>Aktif</Text></Pressable>
                <Pressable onPress={()=> setArtists(arr => arr.map(a => adminSel.length? (adminSel.includes(a.id)? {...a, active:false}:a) : ({...a, active:false})))} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>Pasif</Text></Pressable>
                <Pressable onPress={()=> setArtists(arr => arr.map(a => adminSel.length? (adminSel.includes(a.id)? {...a, verified:true}:a) : ({...a, verified:true})))} style={{ backgroundColor: '#ecfeff', borderColor: '#a5f3fc', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>Doğrula</Text></Pressable>
                <Pressable onPress={()=> setArtists(arr => arr.map(a => adminSel.length? (adminSel.includes(a.id)? {...a, verified:false}:a) : ({...a, verified:false})))} style={{ backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><Text>Kaldır</Text></Pressable>
              </View>
            </View>
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
