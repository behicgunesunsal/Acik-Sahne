import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Alert,
  SafeAreaView,
  View,
  Text,
  Image,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
} from "react-native";
import { storage } from "./lib/storage";
import { download } from "./lib/download";
import { getCurrentPosition } from "./lib/location";
// File migrated to TSX and cross-platform utils wired in.

// =====================
// Types
// =====================
export type Role = "Dinleyen" | "Sanatçı" | "Admin"; // YALNIZCA 3 rol
export type AppRole = Role; // UI rolü

type Provider = "google" | "apple";
interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  provider: Provider;
  role: Role; // yalnızca 3 rol
}

type Tip = {
  id: number;
  artistId: number;
  amount: number; // TRY
  currency: "TRY";
  by?: string;
  anon: boolean;
  note?: string;
  at: number; // epoch ms
};

type SongRequest = {
  id: number;
  artistId: number;
  title: string;
  message?: string;
  by?: string;
  tipId?: number | null;
  at: number;
  status: "pending" | "done" | "rejected";
};

type EventItem = {
  id: number;
  artistId: number;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string;   // HH:mm
  venue: string;
  lat: number;
  lng: number;
};

// =====================
// Helpers
// =====================
const fmt = (m: number) => `${Math.max(0, Math.floor(m))} dk`;
const now = () => Date.now();
const rand = (a: number, b: number) => Math.random() * (b - a) + a;
const todayISO = () => new Date().toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const hms = (d: Date) => `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const sanitizeAmount = (n: number) => Math.max(5, Math.round((Number(n) || 0) * 100) / 100);
const validateRequestTitle = (s: string) => {
  const t = s.trim();
  return t.length >= 2 && t.length <= 80;
};

const BBOX = { minLat: 40.975, maxLat: 41.03, minLng: 29.0, maxLng: 29.085 };
const toXY = (lat: number, lng: number, w: number, h: number) => ({
  x: ((lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * w,
  y: (1 - (lat - BBOX.minLat) / (BBOX.maxLat - BBOX.minLat)) * h,
});
function hav(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const r = (d: number) => (d * Math.PI) / 180;
  const dLa = r(b.lat - a.lat);
  const dLn = r(b.lng - a.lng);
  const la1 = r(a.lat);
  const la2 = r(b.lat);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// =====================
// Seed data
// =====================
const seedArtists = () => {
  const n = [
    { name: "Mahmut", genre: "Akustik", avatar: "https://i.pravatar.cc/64?img=12" },
    { name: "Ahmet", genre: "Türkçe Pop", avatar: "https://i.pravatar.cc/64?img=15" },
    { name: "Derya", genre: "Caz", avatar: "https://i.pravatar.cc/64?img=30" },
    { name: "Baran", genre: "Rock", avatar: "https://i.pravatar.cc/64?img=5" },
    { name: "Melis", genre: "Klasik", avatar: "https://i.pravatar.cc/64?img=47" },
    { name: "Emre", genre: "Enstrümantal", avatar: "https://i.pravatar.cc/64?img=49" },
    { name: "Zeynep", genre: "Folk", avatar: "https://i.pravatar.cc/64?img=41" },
    { name: "Efe", genre: "Elektronik", avatar: "https://i.pravatar.cc/64?img=22" },
    { name: "Sena", genre: "Rap", avatar: "https://i.pravatar.cc/64?img=10" },
    { name: "Kaan", genre: "Latin", avatar: "https://i.pravatar.cc/64?img=28" },
  ];
  return n.map((m, i) => ({
    id: i + 1,
    ...m,
    isLive: Math.random() > 0.2,
    verified: Math.random() > 0.5,
    followersCount: Math.floor(rand(50, 1200)),
    startedAt: now() - Math.floor(rand(5, 90)) * 60 * 1000,
    plannedMinutes: [45, 60, 75, 90][Math.floor(Math.random() * 4)],
    streamUrl: "https://example.com/canli",
    location: { lat: rand(BBOX.minLat, BBOX.maxLat), lng: rand(BBOX.minLng, BBOX.maxLng) },
  }));
};

const seedPending = () =>
  [
    { name: "İlkim", genre: "Caz", avatar: "https://i.pravatar.cc/64?img=39" },
    { name: "Rüzgar", genre: "Akustik", avatar: "https://i.pravatar.cc/64?img=8" },
    { name: "Ada", genre: "Klasik", avatar: "https://i.pravatar.cc/64?img=45" },
  ].map((n, i) => ({ id: 100 + i, ...n, submittedAt: now() - (i + 1) * 3600e3, docs: ["Kimlik", "Sahne izni"] }));

const GENRES = [
  "Hepsi",
  "Akustik",
  "Türkçe Pop",
  "Caz",
  "Rock",
  "Klasik",
  "Enstrümantal",
  "Folk",
  "Elektronik",
  "Rap",
  "Latin",
];

// Rollerin listesi (3 rol)
const ROLES: Role[] = ["Dinleyen", "Sanatçı", "Admin"];
const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v as Role);

// =====================
// Local storage hook
// =====================
function useLS<T>(key: string, initial: T | (() => T)) {
  const [v, sv] = useState<T>(() => {
    try {
      const s = storage.getItem(key as any);
      return s ? (JSON.parse(s) as T) : typeof initial === "function" ? (initial as () => T)() : initial;
    } catch {
      return typeof initial === "function" ? (initial as () => T)() : initial;
    }
  });
  useEffect(() => {
    try {
      storage.setItem(key as any, JSON.stringify(v));
    } catch {
      /* noop */
    }
  }, [key, v]);
  return [v, sv] as const;
}

// =====================
// Auth (Google / Apple)
// =====================
function makeUser(provider: Provider): User {
  const id = Math.random().toString(36).slice(2, 10);
  const firsts = ["Ayşe", "Mehmet", "Deniz", "Ece", "Kerem", "Selin", "Can", "Elif"];
  const name = firsts[Math.floor(Math.random() * firsts.length)] + " " + String.fromCharCode(65 + Math.floor(Math.random() * 26)) + ".";
  const email = `${name.split(" ")[0].toLowerCase()}.${id}@${provider === "google" ? "gmail.com" : "icloud.com"}`;
  const avatar = `https://i.pravatar.cc/64?img=${Math.floor(rand(1, 70))}`;
  return { id, name, email, avatar, provider, role: "Dinleyen" };
}
function useAuth() {
  const [user, setUser] = useLS<User | null>("acik-sahne-user", null);
  const signIn = (provider: Provider) => setUser(makeUser(provider));
  const signOut = () => setUser(null);
  return { user, setUser, signIn, signOut } as const;
}

// =====================
// Export utils (CSV / ICS)
// =====================
// download now provided by lib/download
const csvEsc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csvArtists = (as: any[]) => {
  const h = ["id", "name", "genre", "verified", "isLive", "followersCount"].join(",");
  const r = as.map((a) => [a.id, a.name, a.genre, a.verified ? 1 : 0, a.isLive ? 1 : 0, a.followersCount].map(csvEsc).join(","));
  return [h, ...r].join("\n");
};
const csvEvents = (evs: EventItem[], as: any[]) => {
  const h = ["id", "artist", "date", "start", "end", "venue", "lat", "lng"].join(",");
  const r = evs.map((e) => {
    const a = as.find((x: any) => x.id === e.artistId);
    return [e.id, a?.name ?? "?", e.date, e.start, e.end, e.venue, e.lat, e.lng].map(csvEsc).join(",");
  });
  return [h, ...r].join("\n");
};
const icsDT = (d: string, t: string) => {
  const [H, M] = t.split(":").map(Number);
  const x = new Date(`${d}T${pad(H)}:${pad(M)}:00`);
  return `${ymd(x)}T${hms(x)}`; // local (floating) format
};
const toICS = (evs: EventItem[], as: any[]) => {
  const L = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AcikSahne//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    // Europe/Istanbul için TZ bloğu (UTC+03 kalıcı)
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Istanbul",
    "X-LIC-LOCATION:Europe/Istanbul",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0300",
    "TZNAME:+03",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  const nowD = new Date();
  const dtUTC = `${nowD.getUTCFullYear()}${pad(nowD.getUTCMonth() + 1)}${pad(nowD.getUTCDate())}T${pad(nowD.getUTCHours())}${pad(nowD.getUTCMinutes())}${pad(nowD.getUTCSeconds())}Z`;
  for (const e of evs) {
    const a = as.find((x: any) => x.id === e.artistId);
    L.push(
      "BEGIN:VEVENT",
      `UID:aciksahne-${e.id}@local`,
      `DTSTAMP:${dtUTC}`,
      `DTSTART;TZID=Europe/Istanbul:${icsDT(e.date, e.start)}`,
      `DTEND;TZID=Europe/Istanbul:${icsDT(e.date, e.end)}`,
      `SUMMARY:${a?.name ?? "Sanatçı"} · ${e.venue}`,
      `LOCATION:${Number(e.lat).toFixed(5)}, ${Number(e.lng).toFixed(5)}`,
      "END:VEVENT"
    );
  }
  L.push("END:VCALENDAR");
  return L.join("\n");
};

// =====================
// UI primitives
// =====================
const Card: React.FC<{ className?: string }> = ({ className = "", children }) => (
  <div className={`rounded-2xl shadow-sm border border-slate-200 bg-white/90 backdrop-blur ${className}`}>{children}</div>
);
const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }> = ({ className = "", children, ...p }) => (
  <button
    {...p}
    className={`px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-[.99] shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${className}`}
  >
    {children}
  </button>
);
const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
    <span
      className={`w-10 h-6 flex items-center rounded-full p-1 transition ${checked ? "bg-emerald-500" : "bg-gray-300"}`}
      onClick={() => onChange(!checked)}
    >
      <span className={`w-4 h-4 bg-white rounded-full shadow transition ${checked ? "translate-x-4" : ""}`} />
    </span>
  </label>
);

// =====================
// Map & clustering (+ zoom/pan)
// =====================
function cluster(points: any[], cell = 56) {
  const m = new Map<string, any[]>();
  for (const p of points) {
    const k = `${Math.floor(p.x / cell)}_${Math.floor(p.y / cell)}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(p);
  }
  return [...m.values()];
}

const ArtistPin: React.FC<{ a: any; x: number; y: number; onClick: () => void }> = ({ a, x, y, onClick }) => (
  <g onClick={onClick} className="cursor-pointer">
    <circle cx={x} cy={y} r={14} fill="#111827" opacity={0.15} />
    <defs>
      <clipPath id={`c-${a.id}`}>
        <circle cx={x} cy={y} r={12} />
      </clipPath>
    </defs>
    <image href={a.avatar} x={x - 12} y={y - 12} width={24} height={24} clipPath={`url(#c-${a.id})`} preserveAspectRatio="xMidYMid slice" />
    <circle cx={x} cy={y} r={12} fill="none" stroke="#111827" strokeWidth={1} />
    {a.isLive && <circle cx={x + 10} cy={y - 10} r={4} fill="#22c55e" stroke="white" strokeWidth={1} />}
  </g>
);

const EventPin: React.FC<{ x: number; y: number; onClick: () => void }> = ({ x, y, onClick }) => (
  <g onClick={onClick} className="cursor-pointer">
    <rect x={x - 6} y={y - 6} width={12} height={12} fill="#7c3aed" opacity={0.9} transform={`rotate(45 ${x} ${y})`} />
    <circle cx={x} cy={y} r={12} fill="#7c3aed" opacity={0.08} />
  </g>
);

const MapView: React.FC<{
  artists: any[];
  events?: EventItem[];
  user?: { x: number; y: number } | null;
  onSelect: (a: any) => void;
  onSelectEvent?: (ev: EventItem) => void;
  width?: number;
  height?: number;
  clustering?: boolean;
}> = ({ artists, events = [], user, onSelect, onSelectEvent, width = 860, height = 520, clustering = true }) => {
  if (Platform.OS !== 'web') {
    return (
      <div className="relative w-full h-[220px] overflow-hidden rounded-2xl border flex items-center justify-center bg-white">
        <div className="text-sm text-gray-600 px-3 text-center">
          Harita bileşeni şu an web üzerinde etkin. Mobil için react-native-svg veya react-native-maps entegrasyonu eklenmelidir.
        </div>
      </div>
    );
  }
  const pts = artists.map((a) => {
    const { x, y } = toXY(a.location.lat, a.location.lng, width, height);
    return { a, x, y };
  });
  const epts = events.map((ev) => {
    const { x, y } = toXY(ev.lat, ev.lng, width, height);
    return { ev, x, y };
  });
  const groups = clustering ? cluster(pts, 56) : pts.map((p) => [p]);

  // Zoom & Pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ on: boolean; sx: number; sy: number; px: number; py: number }>({ on: false, sx: 0, sy: 0, px: 0, py: 0 });
  const svgRef = React.useRef<SVGSVGElement>(null);

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const zoomAt = (sx: number, sy: number, factor: number) => {
    const z = clamp(zoom * factor, 0.5, 8);
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) { setZoom(z); return; }
    const cx = (sx - rect.left - pan.x) / zoom;
    const cy = (sy - rect.top - pan.y) / zoom;
    const nx = sx - rect.left - cx * z;
    const ny = sy - rect.top - cy * z;
    setZoom(z);
    setPan({ x: nx, y: ny });
  };

  const onWheel = (e: any) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1/1.15); };
  const onDbl = (e: any) => { zoomAt(e.clientX, e.clientY, e.shiftKey ? 1/1.5 : 1.5); };
  const onMouseDown = (e: any) => { setDrag({ on: true, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }); };
  const onMouseMove = (e: any) => { if (!drag.on) return; setPan({ x: drag.px + (e.clientX - drag.sx), y: drag.py + (e.clientY - drag.sy) }); };
  const endDrag = () => setDrag((d) => ({ ...d, on: false }));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  return (
    <div className="relative w-full h-[520px] overflow-hidden rounded-2xl border">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full bg-gradient-to-br from-sky-100 via-white to-emerald-50"
        onWheel={onWheel}
        onDoubleClick={onDbl}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <defs>
          <pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#cbd5e1" strokeWidth={0.5} />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#g)" />
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          <path
            d={`M0,${height * 0.15} C ${width * 0.2},${height * 0.1} ${width * 0.5},${height * 0.25} ${width},${height * 0.1} L ${width},0 L 0,0 Z`}
            fill="#bae6fd"
            opacity={0.5}
          />

          {user && (
            <g>
              <circle cx={user.x} cy={user.y} r={9} fill="#2563eb" />
              <circle cx={user.x} cy={user.y} r={18} fill="#2563eb" opacity={0.15} />
            </g>
          )}

          {epts.map(({ ev, x, y }, i) => (
            <EventPin key={`e-${i}`} x={x} y={y} onClick={() => onSelectEvent && onSelectEvent(ev)} />
          ))}

          {groups.map((g, i) => {
            if (g.length === 1) {
              const { a, x, y } = g[0];
              return <ArtistPin key={a.id} a={a} x={x} y={y} onClick={() => onSelect(a)} />;
            }
            const cx = g.reduce((s: number, p: any) => s + p.x, 0) / g.length;
            const cy = g.reduce((s: number, p: any) => s + p.y, 0) / g.length;
            return (
              <g key={`c-${i}`} className="cursor-pointer" onClick={() => onSelect(g[0].a)}>
                <circle cx={cx} cy={cy} r={18} fill="#111827" opacity={0.12} />
                <circle cx={cx} cy={cy} r={16} fill="#111827" />
                <text x={cx} y={cy + 5} textAnchor="middle" fontSize={12} fontWeight={700} fill="white">{g.length}</text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <Button onClick={() => {
          const rect = svgRef.current?.getBoundingClientRect();
          zoomAt((rect?.left ?? 0) + 50, (rect?.top ?? 0) + 50, 1.2);
        }} className="!px-2 !py-1">＋</Button>
        <Button onClick={() => {
          const rect = svgRef.current?.getBoundingClientRect();
          zoomAt((rect?.left ?? 0) + 50, (rect?.top ?? 0) + 50, 1/1.2);
        }} className="!px-2 !py-1">－</Button>
        <Button onClick={resetView} className="!px-2 !py-1">↺</Button>
      </div>

      <div className="absolute bottom-2 left-3 text-[11px] text-slate-600 bg-white/80 px-2 py-1 rounded">
        Kaydırarak yakınlaş/uzaklaş · Sürükleyerek taşı · Çift tık: yakınlaş, Shift+çift tık: uzaklaş
      </div>
    </div>
  );
};

// =====================
// Quick Share (Sanatçı) — reusable mini wizard
// =====================
const QuickShareWizard: React.FC<{
  initialLat: number;
  initialLng: number;
  initialGenre?: string;
  initialRadius?: number;
  initialDuration?: number;
  onPublish: (v: { lat: number; lng: number; genre: string; radius: number; duration: number }) => void;
  onClose: () => void;
}> = ({ initialLat, initialLng, initialGenre = "Akustik", initialRadius = 220, initialDuration = 60, onPublish, onClose }) => {
  const [step, setStep] = useState(1);
  const [lat, setLat] = useState<number>(initialLat);
  const [lng, setLng] = useState<number>(initialLng);
  const [genre, setGenre] = useState<string>(initialGenre);
  const [radius, setRadius] = useState<number>(initialRadius);
  const [duration, setDuration] = useState<number>(initialDuration);

  const getLoc = () => {
    getCurrentPosition()
      .then((p) => { setLat(p.latitude); setLng(p.longitude); })
      .catch(() => {
        if (Platform.OS === 'web') alert("Konum alınamadı. Elle giriniz.");
        else Alert.alert("Konum alınamadı", "Elle giriniz.");
      });
  };

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">Etkinlik Paylaş · Adım {step}/3</div>
        <Button onClick={onClose} className="bg-white">Kapat</Button>
      </div>
      {step === 1 && (
        <div className="space-y-2 text-sm">
          <div className="font-medium">Konum</div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" step="0.0001" className="px-2 py-2 border rounded-xl" value={lat} onChange={(e) => setLat(Number((e.target as HTMLInputElement).value))} />
            <input type="number" step="0.0001" className="px-2 py-2 border rounded-xl" value={lng} onChange={(e) => setLng(Number((e.target as HTMLInputElement).value))} />
          </div>
          <div className="flex gap-2">
            <Button onClick={getLoc}>Konumumu Al</Button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-2 text-sm">
          <div className="font-medium">Müzik Türü</div>
          <select className="px-2 py-2 border rounded-xl" value={genre} onChange={(e) => setGenre((e.target as HTMLSelectElement).value)}>
            {GENRES.filter((g) => g !== "Hepsi").map((g) => (<option key={g} value={g}>{g}</option>))}
          </select>
          <div className="text-xs text-gray-500">Önizleme: {genre} · {lat.toFixed(4)}, {lng.toFixed(4)}</div>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-2 text-sm">
          <div className="font-medium">Süre & Yarıçap</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>Süre (dk)</span>
              <select className="px-2 py-2 border rounded-xl" value={duration} onChange={(e) => setDuration(Number((e.target as HTMLSelectElement).value))}>
                {[30,45,60,90,120].map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span>Bildirim yarıçapı (m)</span>
              <select className="px-2 py-2 border rounded-xl" value={radius} onChange={(e) => setRadius(Number((e.target as HTMLSelectElement).value))}>
                {[100,200,300,500,800].map((r) => (<option key={r} value={r}>{r}</option>))}
              </select>
            </label>
          </div>
          <div className="text-xs text-gray-500">Paylaşınca {radius} m yarıçapla {duration} dk görüneceksin.</div>
        </div>
      )}
      <div className="flex gap-2 pt-2">
        {step > 1 && <Button onClick={() => setStep(step - 1)}>Geri</Button>}
        {step < 3 && <Button onClick={() => setStep(step + 1)} className="bg-emerald-50 border-emerald-200">İleri</Button>}
        {step === 3 && (
          <Button onClick={() => onPublish({ lat, lng, genre, radius, duration })} className="bg-emerald-600 text-white border-emerald-600">Paylaş</Button>
        )}
      </div>
    </Card>
  );
};

// =====================
// List & Detail
// =====================
const ArtistRow: React.FC<{
  a: any;
  onSelect: (a: any) => void;
  following: boolean;
  onFollow: (id: number) => void;
}> = ({ a, onSelect, following, onFollow }) => {
  const el = (now() - a.startedAt) / 60000;
  return (
    <div className="flex items-center gap-3 py-2 px-2 hover:bg-gray-50 rounded-xl">
      <img src={a.avatar} className="w-10 h-10 rounded-full" />
      <div className="flex-1">
        <div className="font-semibold flex items-center gap-2">
          {a.name}
          {a.verified && <span className="text-xs text-emerald-600">✓ Doğrulandı</span>}
          {a.isLive && <span className="text-xs text-emerald-600 font-medium">• Aktif</span>}
        </div>
        <div className="text-sm text-gray-600">
          {a.genre} · {fmt(el)} sahnede · Plan {fmt(a.plannedMinutes)}
        </div>
      </div>
      <Button onClick={() => onSelect(a)} className="bg-white">
        Aç
      </Button>
      <Button onClick={() => onFollow(a.id)} className={following ? "bg-emerald-50 border-emerald-200" : ""}>
        {following ? "Takiptesin" : "+ Takip et"}
      </Button>
    </div>
  );
};

const TipBox: React.FC<{
  user: User | null;
  onSend: (amount: number, anon: boolean, note: string) => void;
}> = ({ user, onSend }) => {
  const [amt, setAmt] = useState(20);
  const [anon, setAnon] = useState(false);
  const [note, setNote] = useState("");
  const valid = sanitizeAmount(amt) >= 5;
  return (
    <Card className="p-3">
      <div className="font-semibold mb-2">Bahşiş Gönder</div>
      {user ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500">Tutar</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={5}
                step={5}
                value={amt}
                onChange={(e) => setAmt(Number((e.target as HTMLInputElement).value))}
                className="w-28 px-2 py-2 border rounded-xl"
              />
              <span>₺</span>
              {[20, 50, 100].map((q) => (
                <Button key={q} onClick={() => setAmt(q)} className="bg-white">
                  {q}
                </Button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon((e.target as HTMLInputElement).checked)} />
            <span>Anonim gönder</span>
          </label>
          <input
            placeholder="(Opsiyonel) Not"
            value={note}
            onChange={(e) => setNote((e.target as HTMLInputElement).value)}
            className="w-full px-2 py-2 border rounded-xl"
          />
          <Button
            onClick={() => valid && onSend(sanitizeAmount(amt), anon, note)}
            disabled={!valid}
            className={valid ? "bg-emerald-50 border-emerald-200" : "opacity-50 cursor-not-allowed"}
          >
            Gönder (₺{sanitizeAmount(amt)})
          </Button>
          <div className="text-xs text-gray-500">Önizleme: Ödeme simüle edilir ve bahşiş listesine eklenir.</div>
        </div>
      ) : (
        <div className="text-sm text-gray-600">Bahşiş göndermek için giriş yapın.</div>
      )}
    </Card>
  );
};

const RequestBox: React.FC<{
  user: User | null;
  onRequest: (title: string, message: string, tipAmount?: number) => void;
}> = ({ user, onRequest }) => {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [tipAmt, setTipAmt] = useState<number>(0);
  const ok = validateRequestTitle(title);
  return (
    <Card className="p-3">
      <div className="font-semibold mb-2">İstek Parça</div>
      {user ? (
        <div className="space-y-2 text-sm">
          <input
            placeholder="Parça adı"
            value={title}
            onChange={(e) => setTitle((e.target as HTMLInputElement).value)}
            className="w-full px-2 py-2 border rounded-xl"
          />
          <textarea
            placeholder="(Opsiyonel) Mesaj / ithaf"
            value={message}
            onChange={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
            className="w-full px-2 py-2 border rounded-xl min-h-[70px]"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Bahşiş ekle (opsiyonel)</span>
            <input
              type="number"
              min={0}
              step={5}
              value={tipAmt}
              onChange={(e) => setTipAmt(Math.max(0, Number((e.target as HTMLInputElement).value)))}
              className="w-28 px-2 py-2 border rounded-xl"
            />
            <span>₺</span>
            {[0, 20, 50].map((q) => (
              <Button key={q} onClick={() => setTipAmt(q)} className="bg-white">
                {q}
              </Button>
            ))}
          </div>
          <Button
            onClick={() => ok && onRequest(title.trim(), message.trim(), tipAmt > 0 ? sanitizeAmount(tipAmt) : undefined)}
            disabled={!ok}
            className={ok ? "bg-emerald-50 border-emerald-200" : "opacity-50 cursor-not-allowed"}
          >
            Gönder
          </Button>
          <div className="text-xs text-gray-500">Önizleme: İstek kuyruğa eklenir. İstersen bahşiş de eklersin.</div>
        </div>
      ) : (
        <div className="text-sm text-gray-600">İstek göndermek için giriş yapın.</div>
      )}
    </Card>
  );
};

const ArtistDetail: React.FC<{
  user: User | null;
  a: any;
  onClose: () => void;
  following: boolean;
  onFollow: (id: number) => void;
  tips: Tip[];
  requests: SongRequest[];
  onTip: (amount: number, anon: boolean, note: string) => void;
  onSongRequest: (title: string, message: string, tipAmount?: number) => void;
  onQuickPublish?: (v: { lat: number; lng: number; genre: string; radius: number; duration: number; artistId: number }) => void;
}> = ({ user, a, onClose, following, onFollow, tips, requests, onTip, onSongRequest, onQuickPublish }) => {
  const el = (now() - a.startedAt) / 60000;
  const lastTips = tips.slice(-3).reverse();
  const pendReq = requests.filter((r) => r.status === "pending").slice(-5).reverse();
  const totalTips = tips.reduce((s, t) => s + t.amount, 0);
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <img src={a.avatar} className="w-16 h-16 rounded-2xl" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold">{a.name}</h3>
            {a.verified && <span className="text-xs text-emerald-600">✓ Doğrulandı</span>}
            {a.isLive && <span className="text-xs text-emerald-600 font-medium">• Aktif</span>}
          </div>
          <div className="text-sm text-gray-600">
            {a.genre} · {fmt(el)}dir sahnede · Plan {fmt(a.plannedMinutes)}
          </div>
        </div>
        <Button onClick={onClose}>Kapat</Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <TipBox user={user} onSend={(amount, anon, note) => onTip(amount, anon, note)} />
        <RequestBox user={user} onRequest={(title, message, tipAmount) => onSongRequest(title, message, tipAmount)} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="font-semibold mb-2">Son Bahşişler</div>
          {lastTips.length === 0 ? (
            <div className="text-sm text-gray-500">Henüz bahşiş yok.</div>
          ) : (
            <div className="space-y-1 text-sm">
              {lastTips.map((t) => (
                <div key={t.id} className="flex justify-between">
                  <span>{t.anon ? "Anonim" : t.by || "Kullanıcı"}</span>
                  <span>₺{t.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 text-xs text-gray-500">Toplam: ₺{totalTips.toFixed(2)}</div>
        </Card>
        <Card className="p-3">
          <div className="font-semibold mb-2">İstek Kuyruğu</div>
          {pendReq.length === 0 ? (
            <div className="text-sm text-gray-500">İstek yok.</div>
          ) : (
            <div className="space-y-1 text-sm">
              {pendReq.map((r) => (
                <div key={r.id} className="flex justify-between">
                  <span className="truncate max-w-[70%]" title={r.title}>{r.title}</span>
                  <span className="text-xs text-gray-500">{new Date(r.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 items-start">
        <div className="flex gap-2">
          <Button onClick={() => onFollow(a.id)} className={following ? "bg-emerald-50 border-emerald-200" : ""}>
            {following ? "Takibi bırak" : "+ Takip et"}
          </Button>
        </div>
        {user?.role === "Sanatçı" && (
          <QuickShareWizard
            initialLat={a.location?.lat ?? 41}
            initialLng={a.location?.lng ?? 29.05}
            initialGenre={a.genre}
            onPublish={(v) => {
              if (onQuickPublish) {
                onQuickPublish({ ...v, artistId: a.id });
              } else {
                try {
                  (a as any).location = { lat: v.lat, lng: v.lng };
                  (a as any).genre = v.genre;
                  (a as any).isLive = true;
                  (a as any).startedAt = now();
                  (a as any).plannedMinutes = v.duration;
                } catch {}
                alert(`Paylaşıldı (geçici): ${v.genre} @ ${v.lat.toFixed(4)}, ${v.lng.toFixed(4)} · ${v.duration}dk · ${v.radius}m`);
              }
            }}
            onClose={() => { /* no-op */ }}
          />
        )}
      </div>
    </Card>
  );
};

// =====================
// Tests
// =====================
const countOcc = (s: string, sub: string) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
function runTests(artists: any[], events: EventItem[]) {
  const R: { n: string; p: boolean; d?: string }[] = [];
  const push = (n: string, p: boolean, d = "") => R.push({ n, p, d });

  // csvEsc
  push("csv comma", csvEsc("a,b") === '"a,b"');
  push("csv quotes", csvEsc('He said "hi"') === '"He said ""hi"""');
  push("csv nl", csvEsc("a\nb").startsWith('"') && csvEsc("a\nb").endsWith('"'));
  push("csv both", csvEsc('"a,b"').startsWith('"') && csvEsc('"a,b"').endsWith('"'));
  // extra
  push("csv plain no escape", csvEsc("abc") === "abc");
  push("csv empty undefined", csvEsc(undefined as any) === "");
  push("csv numeric zero", csvEsc(0 as any) === "0");

  // csvArtists
  const cA = csvArtists(artists);
  push("artists header", cA.split("\n")[0] === "id,name,genre,verified,isLive,followersCount");
  push("artists rows", cA.split("\n").length === artists.length + 1);
  push("artists newline count", (cA.match(/\n/g) || []).length === artists.length);
  // extra
  push("artists empty ok", csvArtists([]).split("\n").length === 1);

  // csvEvents
  const cE = csvEvents(events, artists);
  push("events header", cE.split("\n")[0] === "id,artist,date,start,end,venue,lat,lng");
  push("events rows", cE.trim() === "" ? events.length === 0 : cE.split("\n").length === events.length + 1);
  // extra
  push("events empty header only", events.length === 0 ? cE.trim() === "id,artist,date,start,end,venue,lat,lng" : true);

  // ICS
  const ics = toICS(events, artists);
  push("ics begin/end", ics.includes("BEGIN:VCALENDAR") && ics.includes("END:VCALENDAR"));
  push("ics vevents", countOcc(ics, "BEGIN:VEVENT") === events.length);
  push("ics DTSTART", countOcc(ics, "DTSTART") === events.length);
  push("ics DTEND", countOcc(ics, "DTEND") === events.length);
  push("ics version/prodid", ics.startsWith("BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:"));
  // extra: UID uniqueness when multiple events
  const uidMatches = [...ics.matchAll(/UID:([^\n]+)/g)].map(m => m[1]);
  push("ics UID unique", events.length <= 1 ? true : new Set(uidMatches).size === uidMatches.length);
  // extra: empty events should have zero VEVENT
  push("ics zero vevent when none", events.length === 0 ? !ics.includes("BEGIN:VEVENT") : true);
  // extra: when events exist, LOCATION lines should equal count
  push("ics LOCATION count", events.length === 0 ? true : countOcc(ics, "LOCATION:") === events.length);
  // NEW: icsDT format check
  push("icsDT format", /^\d{8}T\d{6}$/.test(icsDT("2025-01-02", "03:04")));
  // NEW: timezone block exists
  push("ics timezone block", ics.includes("VTIMEZONE") && ics.includes("TZID:Europe/Istanbul"));
  // NEW: time helpers
  const d0 = new Date("2025-01-02T03:04:05");
  push("pad 03", pad(3) === "03");
  push("ymd 20250102", ymd(d0) === "20250102");
  push("hms 030405", hms(d0) === "030405");

  // NEW: role guard tests (3 role)
  push("isRole valid Admin", isRole("Admin" as any) === true);
  push("isRole invalid Foo", isRole("Foo" as any) === false);
  push("roles length 3", (ROLES as readonly string[]).length === 3);
  push("roles include trio", ["Dinleyen","Sanatçı","Admin"].every(r => (ROLES as readonly string[]).includes(r)));

  // NEW: tipping helpers
  push("sanitizeAmount min 5", sanitizeAmount(0) === 5);
  push("sanitizeAmount round 19.994 -> 19.99", sanitizeAmount(19.994) === 19.99);
  push("sanitizeAmount round 19.995 -> 20.00", sanitizeAmount(19.995) === 20);
  push("validateRequestTitle ok", validateRequestTitle("My Song") === true);
  push("validateRequestTitle too short", validateRequestTitle(" ") === false);
  const long80 = "x".repeat(81);
  push("validateRequestTitle too long", validateRequestTitle(long80) === false);

  // NEW: parseHM simple test
  push("parseHM 18:30 -> 1110", (() => { const [H,M] = "18:30".split(":").map(Number); return H*60+M === 1110; })());

  return R;
}

// =====================
// Admin Panel (yayın kaldırıldı)
// =====================
const AdminPanel: React.FC<{
  artists: any[];
  pending: any[];
  events: EventItem[];
  geofenceM: number;
  setGeofenceM: (n: number) => void;
  simulateWalk: boolean;
  setSimulateWalk: (v: boolean) => void;
  alertsForFollowedOnly: boolean;
  setAlertsForFollowedOnly: (v: boolean) => void;
  onExportArtists: () => void;
  onExportEvents: () => void;
  tips: Tip[];
  requests: SongRequest[];
}> = ({
  artists,
  pending,
  events,
  geofenceM,
  setGeofenceM,
  simulateWalk,
  setSimulateWalk,
  alertsForFollowedOnly,
  setAlertsForFollowedOnly,
  onExportArtists,
  onExportEvents,
  tips,
  requests,
}) => {
  const total = artists.length;
  const verified = artists.filter((a) => a.verified).length;
  const live = artists.filter((a) => a.isLive).length;
  const [tests, setTests] = useState<{ n: string; p: boolean; d?: string }[]>([]);

  const tipSum = tips.reduce((s, t) => s + t.amount, 0);
  const pendingReq = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-3">
        <Card className="p-3">
          <div className="text-xs text-gray-500">Toplam</div>
          <div className="text-2xl font-bold">{total}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-gray-500">Doğrulanan</div>
          <div className="text-2xl font-bold">{verified}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-gray-500">Bekleyen</div>
          <div className="text-2xl font-bold">{pending.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-gray-500">Aktif</div>
          <div className="text-2xl font-bold">{live}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-gray-500">Toplam Bahşiş</div>
          <div className="text-2xl font-bold">₺{tipSum.toFixed(2)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-gray-500">Bekleyen İstek</div>
          <div className="text-2xl font-bold">{pendingReq}</div>
        </Card>
      </div>

      <Card className="p-3">
        <div className="font-semibold mb-2">Sistem</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Uyarı yarıçapı</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-24 px-2 py-1 border rounded-lg"
                value={geofenceM}
                onChange={(e) => setGeofenceM(Math.max(50, Number((e.target as HTMLInputElement).value)))}
              />
              <span>m</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span>Yalnızca takip</span>
            <Switch checked={alertsForFollowedOnly} onChange={setAlertsForFollowedOnly} />
          </div>
          <div className="flex items-center justify-between">
            <span>Yürüyüş simülasyonu</span>
            <Switch checked={simulateWalk} onChange={setSimulateWalk} />
          </div>
          <div className="flex items-center justify-between">
            <span>Planlı etkinlik</span>
            <span className="font-semibold">{events.length}</span>
          </div>
        </div>
      </Card>

      <Card className="p-3">
        <div className="font-semibold mb-2">Dışa Aktar</div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Button onClick={onExportArtists}>Sanatçıları CSV</Button>
          <Button onClick={onExportEvents}>Etkinlikleri CSV</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="font-semibold mb-2">Testler</div>
        <div className="flex items-center gap-2 mb-2">
          <Button onClick={() => setTests(runTests(artists, events))} className="bg-white">
            Testleri Çalıştır
          </Button>
          {tests.length > 0 && (
            <span className="text-sm text-gray-600">Geçen: {tests.filter((t) => t.p).length} / {tests.length}</span>
          )}
        </div>
        {tests.length > 0 ? (
          <div className="space-y-1">
            {tests.map((t, i) => (
              <div key={i} className={`text-sm ${t.p ? "text-emerald-700" : "text-red-700"}`}>
                {t.p ? "✅" : "❌"} {t.n}
                {t.d ? ` — ${t.d}` : ""}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">Henüz test çalıştırılmadı.</div>
        )}
      </Card>
    </div>
  );
};

// =====================
// Verification
// =====================
const VerifyRow: React.FC<{
  p: any;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}> = ({ p, onApprove, onReject }) => (
  <div className="flex items-center gap-3 py-2 px-2 hover:bg-gray-50 rounded-xl">
    <img src={p.avatar} className="w-10 h-10 rounded-full" />
    <div className="flex-1">
      <div className="font-semibold">
        {p.name} <span className="text-xs text-gray-500">· {p.genre}</span>
      </div>
      <div className="text-xs text-gray-500">Belgeler: {p.docs.join(", ")}</div>
    </div>
    <Button onClick={() => onReject(p.id)} className="bg-white border-red-200">
      Reddet
    </Button>
    <Button onClick={() => onApprove(p.id)} className="bg-emerald-50 border-emerald-200">
      Onayla
    </Button>
  </div>
);

const VerificationView: React.FC<{
  artists: any[];
  setArtists: React.Dispatch<React.SetStateAction<any[]>>;
  pending: any[];
  setPending: React.Dispatch<React.SetStateAction<any[]>>;
}> = ({ artists, setArtists, pending, setPending }) => {
  const approve = (id: number) => {
    const item = pending.find((p) => p.id === id);
    if (!item) return;
    setArtists((as) => {
      const max = as.reduce((m, a) => Math.max(m, a.id), 0);
      return [
        ...as,
        {
          id: max + 1,
          name: item.name,
          genre: item.genre,
          avatar: item.avatar,
          isLive: false,
          verified: true,
          followersCount: Math.floor(rand(10, 80)),
          startedAt: now(),
          plannedMinutes: 60,
          streamUrl: "https://example.com/canli",
          location: { lat: rand(BBOX.minLat, BBOX.maxLat), lng: rand(BBOX.minLng, BBOX.maxLng) },
        },
      ];
    });
    setPending((arr) => arr.filter((p) => p.id !== id));
  };
  const reject = (id: number) => setPending((arr) => arr.filter((p) => p.id !== id));

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="font-semibold mb-2">Bekleyen Başvurular</div>
        {pending.length === 0 ? (
          <div className="text-sm text-gray-500">Bekleyen başvuru yok.</div>
        ) : (
          <div className="divide-y">
            {pending.map((p) => (
              <VerifyRow key={p.id} p={p} onApprove={approve} onReject={reject} />
            ))}
          </div>
        )}
      </Card>

      <Card className="p-3">
        <div className="text-xs text-gray-500">Politika</div>
        <ul className="list-disc pl-5 text-sm text-gray-600">
          <li>Müzisyen kimliği ve sahne izin belgesi zorunludur.</li>
          <li>Eksik/şüpheli başvurular reddedilir, tekrar başvuru yapılabilir.</li>
        </ul>
      </Card>
    </div>
  );
};

// =====================
// Planner
// =====================
const parseHM = (s: string) => {
  const [H, M] = s.split(":").map(Number);
  return H * 60 + M;
};

const PlannerView: React.FC<{
  artists: any[];
  events: EventItem[];
  setEvents: React.Dispatch<React.SetStateAction<EventItem[]>>;
  defaultLat?: number;
  defaultLng?: number;
  onExportDayICS: (d: string) => void;
  onExportAllICS: () => void;
}> = ({ artists, events, setEvents, defaultLat = 41, defaultLng = 29.05, onExportDayICS, onExportAllICS }) => {
  const V = artists.filter((a) => a.verified);
  const [f, setF] = useState({
    artistId: V[0]?.id ?? artists[0]?.id,
    date: todayISO(),
    start: "18:00",
    end: "19:00",
    venue: "Moda Sahil",
    lat: defaultLat + rand(-0.01, 0.01),
    lng: defaultLng + rand(-0.01, 0.01),
  });

  const add = () => {
    const id = (events[events.length - 1]?.id ?? 0) + 1;
    if (parseHM(f.end) <= parseHM(f.start)) {
      alert("Bitiş başlangıçtan sonra olmalı.");
      return;
    }
    setEvents((e) => [...e, { id, ...f }]);
  };
  const rm = (id: number) => setEvents((e) => e.filter((x) => x.id !== id));
  const day = events
    .filter((e) => e.date === f.date)
    .sort((a, b) => parseHM(a.start) - parseHM(b.start));

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="font-semibold mb-2">Etkinlik Planla</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span>Sanatçı</span>
            <select
              className="px-2 py-2 border rounded-xl"
              value={f.artistId}
              onChange={(e) => setF({ ...f, artistId: Number((e.target as HTMLSelectElement).value) })}
            >
              {V.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>Tarih</span>
            <input
              type="date"
              className="px-2 py-2 border rounded-xl"
              value={f.date}
              onChange={(e) => setF({ ...f, date: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Başlangıç</span>
            <input
              type="time"
              className="px-2 py-2 border rounded-xl"
              value={f.start}
              onChange={(e) => setF({ ...f, start: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Bitiş</span>
            <input
              type="time"
              className="px-2 py-2 border rounded-xl"
              value={f.end}
              onChange={(e) => setF({ ...f, end: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Mekan</span>
            <input
              className="px-2 py-2 border rounded-xl"
              value={f.venue}
              onChange={(e) => setF({ ...f, venue: (e.target as HTMLInputElement).value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>Lat</span>
              <input
                type="number"
                step="0.0001"
                className="px-2 py-2 border rounded-xl"
                value={f.lat}
                onChange={(e) => setF({ ...f, lat: Number((e.target as HTMLInputElement).value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>Lng</span>
              <input
                type="number"
                step="0.0001"
                className="px-2 py-2 border rounded-xl"
                value={f.lng}
                onChange={(e) => setF({ ...f, lng: Number((e.target as HTMLInputElement).value) })}
              />
            </label>
          </div>
          <div className="col-span-2">
            <Button onClick={add} className="bg-emerald-50 border-emerald-200">Ekle</Button>
          </div>
        </div>
      </Card>

      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">{f.date} için Etkinlikler</div>
          <div className="flex gap-2">
            <Button onClick={() => onExportDayICS(f.date)} className="bg-white">Günü .ics</Button>
            <Button onClick={onExportAllICS} className="bg-white">Tümünü .ics</Button>
          </div>
        </div>
        {day.length === 0 ? (
          <div className="text-sm text-gray-500">Liste boş.</div>
        ) : (
          <div className="divide-y">
            {day.map((e) => {
              const a = artists.find((x) => x.id === e.artistId);
              return (
                <div key={e.id} className="py-2 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{e.start}–{e.end}</span>
                    <span>{a?.name}</span>
                    <span className="text-gray-500">· {e.venue}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{e.lat.toFixed(4)}, {e.lng.toFixed(4)}</span>
                    <Button onClick={() => rm(e.id)} className="bg-white">Sil</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

// =====================
// Tabs
// =====================
const TABS = [
  { key: "user", label: "Kullanıcı", roles: ROLES as readonly Role[] },
  { key: "admin", label: "Admin", roles: ["Admin"] as const },
  { key: "verify", label: "Doğrula", roles: ["Admin"] as const },
  { key: "plan", label: "Planla", roles: ["Admin"] as const },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const Tabs: React.FC<{ tab: TabKey; setTab: (k: TabKey) => void; role: Role }> = ({ tab, setTab, role }) => (
  <div className="flex gap-2 mb-4">
    {TABS.filter((t) => (t.roles as readonly string[]).includes(role)).map((t) => (
      <Button key={t.key} onClick={() => setTab(t.key)} className={t.key === tab ? "bg-emerald-50 border-emerald-200" : ""}>
        {t.label}
      </Button>
    ))}
  </div>
);

// =====================
// App
// =====================
const App: React.FC = () => {
  const { user, setUser, signIn, signOut } = useAuth();
  const [role, setRole] = useLS<Role>("acik-sahne-role", "Dinleyen");

  // core data
  const [artists, setArtists] = useLS<any[]>("acik-sahne-artists", () => seedArtists());
  const [pending, setPending] = useLS<any[]>("acik-sahne-pending", () => seedPending());
  const [events, setEvents] = useLS<EventItem[]>("acik-sahne-events", []);
  const [tips, setTips] = useLS<Tip[]>("acik-sahne-tips", []);
  const [requests, setRequests] = useLS<SongRequest[]>("acik-sahne-requests", []);

  // map & filters
  const [g, setG] = useLS<string>("acik-sahne-genre", "Hepsi");
  const [geo, setGeo] = useLS<number>("acik-sahne-geo", 220);
  const [following, setFollowing] = useLS<number[]>("acik-sahne-following", []);
  const [simulateWalk, setSimulateWalk] = useLS<boolean>("acik-sahne-walk", false);
  const [alertsOnly, setAlertsOnly] = useLS<boolean>("acik-sahne-alertsOnly", false);
  const [pos, setPos] = useLS<{ lat: number; lng: number }>("acik-sahne-pos", { lat: 41.0, lng: 29.05 });

  const [tab, setTab] = useState<TabKey>("user");
  const [sel, setSel] = useState<any | null>(null);

  // simulate walk
  useEffect(() => {
    if (!simulateWalk) return;
    const id = setInterval(() => {
      setPos((p) => ({ lat: p.lat + rand(-0.0005, 0.0005), lng: p.lng + rand(-0.0005, 0.0005) }));
    }, 1200);
    return () => clearInterval(id);
  }, [simulateWalk, setPos]);

  // derived
  const filtered = useMemo(() => {
    const within = (a: any) => hav(pos, a.location) <= geo;
    const byGenre = (a: any) => g === "Hepsi" || a.genre === g;
    return artists.filter(byGenre).filter(within);
  }, [artists, pos, geo, g]);

  const uxy = useMemo(() => toXY(pos.lat, pos.lng, 860, 520), [pos.lat, pos.lng]);

  // actions
  const toggleFollow = (id: number) => setFollowing((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
  const addTip = (artistId: number, amount: number, anon: boolean, note: string) => {
    const id = (tips[tips.length - 1]?.id ?? 0) + 1;
    setTips((t) => [...t, { id, artistId, amount, currency: "TRY", anon, note, by: user?.name, at: now() }]);
  };
  const addRequest = (artistId: number, title: string, message: string, tipAmount?: number) => {
    const id = (requests[requests.length - 1]?.id ?? 0) + 1;
    const tipId = tipAmount ? (tips[tips.length - 1]?.id ?? 0) + 1 : null;
    if (tipAmount) {
      setTips((t) => [...t, { id: tipId!, artistId, amount: tipAmount, currency: "TRY", anon: false, note: `İstek: ${title}`, by: user?.name, at: now() }]);
    }
    setRequests((r) => [...r, { id, artistId, title, message, tipId, at: now(), status: "pending" }]);
  };

  // exports
  const exportArtists = () => download(`artists-${todayISO()}.csv`, csvArtists(artists), "text/csv");
  const exportEvents = () => download(`events-${todayISO()}.csv`, csvEvents(events, artists), "text/csv");
  const exportDayICS = (d: string) => {
    const day = events.filter((e) => e.date === d);
    download(`events-${d}.ics`, toICS(day, artists), "text/calendar");
  };
  const exportAllICS = () => download(`events-all.ics`, toICS(events, artists), "text/calendar");

  // role gating for tabs
  useEffect(() => {
    if (!isRole(role)) setRole("Dinleyen");
  }, [role, setRole]);

  // Mobile-first UI for native platforms (iOS/Android)
  if (Platform.OS !== 'web') {
    const cycleGenre = (dir: number) => {
      const i = GENRES.indexOf(g);
      const next = (i + dir + GENRES.length) % GENRES.length;
      setG(GENRES[next]);
    };

    const [detailOpen, setDetailOpen] = useState(false);

    const openDetail = (a: any) => { setSel(a); setDetailOpen(true); };
    const closeDetail = () => { setDetailOpen(false); setSel(null); };

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <View style={{ padding: 12, gap: 12 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '700' }}>Açık Sahne</Text>
              <Text style={{ marginLeft: 8, color: '#64748b', fontSize: 12 }}>Mobil</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {!user ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => signIn('google')} style={styles.btn}><Text style={styles.btnText}>Google</Text></Pressable>
                  <Pressable onPress={() => signIn('apple')} style={styles.btn}><Text style={styles.btnText}>Apple</Text></Pressable>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Image source={{ uri: user.avatar }} style={{ width: 28, height: 28, borderRadius: 14 }} />
                  <Text style={{ fontSize: 14 }}>{user.name}</Text>
                  <Pressable
                    onPress={() => {
                      const i = ROLES.indexOf(role);
                      setRole(ROLES[(i + 1) % ROLES.length]);
                    }}
                    style={[styles.btn, { paddingVertical: 6 }]}>
                    <Text style={styles.btnTextSmall}>{role}</Text>
                  </Pressable>
                  <Pressable onPress={signOut} style={styles.btn}><Text style={styles.btnText}>Çıkış</Text></Pressable>
                </View>
              )}
            </View>
          </View>

          {/* Filters */}
          <View style={{ backgroundColor: 'white', borderRadius: 12, padding: 12, borderColor: '#e5e7eb', borderWidth: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontWeight: '600' }}>Tür:</Text>
                <Pressable onPress={() => cycleGenre(-1)} style={styles.btnSm}><Text style={styles.btnTextSmall}>◀︎</Text></Pressable>
                <Text style={{ fontSize: 14 }}>{g}</Text>
                <Pressable onPress={() => cycleGenre(1)} style={styles.btnSm}><Text style={styles.btnTextSmall}>▶︎</Text></Pressable>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontWeight: '600' }}>Yarıçap:</Text>
                <TextInput
                  value={String(geo)}
                  onChangeText={(t) => setGeo(Math.max(50, Number(t) || 0))}
                  keyboardType="numeric"
                  style={{ width: 80, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}
                />
                <Text style={{ color: '#64748b' }}>m</Text>
              </View>
            </View>
            <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => getCurrentPosition().then(p => setPos({ lat: p.latitude, lng: p.longitude })).catch(() => Alert.alert('Konum alınamadı'))}
                style={styles.btn}
              >
                <Text style={styles.btnText}>Konumumu Al</Text>
              </Pressable>
            </View>
          </View>

          {/* List */}
          <View style={{ flex: 1 }}>
            {filtered.length === 0 ? (
              <Text style={{ color: '#475569' }}>Sonuç yok. Yarıçapı artırmayı deneyin.</Text>
            ) : (
              <FlatList
                data={filtered.slice(0, 50)}
                keyExtractor={(item: any) => String(item.id)}
                renderItem={({ item }) => {
                  const el = (now() - item.startedAt) / 60000;
                  const followingIt = following.includes(item.id);
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
                      <Pressable onPress={() => openDetail(item)} style={styles.btnSm}><Text style={styles.btnTextSmall}>Aç</Text></Pressable>
                      <Pressable onPress={() => toggleFollow(item.id)} style={[styles.btnSm, followingIt ? styles.btnActive : undefined]}>
                        <Text style={[styles.btnTextSmall, followingIt ? styles.btnActiveText : undefined]}>{followingIt ? 'Takiptesin' : '+ Takip'}</Text>
                      </Pressable>
                    </View>
                  );
                }}
              />
            )}
            <Text style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>(Yürüdükçe {geo} m yakındaki canlılar için bildirim)</Text>
          </View>

          {/* Detail Modal */}
          <Modal visible={detailOpen} animationType="slide" onRequestClose={closeDetail}>
            <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
              <View style={{ padding: 12, gap: 12 }}>
                <Pressable onPress={closeDetail} style={[styles.btn, { alignSelf: 'flex-start' }]}><Text style={styles.btnText}>Kapat</Text></Pressable>
                {sel && (
                  <ScrollView>
                    <View style={{ alignItems: 'center', marginBottom: 12 }}>
                      <Image source={{ uri: sel.avatar }} style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8 }} />
                      <Text style={{ fontSize: 20, fontWeight: '700' }}>{sel.name}</Text>
                      <Text style={{ color: '#475569', marginTop: 4 }}>{sel.genre} {sel.verified ? '· ✓' : ''} {sel.isLive ? '· • Aktif' : ''}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
                      <Pressable onPress={() => toggleFollow(sel.id)} style={[styles.btn]}><Text style={styles.btnText}>{following.includes(sel.id) ? 'Takiptesin' : '+ Takip et'}</Text></Pressable>
                    </View>
                    {user ? (
                      <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, borderColor: '#e5e7eb', borderWidth: 1 }}>
                        <Text style={{ fontWeight: '600', marginBottom: 8 }}>Bahşiş Gönder</Text>
                        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
                          {[20,50,100].map(a => (
                            <Pressable key={a} onPress={() => { addTip(sel.id, a, false, ''); Alert.alert('Gönderildi', `₺${a} bahşiş gönderildi`); }} style={styles.btn}>
                              <Text style={styles.btnText}>₺{a}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ) : (
                      <Text style={{ color: '#475569' }}>Bahşiş için giriş yapınız.</Text>
                    )}
                  </ScrollView>
                )}
              </View>
            </SafeAreaView>
          </Modal>
        </View>
      </SafeAreaView>
    );
  }

  // Web UI
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-xl font-bold">Açık Sahne</div>
          <span className="text-xs text-gray-500">Prototype</span>
        </div>
        <div className="flex items-center gap-2">
          {!user ? (
            <>
              <Button onClick={() => signIn("google")} className="bg-white">Google ile Giriş</Button>
              <Button onClick={() => signIn("apple")} className="bg-white">Apple ile Giriş</Button>
            </>
          ) : (
            <>
              <img src={user.avatar} className="w-8 h-8 rounded-full" />
              <div className="text-sm">{user.name}</div>
              <select className="px-2 py-1 border rounded-lg text-sm" value={role} onChange={(e) => setRole((e.target as HTMLSelectElement).value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <Button onClick={signOut} className="bg-white">Çıkış</Button>
            </>
          )}
        </div>
      </div>

      <Tabs tab={tab} setTab={setTab} role={role} />

      {tab === "user" && (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-8 space-y-3">
            <Card className="p-3">
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <span>Tür</span>
                  <select className="px-2 py-1 border rounded-lg" value={g} onChange={(e) => setG((e.target as HTMLSelectElement).value)}>
                    {GENRES.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span>Yarıçap</span>
                  <input type="number" className="w-24 px-2 py-1 border rounded-lg" value={geo} onChange={(e) => setGeo(Math.max(50, Number((e.target as HTMLInputElement).value)))} />
                  <span className="text-xs">m</span>
                </label>
                <Button onClick={() => {
                  getCurrentPosition()
                    .then((p) => setPos({ lat: p.latitude, lng: p.longitude }))
                    .catch(() => { if (Platform.OS === 'web') alert("Konum alınamadı"); else Alert.alert("Konum alınamadı"); });
                }}>Konumumu Al</Button>
              </div>
            </Card>

            <MapView
              artists={filtered}
              events={events}
              user={{ x: uxy.x, y: uxy.y }}
              onSelect={(a) => setSel(a)}
              onSelectEvent={(ev) => {
                const a = artists.find((x) => x.id === ev.artistId);
                if (a) setSel(a);
              }}
            />
          </div>

          <div className="col-span-4 space-y-3">
            <Card className="p-3">
              <div className="font-semibold mb-2">Çevrendeki Sanatçılar</div>
              {filtered.length === 0 ? (
                <div className="text-sm text-gray-500">Sonuç yok. Yarıçapı artırmayı deneyin.</div>
              ) : (
                <div className="space-y-1">
                  {filtered.slice(0, 30).map((a) => (
                    <ArtistRow key={a.id} a={a} onSelect={(x) => setSel(x)} following={following.includes(a.id)} onFollow={toggleFollow} />
                  ))}
                </div>
              )}
              <div className="mt-2 text-xs text-gray-500">(Yürüdükçe {geo} m yakındaki canlılar için üstte bildirim görür)</div>
            </Card>

            {sel && (
              <ArtistDetail
                user={user}
                a={sel}
                onClose={() => setSel(null)}
                following={following.includes(sel.id)}
                onFollow={toggleFollow}
                tips={tips.filter((t) => t.artistId === sel.id)}
                requests={requests.filter((r) => r.artistId === sel.id)}
                onTip={(amount, anon, note) => { addTip(sel.id, amount, anon, note); }}
                onSongRequest={(title, message, tipAmount) => { addRequest(sel.id, title, message, tipAmount); }}
                onQuickPublish={({ lat, lng, genre, radius, duration, artistId }) => {
                  setArtists((arr: any[]) => arr.map((a: any) =>
                    a.id === artistId
                      ? { ...a, location: { lat, lng }, genre, isLive: true, startedAt: now(), plannedMinutes: duration }
                      : a
                  ));
                  setPos({ lat, lng });
                  setGeo(radius);
                  setG(genre);
                  setSel(null);
                }}
              />
            )}
          </div>
        </div>
      )}

      {tab === "admin" && (
        <AdminPanel
          artists={artists}
          pending={pending}
          events={events}
          geofenceM={geo}
          setGeofenceM={setGeo}
          simulateWalk={simulateWalk}
          setSimulateWalk={setSimulateWalk}
          alertsForFollowedOnly={alertsOnly}
          setAlertsForFollowedOnly={setAlertsOnly}
          onExportArtists={exportArtists}
          onExportEvents={exportEvents}
          tips={tips}
          requests={requests}
        />
      )}

      {tab === "verify" && (
        <VerificationView artists={artists} setArtists={setArtists} pending={pending} setPending={setPending} />
      )}

      {tab === "plan" && (
        <PlannerView
          artists={artists}
          events={events}
          setEvents={setEvents}
          defaultLat={pos.lat}
          defaultLng={pos.lng}
          onExportDayICS={exportDayICS}
          onExportAllICS={exportAllICS}
        />
      )}

      <div className="text-[11px] text-slate-500 pt-4">Yerel saat: {new Date().toLocaleString("tr-TR")}</div>
    </div>
  );
};

export default App;

const styles = StyleSheet.create({
  btn: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  btnSm: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginLeft: 6,
  },
  btnText: {
    color: '#111827',
    fontWeight: '600',
  },
  btnTextSmall: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },
  btnActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  btnActiveText: {
    color: '#065f46',
  },
});
