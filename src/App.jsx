import React, { useState, useMemo, useEffect, useRef } from "react";
import { ArrowBigUp, ArrowBigDown, MessageSquare, Plus, X, Clock, Fuel, BatteryCharging, AlertTriangle, Lightbulb, MapPin, Home, Globe, Siren, ExternalLink, RefreshCw, Wifi, WifiOff, LayoutGrid, Map as MapIcon, Zap, ZapOff, Lock, Unlock, ChevronDown, Sun, Moon } from "lucide-react";
import { supabase, supabaseConfigured } from "./lib/supabaseClient";
import { DISTRICTS_SVG } from "./data/districtBorders";
import OBLAST_BORDER_PATHS from "./data/oblastBorderPaths.json";

const BACKEND_URL = "https://outage-schedule-backend.onrender.com";

// ---- design tokens (Reddit-style) ----
const bg = "#030303";
const card = "#1A1A1B";
const border = "#343536";
const text = "#D7DADC";
const textSoft = "#818384";
const orange = "#FF4500";
const orangeSoft = "rgba(255,69,0,0.16)";
const upvoteBlue = "#9AB4FF";
const danger = "#FF6B57";
const dangerSoft = "rgba(255,107,87,0.16)";
const gold = "#FFC93C";
const goldSoft = "rgba(255,201,60,0.14)";
const green = "#4ADE80";
const greenSoft = "rgba(74,222,128,0.14)";
const neutralSoft = "#272729";
const inputBg = "#272729";

// ---- map palette — matched pixel-for-pixel to alerts.in.ua's own CSS
// custom properties (--alert-zone-color, --artillery-shelling-zone-color,
// --urban-fights-zone-color, --chemical-zone-color, --nuclear-zone-color,
// --no-alert-zone-color), read straight off their live site, so this map
// uses the exact same colours for the exact same situations. ----
const mapBg = "#14181d";
const mapNoAlert = "#1a2636";
const mapAirRaidDistrict = "#762b2d";
const mapArtilleryDistrict = "#ff7b00";
const mapUrbanDistrict = "#4e3cb4";
const mapChemicalDistrict = "#b7ea35";
const mapNuclearDistrict = "#000000";
const mapLabelText = "#eef2f8";
const mapLabelHalo = "rgba(4,6,12,0.85)";
const mapOblastBorder = "rgba(8,10,15,0.55)";

// alerts.in.ua doesn't paint every oblast name the same colour — each one
// keeps its own identity colour (a 4-colour rotation: blue/pink/olive/green,
// picked so neighbours don't match) and only switches to solid white while
// the oblast has an active alert. Values below were read directly off their
// live map's computed styles. The 9 oblasts that happened to be under alert
// at read-time (so only their white state was visible) got their base
// colour picked by hand, following the same neighbour-contrast rule.
const OBLAST_LABEL_COLOR = {
  "Волинська область": "#4671c9",
  "Рівненська область": "#cc4856",
  "Житомирська область": "#a18137",
  "Львівська область": "#5d7d1e",
  "Тернопільська область": "#a18137",
  "Хмельницька область": "#4671c9",
  "Івано-Франківська область": "#4671c9",
  "Чернівецька область": "#cc4856",
  "Закарпатська область": "#cc4856",
  "Вінницька область": "#5d7d1e",
  "Черкаська область": "#a18137",
  "Кіровоградська область": "#cc4856",
  "Полтавська область": "#4671c9",
  "Миколаївська область": "#4671c9",
  "Херсонська область": "#5d7d1e",
  "Одеська область": "#a18137",
  "Київська область": "#cc4856",
  "Чернігівська область": "#5d7d1e",
  "Сумська область": "#5d7d1e",
  "Харківська область": "#a18137",
  "Дніпропетровська область": "#5d7d1e",
  "Запорізька область": "#4671c9",
  "Луганська область": "#4671c9",
  "Донецька область": "#cc4856",
  "Автономна Республіка Крим": "#cc4856",
};
const mapLabelActiveColor = "#ffffff";

const FONT = "'Golos Text', -apple-system, 'Segoe UI', sans-serif";

const SECTION_DEFS = [
  { id: "schedule", icon: Clock },
  { id: "generators", icon: Fuel },
  { id: "powerbanks", icon: BatteryCharging },
  { id: "complaints", icon: AlertTriangle },
  { id: "tips", icon: Lightbulb },
  { id: "regions", icon: MapPin },
];

const UI = {
  en: {
    tagline: "a community for outage schedules, generators, and getting through the dark hours",
    newPost: "New post",
    clearedTitle: "HOURS WITHOUT POWER REPORTED THIS WEEK",
    clearedSub: (n) => `across ${n} reported ${n === 1 ? "case" : "cases"} — shared by the community`,
    addCleared: "Report your outage",
    sections: "communities",
    allSections: "Home",
    top: "Top",
    new: "New",
    noPosts: "No posts here yet. Start the conversation.",
    postsLoading: "Loading posts…",
    postsError: "Couldn't reach the forum. Try again.",
    retry: "Retry",
    comments: "comments",
    noComments: "No comments yet. Be the first to reply.",
    addComment: "Add a comment",
    reply: "Reply",
    newPostModal: "New post",
    section: "COMMUNITY",
    title: "TITLE",
    titlePlaceholder: "What's going on with your power?",
    details: "DETAILS (OPTIONAL)",
    detailsPlaceholder: "Add context — what happened, what you've tried, what you need help with",
    cancel: "Cancel",
    post: "Post",
    titleError: "Give the post a title first.",
    addClearedModal: "Report your outage",
    amount: "HOURS WITHOUT POWER",
    amountPlaceholder: "6",
    amountError: "Enter a number greater than 0.",
    whatHappened: "AREA / DETAILS (OPTIONAL)",
    whatHappenedPlaceholder: "neighborhood, what caused it, how long it lasted…",
    addToTotal: "Add to total",
    debtCleared: "outage reported",
    disclaimerTitle: "NOTICE",
    disclaimer: [
      { text: "This site was built to make it easier to follow the power situation across Ukraine." },
      { text: "We're not a utility company or a government body — all information comes from public sources, so we can't guarantee its accuracy or affect real outage schedules.", bold: true },
      { text: "If you reuse content from this site, please link back to blackout.org.ua." },
    ],
  },
  ua: {
    tagline: "спільнота про графіки відключень, генератори і те, як пережити темні години",
    newPost: "Новий пост",
    clearedTitle: "ГОДИН БЕЗ СВІТЛА ПОВІДОМЛЕНО ЦЬОГО ТИЖНЯ",
    clearedSub: (n) => `за ${n} ${n === 1 ? "заявленим випадком" : "заявленими випадками"} — поділилася спільнота`,
    addCleared: "Повідомити про своє відключення",
    sections: "спільноти",
    allSections: "Головна",
    top: "Топ",
    new: "Нові",
    noPosts: "Тут поки що немає постів. Почніть обговорення першим.",
    postsLoading: "Завантажуємо пости…",
    postsError: "Не вдалося звʼязатися з форумом. Спробуйте ще раз.",
    retry: "Спробувати ще раз",
    comments: "коментарів",
    noComments: "Коментарів поки немає. Будьте першим.",
    addComment: "Написати коментар",
    reply: "Відповісти",
    newPostModal: "Новий пост",
    section: "СПІЛЬНОТА",
    title: "ЗАГОЛОВОК",
    titlePlaceholder: "Що сталося зі світлом?",
    details: "ПОДРОБИЦІ (НЕОБОВʼЯЗКОВО)",
    detailsPlaceholder: "Додайте контекст — що сталося, що вже пробували, яка потрібна допомога",
    cancel: "Скасувати",
    post: "Опублікувати",
    titleError: "Спочатку додайте заголовок.",
    addClearedModal: "Повідомити про своє відключення",
    amount: "ГОДИН БЕЗ СВІТЛА",
    amountPlaceholder: "6",
    amountError: "Введіть число більше 0.",
    whatHappened: "РАЙОН / ПОДРОБИЦІ (НЕОБОВʼЯЗКОВО)",
    whatHappenedPlaceholder: "район, через що сталося, скільки тривало…",
    addToTotal: "Додати до лічильника",
    debtCleared: "відключення заявлено",
    disclaimerTitle: "УВАГА",
    disclaimer: [
      { text: "Цей сайт створений, щоб зручно стежити за ситуацією зі світлом в Україні." },
      { text: "Ми не обленерго і не державна структура — вся інформація береться з відкритих загальнодоступних джерел, тому ми не можемо гарантувати її точність чи якось вплинути на реальні відключення.", bold: true },
      { text: "Якщо використовуєте матеріали сайту — будь ласка, вказуйте посилання на blackout.org.ua." },
    ],
  },
};

const SECTION_NAMES = {
  en: { schedule: "Schedules", generators: "Generators", powerbanks: "Power banks", complaints: "Utility Complaints", tips: "Tips", regions: "By Region" },
  ua: { schedule: "Графіки та черги", generators: "Генератори", powerbanks: "Павербанки", complaints: "Скарги на обленерго", tips: "Лайфхаки", regions: "За районами" },
};

const UNIT = { en: "hrs", ua: "год" };

const REGION_OPTIONS = [
  { slug: "kyiv", name: "Київ (місто)" },
  { slug: "kyivska-oblast", name: "Київська область" },
  { slug: "dnipropetrovska-oblast", name: "Дніпропетровська область" },
  { slug: "lvivska-oblast", name: "Львівська область" },
  { slug: "odeska-oblast", name: "Одеська область" },
  { slug: "kharkivska-oblast", name: "Харківська область" },
  { slug: "zaporizka-oblast", name: "Запорізька область" },
  { slug: "vinnytska-oblast", name: "Вінницька область" },
  { slug: "volynska-oblast", name: "Волинська область" },
  { slug: "donetska-oblast", name: "Донецька область" },
  { slug: "zhytomyrska-oblast", name: "Житомирська область" },
  { slug: "zakarpatska-oblast", name: "Закарпатська область" },
  { slug: "ivano-frankivska-oblast", name: "Івано-Франківська область" },
  { slug: "kirovogradska-oblast", name: "Кіровоградська область" },
  { slug: "luganska-oblast", name: "Луганська область" },
  { slug: "mikolayivska-oblast", name: "Миколаївська область" },
  { slug: "poltavska-oblast", name: "Полтавська область" },
  { slug: "rivnenska-oblast", name: "Рівненська область" },
  { slug: "sumska-oblast", name: "Сумська область" },
  { slug: "ternopilska-oblast", name: "Тернопільська область" },
  { slug: "khersonska-oblast", name: "Херсонська область" },
  { slug: "khmelnytska-oblast", name: "Хмельницька область" },
  { slug: "cherkaska-oblast", name: "Черкаська область" },
  { slug: "chernivecka-oblast", name: "Чернівецька область" },
  { slug: "chernigivska-oblast", name: "Чернігівська область" },
  { slug: "avtonomna-respublika-krym", name: "АР Крим" },
  { slug: "sevastopol", name: "Севастополь" },
];

const SCHEDULE_FAQ = [
  {
    q: "Чому графік на сайті відрізняється від реального відключення у мене вдома?",
    a: "Графіки погодинних відключень — це плановий орієнтир від обленерго, а не гарантія. Реальні відключення можуть зсуватися через аварійні відключення, ремонтні роботи або зміни в енергосистемі. Дані на сайті — з відкритих джерел і можуть оновлюватися із затримкою.",
  },
  {
    q: "Як дізнатися свою чергу відключень?",
    a: "Номер черги зазвичай вказаний у платіжці за електроенергію або на сайті вашого обленерго за адресою. Оберіть свою область і чергу у фільтрах вище, щоб побачити орієнтовний графік.",
  },
  {
    q: "Що робити, якщо світла немає довше, ніж вказано у графіку?",
    a: "Це може бути аварійне відключення, не пов'язане з плановим графіком. Перевірте офіційний Telegram-канал свого обленерго — там зазвичай повідомляють про терміни усунення. Можете також написати про це на форумі нижче — іншим буде корисно знати.",
  },
  {
    q: "Наскільки точні дані про повітряну тривогу на карті?",
    a: "Карта показує стан тривог по районах на основі відкритих даних і оновлюється автоматично. Для рішень, пов'язаних із безпекою, завжди орієнтуйтеся на офіційні сирени та застосунок «Повітряна тривога».",
  },
  {
    q: "Чи можна довіряти прогнозу на завтра?",
    a: "Графік на завтра публікується обленерго ближче до вечора і може ще змінитися. Якщо блок «Завтра» порожній — значить, оператор ще не оприлюднив дані.",
  },
  {
    q: "Хто веде цей сайт?",
    a: "Це незалежний проєкт для зручного відстеження ситуації зі світлом, не пов'язаний з обленерго чи державними органами. Детальніше — у застереженні внизу сторінки.",
  },
];

function operatorLabel(initiator) {
  if (!initiator) return "";
  if (initiator.endsWith("_uz")) return "Укрзалізниця";
  if (initiator.endsWith("_oblenergo")) return "Обленерго";
  return initiator;
}

const SCHEDULE_UI = {
  title: "Графік відключень світла",
  hint: "Оберіть чергу і позначте години без світла — це ваш особистий графік для сьогодні, ніяк не привʼязаний до офіційних даних обленерго.",
  queueLabel: "Черга",
  legendOn: "є світло",
  legendOff: "немає світла",
  reset: "Скинути на «все є»",
  hoursOff: (n) => `сьогодні без світла: ${n} ${n === 1 ? "година" : (n >= 2 && n <= 4) ? "години" : "годин"}`,
};

function defaultQueueHours() {
  return Array(24).fill(true);
}

// ---- air raid status: live sample from alarmmap.online, NOT an official feed ----
const AIR_ALERT_UI = {
  title: "Повітряна тривога — активні тривоги",
  disclaimer: "Дані з офіційного API alerts.in.ua — для реальних рішень про безпеку користуйтеся сиренами. · blackout.org.ua",
  none: "Наразі немає активних тривог",
  loading: "Перевіряємо поточний стан тривог…",
  error: "Не вдалося перевірити стан тривог. Спробуйте пізніше.",
};

const seedContributionsByLang = {
  en: [
    { id: 1, author: "u/mara_k", amount: 8, note: "Eastern district, unplanned outage" },
    { id: 2, author: "u/oldhouse_tom", amount: 5, note: "scheduled, matched the posted queue" },
    { id: 3, author: "u/second_chance22", amount: 11, note: "storm damage to a local line" },
    { id: 4, author: "u/frugal_frida", amount: 4, note: "shorter than usual today" },
    { id: 5, author: "u/quiet_ledger", amount: 9, note: "no notice, just went dark" },
  ],
  ua: [
    { id: 1, author: "u/mara_k", amount: 8, note: "лівий берег, позапланове" },
    { id: 2, author: "u/oldhouse_tom", amount: 5, note: "за графіком, збіглося з заявленим" },
    { id: 3, author: "u/second_chance22", amount: 11, note: "пошкодження лінії після негоди" },
    { id: 4, author: "u/frugal_frida", amount: 4, note: "сьогодні коротше, ніж зазвичай" },
    { id: 5, author: "u/quiet_ledger", amount: 9, note: "без попередження, просто вимкнули" },
  ],
};

function votesSort(a, b) {
  return b.votes - a.votes;
}

// Real posts/comments only carry a created_at timestamp from the DB —
// render it as the same kind of short relative label the old seed data
// used ("3h" / "3г"), instead of storing a separately-computed string
// that would go stale and need re-fetching on every language switch.
function timeAgo(isoString, lang) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
  if (seconds < 60) return lang === "ua" ? "щойно" : "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return lang === "ua" ? `${minutes}хв` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return lang === "ua" ? `${hours}г` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return lang === "ua" ? `${days}д` : `${days}d`;
}

export default function LedgerForum() {
  const [lang, setLang] = useState("ua");
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("blackout_theme") || "dark"; } catch { return "dark"; }
  });
  const isDark = theme === "dark";
  useEffect(() => {
    try { localStorage.setItem("blackout_theme", theme); } catch {}
  }, [theme]);

  const bg = isDark ? "#101216" : "#faf9f6";
  const card = isDark ? "#191c22" : "#ffffff";
  const border = isDark ? "#2b2f37" : "#e4e5e0";
  const text = isDark ? "#f1f2f4" : "#14171d";
  const textSoft = isDark ? "#a2a8b3" : "#5c6472";
  const orange = isDark ? "#4c8dff" : "#0057b7"; // было Reddit-оранжевым, теперь синій прапора (имя оставили как есть, чтобы не трогать остальной файл)
  const orangeSoft = isDark ? "rgba(76,141,255,0.18)" : "rgba(0,87,183,0.10)";
  const upvoteBlue = isDark ? "#c9b100" : "#a37f00"; // цвет даунвоута — теперь жовтий прапора, раз синій зайнятий основним акцентом
  const danger = isDark ? "#FF6B57" : "#D93025";
  const dangerSoft = isDark ? "rgba(255,107,87,0.16)" : "rgba(217,48,37,0.10)";
  const gold = isDark ? "#FFC93C" : "#B8860B";
  const goldSoft = isDark ? "rgba(255,201,60,0.14)" : "rgba(184,134,11,0.12)";
  const green = isDark ? "#4ADE80" : "#1E8E5A";
  const greenSoft = isDark ? "rgba(74,222,128,0.14)" : "rgba(30,142,90,0.10)";
  const neutralSoft = isDark ? "#21252c" : "#f2f1ec";
  const inputBg = isDark ? "#21252c" : "#f2f1ec";
  const flagYellow = "#ffd500"; // новый — желтый флага, для мелких акцентов
  const circleColor = isDark ? "#262a32" : "#cfd0c8";
  const t = UI[lang];
  const sectionName = id => SECTION_NAMES[lang][id];
  const [activeTab, setActiveTab] = useState("schedule");
  const mapContainerRef = useRef(null);
  const scheduleScrollRef = useRef(null);
  const dragState = useRef({ active: false, startX: 0, startScroll: 0 });

  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState("");
  const [activeSection, setActiveSection] = useState("all");
  const [sort, setSort] = useState("top");
  const [openPost, setOpenPost] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [session, setSession] = useState(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  const isAdmin = Boolean(session);
  const [voteState, setVoteState] = useState({});
  const [commentDraft, setCommentDraft] = useState("");
  const [composeTitle, setComposeTitle] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSection, setComposeSection] = useState("schedule");
  const [composeError, setComposeError] = useState("");
  const [scheduleRegion, setScheduleRegion] = useState("kyiv");
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [selectedEntryKey, setSelectedEntryKey] = useState(null);
  const [manualOverrides, setManualOverrides] = useState({}); // entryKey -> 24-slot bool array, only set once user edits by hand
  const [liveMode, setLiveMode] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null);
  const [airAlerts, setAirAlerts] = useState([]);
  const [airAlertsLoading, setAirAlertsLoading] = useState(true);
  const [airAlertsError, setAirAlertsError] = useState("");
  const [airAlertsCheckedAt, setAirAlertsCheckedAt] = useState(null);
  const [liveClock, setLiveClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setLiveClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  async function fetchPosts() {
    setPostsLoading(true);
    setPostsError("");
    if (!supabaseConfigured) {
      setPostsError(t.postsError);
      setPostsLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("posts")
        .select("*, comments(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const normalized = (data || []).map(p => ({
        ...p,
        comments: [...(p.comments || [])]
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          .map(c => ({ ...c, votes: 0 })),
      }));
      setPosts(normalized);
    } catch (err) {
      setPostsError(t.postsError);
    } finally {
      setPostsLoading(false);
    }
  }

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchAirAlerts() {
    setAirAlertsLoading(true);
    setAirAlertsError("");
    try {
      const res = await fetch(`${BACKEND_URL}/api/air-alerts`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `status ${res.status}`);
      setAirAlerts(data.alerts || []);
      setAirAlertsCheckedAt(new Date());
    } catch (err) {
      setAirAlertsError(AIR_ALERT_UI.error);
    } finally {
      setAirAlertsLoading(false);
    }
  }

  useEffect(() => {
    fetchAirAlerts();
  }, []);

  // alerts.in.ua's alert_type tells us WHAT is happening, not just where —
  // air_raid (missiles/drones inbound, siren-worthy) reads very differently
  // on the ground than artillery_shelling/urban_fights (active combat, no
  // siren will fire for it). Colour-code by that instead of collapsing
  // everything into one generic "danger" red.
  function alertKind(type) {
    if (type === "artillery_shelling" || type === "combined_shelling") return "artillery";
    if (type === "urban_fights") return "urban";
    if (type === "chemical") return "chemical";
    if (type === "nuclear") return "nuclear";
    return "air"; // air_raid, or an unlisted/future type — treat as the siren case
  }

  // alerts.in.ua reports Kyiv city itself as its own pseudo-oblast
  // ("м. Київ"), but this district map has no separate city polygon for
  // it — the capital's raions are folded into "Київська область". A
  // city-only alert used to also tint the whole oblast via that fold,
  // which reads as "the region is under alert" when really it's just the
  // capital. Kept separate now: "м. Київ" only ever sets the capital pin
  // (kyivCityHit below); the oblast's own districts light up solely from
  // their own real district/oblast-level alerts, if any.

  // Recolor the map whenever it's the visible tab (paths only exist in the
  // DOM once dangerouslySetInnerHTML has mounted them) or whenever the
  // alerts list itself changes. The official API gives us the oblast/raion
  // name directly as text — matches this SVG's data-oblast/data-raion
  // attributes with no slug-parsing needed.
  useEffect(() => {
    if (activeTab !== "map" || !mapContainerRef.current) return;
    const container = mapContainerRef.current;
    const svg = container.querySelector("svg");
    if (!svg) return;

    container.querySelectorAll(".map-district").forEach(p => {
      p.classList.remove("active-alert", "oblast-alert", "kind-air", "kind-artillery", "kind-urban", "kind-chemical", "kind-nuclear");
    });

    // The map's data-raion values always end in "район" (e.g.
    // "Бахмутський район"). alerts.in.ua's location_title is sometimes
    // just the bare name ("Бахмутський") and sometimes already has the
    // suffix — try both forms before giving up on a district match.
    function findDistrict(name) {
      if (!name) return null;
      let els = container.querySelectorAll(`[data-raion="${CSS.escape(name)}"]`);
      if (els.length > 0) return els;
      const trimmed = name.replace(/\s*район$/i, "").trim();
      if (trimmed && trimmed !== name) {
        els = container.querySelectorAll(`[data-raion="${CSS.escape(trimmed)} район"]`);
        if (els.length > 0) return els;
      } else if (trimmed) {
        els = container.querySelectorAll(`[data-raion="${CSS.escape(trimmed)}"]`);
        if (els.length > 0) return els;
      }
      return null;
    }

    let kyivCityHit = false;

    airAlerts.forEach(a => {
      if (a.location_oblast === "м. Київ") {
        // City-level alert with no district of its own — only the capital
        // pin lights up, the oblast's districts stay whatever their own
        // real alerts say.
        kyivCityHit = true;
        return;
      }
      const kind = alertKind(a.alert_type);
      let matched = false;
      const districts = findDistrict(a.location_raion) || findDistrict(a.location_title);
      if (districts) {
        districts.forEach(d => d.classList.add("active-alert", `kind-${kind}`));
        matched = true;
      }
      if (!matched && a.location_oblast) {
        container.querySelectorAll(`[data-oblast="${CSS.escape(a.location_oblast)}"]`).forEach(d => {
          // a precise district hit always wins over an oblast-wide tint
          if (!d.classList.contains("active-alert")) d.classList.add("oblast-alert", `kind-${kind}`);
        });
      }
    });

    // Oblast name labels + the Kyiv capital marker are built once from the
    // map's real geometry and then just toggled/recoloured on later alert
    // refreshes — no need to rebuild the whole label layer every 30s.
    //
    // Placement uses the area-weighted centroid of each district's own
    // center, not the bounding box of the whole oblast — a plain bbox
    // center lands outside the shape for anything elongated or bent
    // (Luhansk, Chernihiv), pushing the label past the coastline into the
    // empty background. Font size scales down with the oblast's own
    // footprint so small oblasts (Chernivtsi) don't get a label bigger
    // than the region itself.
    let layer = svg.querySelector(".map-oblast-labels");
    if (!layer) {
      layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      layer.setAttribute("class", "map-oblast-labels");
      const groups = {};
      container.querySelectorAll(".map-district").forEach(p => {
        const oblast = p.getAttribute("data-oblast");
        if (!oblast) return;
        (groups[oblast] || (groups[oblast] = [])).push(p);
      });
      Object.entries(groups).forEach(([oblast, paths]) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let wSumX = 0, wSumY = 0, wSum = 0;
        paths.forEach(p => {
          const b = p.getBBox();
          minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
          const area = Math.max(b.width * b.height, 1);
          wSumX += (b.x + b.width / 2) * area;
          wSumY += (b.y + b.height / 2) * area;
          wSum += area;
        });
        const cx = wSum > 0 ? wSumX / wSum : (minX + maxX) / 2;
        const cy = wSum > 0 ? wSumY / wSum : (minY + maxY) / 2;
        const boxW = maxX - minX;
        const boxH = maxY - minY;
        const fontSize = Math.max(25, Math.min(40, Math.min(boxW, boxH) * 0.25));
        const shortName = oblast
          .replace("Автономна Республіка Крим", "АР Крим")
          .replace(" область", "");
        const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
        el.setAttribute("x", cx);
        el.setAttribute("y", cy);
        el.setAttribute("class", "map-oblast-label");
        el.setAttribute("data-oblast-key", oblast);
        el.style.fontSize = `${fontSize}px`;
        el.style.fill = OBLAST_LABEL_COLOR[oblast] || mapLabelText;
        el.textContent = shortName;
        layer.appendChild(el);
        if (oblast === "Київська область") {
          const pin = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          pin.setAttribute("cx", cx);
          pin.setAttribute("cy", cy + fontSize * 1.7);
          pin.setAttribute("r", Math.max(4, fontSize * 0.22));
          pin.setAttribute("class", "map-capital-pin");
          layer.appendChild(pin);
          const capitalLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
          capitalLabel.setAttribute("x", cx);
          capitalLabel.setAttribute("y", cy + fontSize * 2.9);
          capitalLabel.setAttribute("class", "map-capital-label");
          capitalLabel.style.fontSize = `${Math.max(24, fontSize * 0.95)}px`;
          capitalLabel.textContent = "м. Київ";
          layer.appendChild(capitalLabel);
        }
      });

      // A couple of other major cities get the same small pin + name treatment
      // as the capital, matching alerts.in.ua's own map — anchored to their
      // own raion's real geometry (unlike Kyiv, which has no separate city
      // polygon in this data and falls back to the oblast centroid above).
      // Sevastopol has no distinct raion in this dataset at all, so it's
      // left out rather than guessing its position.
      [
        { city: "м. Харків", selector: 'path[data-city="м. Харків"]' },
        { city: "м. Запоріжжя", selector: 'path[data-city="м. Запоріжжя"]' },
      ].forEach(({ city, selector }) => {
        const cityPath = container.querySelector(selector);
        if (!cityPath) return;
        const b = cityPath.getBBox();
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", cx);
        dot.setAttribute("cy", cy);
        dot.setAttribute("r", 4);
        dot.setAttribute("class", "map-city-dot");
        layer.appendChild(dot);
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", cx);
        label.setAttribute("y", cy + 28);
        label.setAttribute("class", "map-capital-label");
        label.style.fontSize = "24px";
        label.textContent = city;
        layer.appendChild(label);
      });
      svg.appendChild(layer);
    }
    const pin = layer.querySelector(".map-capital-pin");
    if (pin) pin.classList.toggle("active-alert", kyivCityHit);

    // Labels are built once, but their colour still needs to follow the
    // alert state on every refresh — flip to solid white the moment any
    // district in that oblast lights up, and back to its identity colour
    // once it's clear again.
    layer.querySelectorAll(".map-oblast-label").forEach(label => {
      const oblast = label.getAttribute("data-oblast-key");
      const isAlerted = oblast && container.querySelector(
        `[data-oblast="${CSS.escape(oblast)}"].active-alert, [data-oblast="${CSS.escape(oblast)}"].oblast-alert`
      );
      label.style.fill = isAlerted ? mapLabelActiveColor : (OBLAST_LABEL_COLOR[oblast] || mapLabelText);
    });
  }, [activeTab, airAlerts]);

  function switchLang(next) {
    if (next === lang) return;
    setLang(next);
    setOpenPost(null);
    setActiveSection("all");
    setComposeSection("schedule");
  }

  const filtered = useMemo(() => {
    let list = activeSection === "all" ? posts : posts.filter(p => p.section === activeSection);
    list = [...list].sort(sort === "top" ? votesSort : (a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }, [posts, activeSection, sort]);

  async function handleAdminClick() {
    if (!supabase) return;
    if (isAdmin) {
      const confirmMsg = lang === "ua" ? "Вийти з режиму адміна?" : "Log out of admin mode?";
      if (window.confirm(confirmMsg)) {
        await supabase.auth.signOut();
      }
      return;
    }
    const email = window.prompt(lang === "ua" ? "Email:" : "Email:");
    if (!email) return;
    const password = window.prompt(lang === "ua" ? "Пароль:" : "Password:");
    if (!password) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      window.alert(lang === "ua" ? "Не вдалося увійти: перевір email і пароль" : "Sign-in failed: check email and password");
    }
  }

  function castVote(postId, dir) {
    const current = voteState[postId] || 0;
    const next = current === dir ? 0 : dir;
    const delta = next - current;
    if (delta === 0) return;
    setVoteState(prev => ({ ...prev, [postId]: next }));
    setPosts(ps => ps.map(p => p.id === postId ? { ...p, votes: p.votes + delta } : p));
    if (!supabaseConfigured) return;
    supabase.rpc("increment_post_vote", { p_id: postId, delta }).then(({ error }) => {
      if (error) {
        // roll back the optimistic update if the write didn't actually land
        setVoteState(prev => ({ ...prev, [postId]: current }));
        setPosts(ps => ps.map(p => p.id === postId ? { ...p, votes: p.votes - delta } : p));
      }
    });
  }

  async function submitComment(postId) {
    const text = commentDraft.trim();
    if (!text || !supabaseConfigured) return;
    const { data, error } = await supabase
      .from("comments")
      .insert({ post_id: postId, author: "u/you", text })
      .select()
      .single();
    if (error) return;
    setPosts(ps => ps.map(p => p.id === postId
      ? { ...p, comments: [...p.comments, { ...data, votes: 0 }] }
      : p));
    setCommentDraft("");
  }

  async function submitPost() {
    if (!composeTitle.trim()) {
      setComposeError(t.titleError);
      return;
    }
    if (!supabaseConfigured) {
      setComposeError(t.postsError);
      return;
    }
    const { data, error } = await supabase
      .from("posts")
      .insert({
        section: composeSection,
        author: "u/you",
        title: composeTitle.trim(),
        body: composeBody.trim(),
      })
      .select()
      .single();
    if (error) {
      setComposeError(t.postsError);
      return;
    }
    setPosts(ps => [{ ...data, comments: [] }, ...ps]);
    setComposeTitle("");
    setComposeBody("");
    setComposeError("");
    setShowCompose(false);
    setActiveSection(composeSection);
  }

  function toggleHour(hour) {
    if (!selectedEntryKey) return;
    setManualOverrides(prev => {
      const base = prev[selectedEntryKey] || currentEntry?.today || defaultQueueHours();
      const next = base.map((v, i) => i === hour ? !v : v);
      return { ...prev, [selectedEntryKey]: next };
    });
    // a manual edit means "trust my own mark" — stop implying this is still the live feed.
    setLiveMode(false);
  }

  function resetQueue() {
    if (!selectedEntryKey) return;
    setManualOverrides(prev => {
      const next = { ...prev };
      delete next[selectedEntryKey];
      return next;
    });
    setLiveMode(Boolean(currentEntry));
  }

  async function fetchLiveSchedule(region, attempt = 1) {
    setLiveLoading(true);
    setLiveError("");
    try {
      const res = await fetch(`${BACKEND_URL}/api/alerts-energy/schedule?region=${region}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `status ${res.status}`);
      const entries = data.queues || [];
      setScheduleEntries(entries);
      setManualOverrides({});
      if (entries.length > 0) {
        setSelectedEntryKey(`${entries[0].initiator}__${entries[0].queue}`);
        setLiveMode(true);
        setLiveUpdatedAt(new Date());
      } else {
        setSelectedEntryKey(null);
        setLiveMode(false);
        setLiveError(
          lang === "ua"
            ? "Для цього регіону поки немає даних. Показано ручний режим."
            : "No data available for this region yet. Showing manual mode."
        );
      }
    } catch (err) {
      // The free-tier backend "sleeps" after inactivity — the very first
      // request after a while can time out just as it's waking up.
      // One automatic retry after a pause covers that case without
      // bothering the person with a false "couldn't load" error.
      if (attempt < 2) {
        setTimeout(() => fetchLiveSchedule(region, attempt + 1), 8000);
        return;
      }
      setScheduleEntries([]);
      setSelectedEntryKey(null);
      setLiveMode(false);
      setLiveError(
        lang === "ua"
          ? "Не вдалося завантажити реальні дані. Показано ручний режим — можете виставити графік самостійно."
          : "Couldn't load live data. Showing manual mode — set the schedule yourself below."
      );
    } finally {
      setLiveLoading(false);
    }
  }

  useEffect(() => {
    fetchLiveSchedule(scheduleRegion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleRegion]);

  const currentEntry = scheduleEntries.find(e => `${e.initiator}__${e.queue}` === selectedEntryKey) || null;
  const currentSchedule = manualOverrides[selectedEntryKey] || currentEntry?.today || defaultQueueHours();
  const hoursOffCount = currentSchedule.filter(v => !v).length;
  const isManualOverride = Boolean(manualOverrides[selectedEntryKey]);

  return (
    <div style={{ background: bg, minHeight: "100vh", color: text, fontFamily: FONT, overflowX: "hidden", width: "100%", position: "relative", zIndex: 0 }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .schedule-scroll::-webkit-scrollbar { height: 0; display: none; }
        .schedule-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        /* An old bulb never glows perfectly steady — a small imperfection
           that ties the logo back to what the whole site is about. */
        @keyframes bulb-flicker {
          0%, 92%, 100% { opacity: 1; }
          93% { opacity: 0.4; }
          94% { opacity: 1; }
          95% { opacity: 0.55; }
          96% { opacity: 1; }
        }
        .logo-bulb { animation: bulb-flicker 7s infinite; }
        @keyframes alert-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
        }
        .tab-alert-dot { animation: alert-pulse 1.6s ease-in-out infinite; }
      `}</style>

      {/* декоративные круги — фон, отрисовываются позади всего контента и скроллятся вместе со страницей */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: -1, pointerEvents: "none" }}>
        <div style={{ position: "absolute", width: 260, height: 260, borderRadius: "50%", background: circleColor, filter: "blur(2px)", opacity: isDark ? 0.5 : 0.7, top: -90, right: "8%" }} />
        <div style={{ position: "absolute", width: 140, height: 140, borderRadius: "50%", background: circleColor, filter: "blur(2px)", opacity: isDark ? 0.4 : 0.6, top: 340, left: "2%" }} />
        <div style={{ position: "absolute", width: 90, height: 90, borderRadius: "50%", background: circleColor, filter: "blur(2px)", opacity: isDark ? 0.4 : 0.6, top: 700, right: "12%" }} />
        <div style={{ position: "absolute", width: 46, height: 46, borderRadius: "50%", border: `2px solid ${flagYellow}`, opacity: 0.5, top: 120, right: "20%" }} />
      </div>

      {/* header — Reddit-style top nav */}
      <div style={{ background: card, borderBottom: `1px solid ${border}`, position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg viewBox="0 0 512 512" width="32" height="32" className="logo-bulb" style={{ flexShrink: 0, borderRadius: 10 }}>
              <defs>
                <filter id="logoShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.25" />
                </filter>
              </defs>
              <rect width="512" height="512" rx="104" ry="104" fill="#142238" />
              <g filter="url(#logoShadow)">
                <rect x="66" y="176" width="380" height="160" rx="10" fill="#0057B7" />
                <rect x="66" y="256" width="380" height="80" fill="#FFD700" />
              </g>
              <path d="M58 4 L20 56 L42 56 L34 98 L82 38 L56 38 Z" fill="#ffffff" transform="translate(100,96) scale(3.125)" />
            </svg>
            <h1 style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.01em", margin: 0, fontFamily: "'Unbounded', sans-serif" }}>blackout</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              title={isDark ? (lang === "ua" ? "Світла тема" : "Light theme") : (lang === "ua" ? "Темна тема" : "Dark theme")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32, borderRadius: 999,
                border: `1px solid ${border}`, background: "transparent", color: textSoft, cursor: "pointer",
              }}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 4, border: `1px solid ${border}`, borderRadius: 999, padding: 3 }}>
              <Globe size={14} style={{ marginLeft: 6, color: textSoft }} />
              {["en", "ua"].map(code => (
                <button
                  key={code}
                  onClick={() => switchLang(code)}
                  style={{
                    background: lang === code ? text : "transparent",
                    color: lang === code ? "#fff" : textSoft,
                    border: "none", borderRadius: 999, padding: "4px 10px", fontSize: 12.5, fontWeight: 600,
                    cursor: "pointer", textTransform: "uppercase",
                  }}
                >
                  {code}
                </button>
              ))}
            </div>
            <button
              onClick={handleAdminClick}
              title={isAdmin
                ? (lang === "ua" ? "Режим адміна (вийти)" : "Admin mode (log out)")
                : (lang === "ua" ? "Вхід для адміна" : "Admin login")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32, borderRadius: 999,
                border: `1px solid ${border}`,
                background: isAdmin ? orange : "transparent",
                color: isAdmin ? "#fff" : textSoft,
                cursor: "pointer",
              }}
            >
              {isAdmin ? <Unlock size={14} /> : <Lock size={14} />}
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowCompose(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: orange, color: "#fff", border: "none", borderRadius: 999, padding: "8px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                <Plus size={16} /> {t.newPost}
              </button>
            )}
          </div>
        </div>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 20px 10px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 12.5, color: textSoft, fontWeight: 400, margin: 0 }}>{t.tagline}</h2>
          {lang === "ua" && (airAlerts.length > 0 || hoursOffCount > 0) && (
            <span style={{ fontSize: 12, color: textSoft, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: border }}>·</span>
              {airAlerts.length > 0 && (
                <span style={{ color: danger, fontWeight: 600 }}>{airAlerts.length} активних тривог</span>
              )}
              {airAlerts.length > 0 && hoursOffCount > 0 && <span style={{ color: border }}>·</span>}
              {hoursOffCount > 0 && (
                <span>{hoursOffCount} год без світла сьогодні у вибраній черзі</span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* top-level tabs */}
      <div style={{ background: card, borderBottom: `1px solid ${border}` }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 20px", display: "flex", gap: 4 }}>
          {[
            { id: "schedule", label: lang === "ua" ? "Графік" : "Schedule", icon: Clock },
            { id: "map", label: lang === "ua" ? "Карта" : "Map", icon: MapIcon },
            { id: "forum", label: lang === "ua" ? "Форум" : "Forum", icon: LayoutGrid },
            { id: "alert", label: lang === "ua" ? "Тривога" : "Alert", icon: Siren },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, position: "relative",
                  background: "none", border: "none", cursor: "pointer",
                  padding: "12px 14px", fontSize: 14, fontWeight: 600,
                  color: active ? orange : textSoft,
                  borderBottom: active ? `2px solid ${orange}` : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                <Icon size={16} /> {tab.label}
                {tab.id === "alert" && airAlerts.length > 0 && (
                  <span
                    className="tab-alert-dot"
                    style={{ width: 7, height: 7, borderRadius: "50%", background: danger, display: "inline-block" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* air raid status — live sample from alarmmap.online, clearly not an official feed */}
      {activeTab === "alert" && lang === "ua" && (
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "16px 20px 0" }}>
          <div style={{ background: card, border: `2px solid ${danger}`, borderRadius: 8, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Siren size={18} color={danger} />
                <h2 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>{AIR_ALERT_UI.title}</h2>
              </div>
              <button
                onClick={fetchAirAlerts}
                disabled={airAlertsLoading}
                style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "6px 10px", cursor: airAlertsLoading ? "default" : "pointer", color: textSoft, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}
              >
                <RefreshCw size={13} style={airAlertsLoading ? { animation: "spin 1s linear infinite" } : {}} />
                Оновити
              </button>
            </div>
            <div style={{ background: dangerSoft, border: `1px solid ${danger}30`, borderRadius: 6, padding: "10px 12px", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 8 }}>
              <AlertTriangle size={16} color={danger} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: text, lineHeight: 1.5 }}>{AIR_ALERT_UI.disclaimer}</div>
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: textSoft, margin: "0 0 12px" }}>
              Тут — текстовий список районів з активною повітряною тривогою прямо зараз, без потреби гортати карту. Дані беруться з офіційного API alerts.in.ua і оновлюються автоматично щоразу, коли ви заходите на сторінку, або вручну кнопкою «Оновити». Якщо список порожній — за останніми даними тривог по Україні немає, але перевірте офіційні джерела, якщо плануєте щось, що залежить від безпеки.
            </p>

            {airAlertsLoading && (
              <div style={{ fontSize: 13, color: textSoft }}>{AIR_ALERT_UI.loading}</div>
            )}
            {!airAlertsLoading && airAlertsError && (
              <div style={{ fontSize: 13, color: danger }}>{airAlertsError}</div>
            )}
            {!airAlertsLoading && !airAlertsError && airAlerts.length === 0 && (
              <div style={{ fontSize: 13, color: green, display: "flex", alignItems: "center", gap: 6 }}>
                {AIR_ALERT_UI.none}
              </div>
            )}
            {!airAlertsLoading && !airAlertsError && airAlerts.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                {airAlerts.map((a, i) => (
                  <div
                    key={i}
                    style={{ background: dangerSoft, border: `1px solid ${danger}40`, borderRadius: 6, padding: "9px 10px" }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: text, marginBottom: 2 }}>{a.location_title || a.location_raion || a.location_oblast}</div>
                    <div style={{ fontSize: 11, color: textSoft, marginBottom: 3 }}>{a.location_oblast || ""}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: danger, textTransform: "uppercase", letterSpacing: "0.03em" }}>тривога</div>
                  </div>
                ))}
              </div>
            )}
            {airAlertsCheckedAt && !airAlertsLoading && (
              <div style={{ fontSize: 11.5, color: textSoft, marginTop: 10 }}>
                Перевірено о {airAlertsCheckedAt.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* power outage schedule — Ukraine-specific */}
      {activeTab === "schedule" && lang === "ua" && (
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "12px 20px 0" }}>
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 8, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
              <div>
                <h2 style={{ fontWeight: 700, fontSize: 16, margin: "0 0 4px" }}>{SCHEDULE_UI.title}</h2>
                <div style={{ fontSize: 12.5, color: textSoft, maxWidth: "60ch", lineHeight: 1.5 }}>
                  {liveMode
                    ? "Дані підтягнуто з неофіційного агрегатора alerts.energy — можуть відрізнятись від реальності, перевіряйте на офіційних ресурсах для важливих рішень."
                    : SCHEDULE_UI.hint}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <select
                  value={scheduleRegion}
                  onChange={e => setScheduleRegion(e.target.value)}
                  style={{ padding: "6px 8px", border: `1px solid ${border}`, borderRadius: 6, fontSize: 13.5, fontFamily: "inherit", background: inputBg, color: text, fontWeight: 600, maxWidth: 220 }}
                >
                  {REGION_OPTIONS.map(r => <option key={r.slug} value={r.slug}>{r.name}</option>)}
                </select>
                <span style={{ fontSize: 13, color: textSoft, fontWeight: 600 }}>{SCHEDULE_UI.queueLabel}</span>
                <select
                  value={selectedEntryKey || ""}
                  onChange={e => { setSelectedEntryKey(e.target.value); setLiveMode(true); }}
                  disabled={scheduleEntries.length === 0}
                  style={{ padding: "6px 8px", border: `1px solid ${border}`, borderRadius: 6, fontSize: 13.5, fontFamily: "inherit", background: inputBg, color: text, width: 170, maxWidth: 170 }}
                >
                  {scheduleEntries.length === 0 && <option value="">—</option>}
                  {scheduleEntries.map(e => {
                    const key = `${e.initiator}__${e.queue}`;
                    const opLabel = operatorLabel(e.initiator);
                    return <option key={key} value={key}>{e.queue}{opLabel ? ` — ${opLabel}` : ""}</option>;
                  })}
                </select>
                <button
                  onClick={() => fetchLiveSchedule(scheduleRegion)}
                  disabled={liveLoading}
                  aria-label="Оновити"
                  style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "7px 8px", cursor: liveLoading ? "default" : "pointer", color: textSoft, display: "flex" }}
                >
                  <RefreshCw size={14} style={liveLoading ? { animation: "spin 1s linear infinite" } : {}} />
                </button>
              </div>

            </div>

            <div style={{
              display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 12,
              padding: "8px 10px", borderRadius: 6, minHeight: 36,
              background: liveMode ? greenSoft : liveError ? dangerSoft : neutralSoft,
              color: liveMode ? green : liveError ? danger : textSoft,
            }}>
              {liveMode ? <Wifi size={14} /> : <WifiOff size={14} />}
              {liveLoading
                ? "Завантаження даних…"
                : liveMode
                  ? (isManualOverride
                      ? "Ручне редагування поверх наживо-даних — натисніть «скинути», щоб повернути оригінал"
                      : `Наживо з alerts.energy · оновлено о ${liveUpdatedAt ? liveUpdatedAt.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) : ""}`)
                  : liveError || "Ручний режим — виставте свій графік нижче"}
            </div>

            <div
              ref={scheduleScrollRef}
              className="schedule-scroll"
              style={{ overflowX: "auto", marginBottom: 10, cursor: "grab" }}
              onMouseDown={e => {
                const el = scheduleScrollRef.current;
                dragState.current = { active: true, startX: e.pageX, startScroll: el.scrollLeft };
                el.style.cursor = "grabbing";
              }}
              onMouseLeave={() => {
                dragState.current.active = false;
                if (scheduleScrollRef.current) scheduleScrollRef.current.style.cursor = "grab";
              }}
              onMouseUp={() => {
                dragState.current.active = false;
                if (scheduleScrollRef.current) scheduleScrollRef.current.style.cursor = "grab";
              }}
              onMouseMove={e => {
                if (!dragState.current.active) return;
                e.preventDefault();
                const el = scheduleScrollRef.current;
                const delta = e.pageX - dragState.current.startX;
                el.scrollLeft = dragState.current.startScroll - delta;
              }}
            >
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "6px 10px 6px 0", textAlign: "left", fontSize: 12, color: textSoft, fontWeight: 600, position: "sticky", left: 0, background: card }}></th>
                    {Array.from({ length: 24 }).map((_, h) => (
                      <th key={h} style={{ padding: "0 0 6px", fontSize: 10.5, color: textSoft, fontWeight: 600, textAlign: "center", minWidth: 28 }}>
                        {String(h).padStart(2, "0")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: "4px 10px 4px 0", fontSize: 12.5, fontWeight: 700, color: text, whiteSpace: "nowrap", position: "sticky", left: 0, background: card }}>
                      {lang === "ua" ? "Сьогодні" : "Today"}
                    </td>
                    {currentSchedule.map((on, hour) => (
                      <td key={hour} style={{ padding: 2 }}>
                        <button
                          onClick={() => toggleHour(hour)}
                          aria-label={`${hour}:00 — ${on ? SCHEDULE_UI.legendOn : SCHEDULE_UI.legendOff}`}
                          title={`${hour}:00`}
                          style={{
                            width: "100%", height: 30,
                            background: on ? "transparent" : dangerSoft,
                            border: `1px solid ${on ? border : danger + "50"}`,
                            borderRadius: 4, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          {on
                            ? <Zap size={13} color={textSoft} style={{ opacity: 0.4 }} />
                            : <ZapOff size={13} color={danger} />}
                        </button>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 10px 4px 0", fontSize: 12.5, fontWeight: 700, color: text, whiteSpace: "nowrap", position: "sticky", left: 0, background: card }}>
                      {lang === "ua" ? "Завтра" : "Tomorrow"}
                    </td>
                    {currentEntry?.tomorrow ? (
                      currentEntry.tomorrow.map((on, hour) => (
                        <td key={hour} style={{ padding: 2 }}>
                          <div
                            title={`${hour}:00`}
                            style={{
                              width: "100%", height: 30,
                              background: on ? "transparent" : dangerSoft,
                              border: `1px solid ${on ? border : danger + "50"}`,
                              borderRadius: 4,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >
                            {on
                              ? <Zap size={13} color={textSoft} style={{ opacity: 0.4 }} />
                              : <ZapOff size={13} color={danger} />}
                          </div>
                        </td>
                      ))
                    ) : (
                      <td colSpan={24} style={{ padding: "6px 0", fontSize: 12, color: textSoft, textAlign: "center" }}>
                        {lang === "ua" ? "графік на завтра ще не опубліковано" : "tomorrow's schedule isn't published yet"}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12.5, color: textSoft, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Zap size={13} color={textSoft} style={{ opacity: 0.4 }} />
                  {SCHEDULE_UI.legendOn}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ZapOff size={13} color={danger} />
                  {SCHEDULE_UI.legendOff}
                </span>
                <span>{SCHEDULE_UI.hoursOff(hoursOffCount)}</span>
              </div>
              <button
                onClick={resetQueue}
                style={{ background: "none", border: `1px solid ${border}`, borderRadius: 999, padding: "6px 12px", fontSize: 12.5, cursor: "pointer", color: textSoft }}
              >
                {SCHEDULE_UI.reset}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 14, background: card, border: `1px solid ${border}`, borderRadius: 8, padding: "16px 18px" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: textSoft, marginBottom: 4, textTransform: "uppercase" }}>
              Часті запитання
            </div>
            {SCHEDULE_FAQ.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} style={{ borderTop: i === 0 ? "none" : `1px solid ${border}` }}>
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    style={{
                      width: "100%", background: "none", border: "none", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                      padding: "14px 0", textAlign: "left", fontSize: 14, fontWeight: 700, color: text,
                      fontFamily: "inherit",
                    }}
                  >
                    {item.q}
                    <ChevronDown size={16} color={textSoft} style={{ flexShrink: 0, transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "none" }} />
                  </button>
                  {/* answer stays in the DOM (just visually collapsed) so it's still crawlable/indexable */}
                  <div style={{ display: isOpen ? "block" : "none", fontSize: 13.5, color: textSoft, lineHeight: 1.6, paddingBottom: 14 }}>
                    {item.a}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 20px", display: activeTab === "forum" ? "grid" : "none", gridTemplateColumns: "1fr 220px", gap: 20 }}>

        {/* feed */}
        <div>
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 8, padding: "8px 12px", display: "flex", gap: 4, marginBottom: 12 }}>
            {[["top", t.top], ["new", t.new]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                style={{
                  background: sort === key ? orangeSoft : "transparent",
                  color: sort === key ? orange : textSoft,
                  border: "none",
                  borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {postsLoading && (
            <div style={{ padding: "40px 0", textAlign: "center", color: textSoft, fontSize: 14 }}>
              {t.postsLoading}
            </div>
          )}

          {!postsLoading && postsError && (
            <div style={{ padding: "40px 0", textAlign: "center", color: danger, fontSize: 14 }}>
              {postsError}
              <div>
                <button
                  onClick={fetchPosts}
                  style={{ marginTop: 10, background: "none", border: `1px solid ${border}`, borderRadius: 999, padding: "6px 14px", fontSize: 13, cursor: "pointer", color: textSoft }}
                >
                  {t.retry}
                </button>
              </div>
            </div>
          )}

          {!postsLoading && !postsError && filtered.length === 0 && (
            <div style={{ padding: "40px 0", textAlign: "center", color: textSoft, fontSize: 14 }}>
              {t.noPosts}
            </div>
          )}

          {!postsLoading && !postsError && filtered.map(post => {
            const Icon = SECTION_DEFS.find(s => s.id === post.section).icon;
            const isOpen = openPost === post.id;
            const myVote = voteState[post.id] || 0;
            return (
              <div key={post.id} style={{ background: card, border: `1px solid ${border}`, borderRadius: 8, marginBottom: 10, display: "flex" }}>
                {/* vote column */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 8px", minWidth: 40, background: inputBg, borderRadius: "8px 0 0 8px" }}>
                  <button onClick={() => castVote(post.id, 1)} aria-label="Upvote" style={{ background: "none", border: "none", cursor: "pointer", color: myVote === 1 ? orange : textSoft, padding: 2, lineHeight: 0 }}>
                    <ArrowBigUp size={20} fill={myVote === 1 ? orange : "none"} />
                  </button>
                  <span style={{ fontWeight: 700, fontSize: 12.5, margin: "4px 0", color: myVote === 1 ? orange : myVote === -1 ? upvoteBlue : text }}>{post.votes}</span>
                  <button onClick={() => castVote(post.id, -1)} aria-label="Downvote" style={{ background: "none", border: "none", cursor: "pointer", color: myVote === -1 ? upvoteBlue : textSoft, padding: 2, lineHeight: 0 }}>
                    <ArrowBigDown size={20} fill={myVote === -1 ? upvoteBlue : "none"} />
                  </button>
                </div>

                {/* content */}
                <div style={{ padding: "12px 16px", flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: textSoft, marginBottom: 6 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 700, color: text }}>
                      <Icon size={13} /> r/{sectionName(post.section)}
                    </span>
                    <span>·</span>
                    <span>{post.author}</span>
                    <span>·</span>
                    <span>{timeAgo(post.created_at, lang)}</span>
                  </div>
                  <div
                    onClick={() => setOpenPost(isOpen ? null : post.id)}
                    style={{ fontWeight: 600, fontSize: 17, lineHeight: 1.35, cursor: "pointer", marginBottom: 6, color: text }}
                  >
                    {post.title}
                  </div>
                  {!isOpen && (
                    <div style={{ fontSize: 14, color: textSoft, lineHeight: 1.5, marginBottom: 8, maxWidth: "68ch" }}>
                      {post.body.length > 140 ? post.body.slice(0, 140) + "…" : post.body}
                    </div>
                  )}
                  {isOpen && (
                    <div style={{ fontSize: 14.5, color: text, lineHeight: 1.55, marginBottom: 14, maxWidth: "68ch" }}>
                      {post.body}
                    </div>
                  )}

                  <button
                    onClick={() => setOpenPost(isOpen ? null : post.id)}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: neutralSoft, border: "none", borderRadius: 999, cursor: "pointer", color: textSoft, fontSize: 12.5, fontWeight: 700, padding: "6px 12px" }}
                  >
                    <MessageSquare size={14} /> {post.comments.length} {t.comments}
                  </button>

                  {isOpen && (
                    <div style={{ marginTop: 14, borderTop: `1px solid ${border}`, paddingTop: 14 }}>
                      {post.comments.map(c => (
                        <div key={c.id} style={{ marginBottom: 12, paddingLeft: 10, borderLeft: `2px solid ${border}` }}>
                          <div style={{ fontSize: 12, color: textSoft, marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, color: text }}>{c.author}</span> · {timeAgo(c.created_at, lang)}
                          </div>
                          <div style={{ fontSize: 14, lineHeight: 1.5, color: text }}>{c.text}</div>
                        </div>
                      ))}
                      {post.comments.length === 0 && (
                        <div style={{ fontSize: 13, color: textSoft, marginBottom: 12 }}>{t.noComments}</div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <input
                          value={commentDraft}
                          onChange={e => setCommentDraft(e.target.value)}
                          placeholder={t.addComment}
                          style={{ flex: 1, border: `1px solid ${border}`, borderRadius: 999, padding: "8px 14px", fontSize: 13.5, fontFamily: "inherit", background: inputBg, color: text }}
                          onKeyDown={e => { if (e.key === "Enter") submitComment(post.id); }}
                        />
                        <button
                          onClick={() => submitComment(post.id)}
                          style={{ background: orange, color: "#fff", border: "none", borderRadius: 999, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                        >
                          {t.reply}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* sidebar */}
        <div>
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 8, padding: "14px 14px" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.06em", color: textSoft, marginBottom: 10, fontWeight: 700, textTransform: "uppercase" }}>{t.sections}</div>
            <button
              onClick={() => setActiveSection("all")}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                padding: "7px 8px", marginBottom: 2, border: "none", borderRadius: 6, cursor: "pointer",
                background: activeSection === "all" ? orangeSoft : "transparent",
                color: activeSection === "all" ? orange : text, fontWeight: activeSection === "all" ? 700 : 500,
                fontSize: 14,
              }}
            >
              <Home size={16} /> {t.allSections}
            </button>
            {SECTION_DEFS.map(s => {
              const Icon = s.icon;
              const active = activeSection === s.id;
              const count = posts.filter(p => p.section === s.id).length;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                    padding: "7px 8px", marginBottom: 2, border: "none", borderRadius: 6, cursor: "pointer",
                    background: active ? orangeSoft : "transparent",
                    color: active ? orange : text, fontWeight: active ? 700 : 500, fontSize: 14,
                  }}
                >
                  <Icon size={16} />
                  <span style={{ flex: 1 }}>r/{sectionName(s.id)}</span>
                  <span style={{ fontSize: 12, color: textSoft }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* map tab — real Ukraine district boundaries, shaded by what's actually
          happening in them right now (air raid vs. active combat) */}
      {activeTab === "map" && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 20px" }}>
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 8, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>
                  {lang === "ua" ? "Карта — повітряна тривога" : "Map — air raid alerts"}
                </h2>
                {airAlerts.length > 0 && (
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: danger }}>
                    {airAlerts.length} {lang === "ua" ? "активних тривог" : "active alerts"}
                  </span>
                )}
              </div>
              <button
                onClick={fetchAirAlerts}
                disabled={airAlertsLoading}
                style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: "6px 10px", cursor: airAlertsLoading ? "default" : "pointer", color: textSoft, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}
              >
                <RefreshCw size={13} style={airAlertsLoading ? { animation: "spin 1s linear infinite" } : {}} />
                {lang === "ua" ? "Оновити" : "Refresh"}
              </button>
            </div>
            <div style={{ background: dangerSoft, border: `1px solid ${danger}30`, borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 12, lineHeight: 1.5 }}>
              {lang === "ua"
                ? "Дані з офіційного API alerts.in.ua — для реальних рішень про безпеку користуйтеся сиренами. · blackout.org.ua"
                : "Data from the official alerts.in.ua API — for real safety decisions use sirens. · blackout.org.ua"}
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: textSoft, margin: "0 0 12px" }}>
              {lang === "ua"
                ? "Карта показує 139 районів України: сірий колір — тривоги немає, кольорова заливка — триває повітряна тривога чи бойові дії за даними офіційного API alerts.in.ua. Наведіть курсор на район, щоб побачити назву, або перемкніться на вкладку «Тривога» для текстового списку активних попереджень. Дані оновлюються автоматично, але для рішень про власну безпеку орієнтуйтеся на сирени та застосунок «Повітряна тривога»."
                : "The map shows all 139 districts of Ukraine: grey means no alert, a colored fill means an active air raid or combat alert per the official alerts.in.ua API. Hover a district to see its name, or switch to the Alert tab for a plain-text list of active warnings. Data updates automatically, but for real safety decisions rely on sirens and the official Air Alert app."}
            </p>
            <style>{`
              .map-district { fill: ${mapNoAlert}; stroke: none; }
              .map-district.kind-air { fill: ${mapAirRaidDistrict}; }
              .map-district.kind-artillery { fill: ${mapArtilleryDistrict}; }
              .map-district.kind-urban { fill: ${mapUrbanDistrict}; }
              .map-district.kind-chemical { fill: ${mapChemicalDistrict}; }
              .map-district.kind-nuclear { fill: ${mapNuclearDistrict}; stroke: #ffffff; stroke-width: 1.5; }
              .map-district.oblast-alert { opacity: 0.6; }
              .map-label { display: none; }
              .map-oblast-label {
                fill: ${mapLabelText}; font-family: ${FONT}; font-weight: 700; font-size: 14px;
                text-anchor: middle; dominant-baseline: middle; pointer-events: none;
                paint-order: stroke; stroke: ${mapLabelHalo}; stroke-width: 3px; stroke-linejoin: round;
              }
              .map-capital-label {
                fill: ${mapLabelText}; font-family: ${FONT}; font-weight: 700; font-size: 12px;
                text-anchor: middle; pointer-events: none;
                paint-order: stroke; stroke: ${mapLabelHalo}; stroke-width: 3px; stroke-linejoin: round;
              }
              .map-capital-pin { fill: ${mapLabelText}; stroke: ${mapBg}; stroke-width: 4; pointer-events: none; }
              .map-capital-pin.active-alert { fill: ${mapAirRaidDistrict}; }
              .map-city-dot { fill: ${mapLabelText}; stroke: ${mapBg}; stroke-width: 4; pointer-events: none; }
            `}</style>
            <div style={{ position: "relative", background: mapBg, borderRadius: 8, overflow: "hidden", border: `1px solid ${border}` }}>
              <div
                ref={mapContainerRef}
                style={{ width: "100%" }}
                dangerouslySetInnerHTML={{
                  // viewBox is the *actual* bounding box of every district path (checked
                  // via getBBox across all 139 of them: x 97–4889, y 162–3354), plus a
                  // small margin — not a guessed box. The old "0 0 4750 3450" box cut off
                  // at x=4750, chopping the easternmost tip of Luhansk oblast clean off,
                  // which is why that edge looked jagged/"sticking out". A tight box also
                  // drops the dead margin on every side, so the map reads bigger/closer
                  // at the same card width, matching alerts.in.ua's tight crop.
                  __html: `<svg viewBox="67 132 4852 3252" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">${DISTRICTS_SVG}</svg>`
                }}
              />
              {/* oblast (region) outlines — a single clean contour per region, computed
                  once from the raion polygons above, drawn on top so region boundaries
                  read clearly even when neighbouring raions share the same alert fill */}
              <svg
                viewBox="67 132 4852 3252"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
              >
                {Object.entries(OBLAST_BORDER_PATHS).map(([oblast, d]) => (
                  <path key={oblast} d={d} fill="none" stroke={mapOblastBorder} strokeWidth={1.5} strokeLinejoin="round" />
                ))}
              </svg>
              <div style={{
                position: "absolute", left: 0, right: 0, bottom: 0, padding: "22px 14px 10px",
                background: "linear-gradient(to top, rgba(2,3,7,0.85), rgba(2,3,7,0))",
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
                pointerEvents: "none",
              }}>
                <span style={{ fontSize: 11, color: "rgba(238,242,248,0.45)" }}>
                  {liveClock.toLocaleDateString("uk-UA")}, {liveClock.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(238,242,248,0.35)" }}>
                  blackout.org.ua
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12.5, color: textSoft, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: mapNoAlert, border: `1px solid ${border}`, display: "inline-block" }} />
                {lang === "ua" ? "немає тривоги" : "no alert"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: mapAirRaidDistrict, display: "inline-block" }} />
                {lang === "ua" ? "повітряна тривога" : "air raid alert"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: mapArtilleryDistrict, display: "inline-block" }} />
                {lang === "ua" ? "загроза артобстрілу" : "artillery shelling"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: mapUrbanDistrict, display: "inline-block" }} />
                {lang === "ua" ? "загроза вуличних боїв" : "urban combat"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: mapChemicalDistrict, display: "inline-block" }} />
                {lang === "ua" ? "хімічна загроза" : "chemical threat"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: mapNuclearDistrict, border: "1px solid #ffffff", display: "inline-block" }} />
                {lang === "ua" ? "радіаційна загроза" : "nuclear threat"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.75 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: mapAirRaidDistrict, opacity: 0.6, display: "inline-block" }} />
                {lang === "ua" ? "тривога десь в області" : "alert somewhere in the oblast"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* compose modal */}
      {showCompose && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
          <div style={{ background: card, borderRadius: 12, width: "100%", maxWidth: 520, padding: 24, border: `1px solid ${border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <span style={{ fontWeight: 700, fontSize: 19 }}>{t.newPostModal}</span>
              <button onClick={() => { setShowCompose(false); setComposeError(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: textSoft }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: 12, color: textSoft, marginBottom: 6, fontWeight: 700 }}>{t.section}</div>
            <select
              value={composeSection}
              onChange={e => setComposeSection(e.target.value)}
              style={{ width: "100%", padding: "9px 10px", border: `1px solid ${border}`, borderRadius: 8, marginBottom: 16, fontSize: 14, fontFamily: "inherit", background: inputBg, color: text }}
            >
              {SECTION_DEFS.map(s => <option key={s.id} value={s.id}>r/{sectionName(s.id)}</option>)}
            </select>

            <div style={{ fontSize: 12, color: textSoft, marginBottom: 6, fontWeight: 700 }}>{t.title}</div>
            <input
              value={composeTitle}
              onChange={e => { setComposeTitle(e.target.value); if (composeError) setComposeError(""); }}
              placeholder={t.titlePlaceholder}
              style={{ width: "100%", padding: "9px 10px", border: `1px solid ${composeError ? danger : border}`, borderRadius: 8, marginBottom: composeError ? 6 : 16, fontSize: 14, fontFamily: "inherit", background: inputBg, color: text }}
            />
            {composeError && <div style={{ color: danger, fontSize: 12.5, marginBottom: 16 }}>{composeError}</div>}

            <div style={{ fontSize: 12, color: textSoft, marginBottom: 6, fontWeight: 700 }}>{t.details}</div>
            <textarea
              value={composeBody}
              onChange={e => setComposeBody(e.target.value)}
              placeholder={t.detailsPlaceholder}
              rows={4}
              style={{ width: "100%", padding: "9px 10px", border: `1px solid ${border}`, borderRadius: 8, marginBottom: 18, fontSize: 14, fontFamily: "inherit", resize: "vertical", background: inputBg, color: text }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => { setShowCompose(false); setComposeError(""); }}
                style={{ background: "none", border: `1px solid ${border}`, borderRadius: 999, padding: "9px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                {t.cancel}
              </button>
              <button
                onClick={submitPost}
                style={{ background: orange, color: "#fff", border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                {t.post}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1000, margin: "20px auto 0", padding: "0 20px 30px" }}>
        <div style={{ background: card, border: `1px solid ${orange}`, borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 12.5, color: orange, marginBottom: 8, textTransform: "uppercase" }}>
            <AlertTriangle size={14} />
            {t.disclaimerTitle}
          </div>
          {t.disclaimer.map((paragraph, i) => (
            <p
              key={i}
              style={{
                fontSize: 12.5,
                color: textSoft,
                lineHeight: 1.6,
                fontWeight: paragraph.bold ? 700 : 400,
                margin: i === t.disclaimer.length - 1 ? 0 : "0 0 8px",
              }}
            >
              {paragraph.text}
            </p>
          ))}
        </div>
      </div>

    </div>
  );
}
