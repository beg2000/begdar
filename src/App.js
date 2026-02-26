import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE CONFIG ─────────────────────────────────────────────────────────
// Replace these with your real Supabase project values
const SUPABASE_URL  = process.env.REACT_APP_SUPABASE_URL  || "YOUR_SUPABASE_URL";
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON || "YOUR_SUPABASE_ANON_KEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const COUNTRY_NAMES = {
  "4":"Afghanistan","8":"Albania","12":"Algeria","24":"Angola","32":"Argentina",
  "36":"Australia","40":"Austria","50":"Bangladesh","56":"Belgium","68":"Bolivia",
  "76":"Brazil","100":"Bulgaria","116":"Cambodia","120":"Cameroon","124":"Canada",
  "152":"Chile","156":"China","170":"Colombia","180":"DR Congo","188":"Costa Rica",
  "191":"Croatia","192":"Cuba","203":"Czech Republic","208":"Denmark","218":"Ecuador",
  "818":"Egypt","231":"Ethiopia","246":"Finland","250":"France","276":"Germany",
  "288":"Ghana","300":"Greece","320":"Guatemala","332":"Haiti","340":"Honduras",
  "348":"Hungary","356":"India","360":"Indonesia","364":"Iran","368":"Iraq",
  "372":"Ireland","376":"Israel","380":"Italy","388":"Jamaica","392":"Japan",
  "400":"Jordan","398":"Kazakhstan","404":"Kenya","408":"North Korea","410":"South Korea",
  "414":"Kuwait","422":"Lebanon","434":"Libya","484":"Mexico","504":"Morocco",
  "508":"Mozambique","524":"Nepal","528":"Netherlands","554":"New Zealand",
  "566":"Nigeria","578":"Norway","586":"Pakistan","275":"Palestine","591":"Panama",
  "604":"Peru","608":"Philippines","616":"Poland","620":"Portugal","634":"Qatar",
  "642":"Romania","643":"Russia","682":"Saudi Arabia","686":"Senegal","706":"Somalia",
  "710":"South Africa","724":"Spain","144":"Sri Lanka","729":"Sudan","752":"Sweden",
  "756":"Switzerland","760":"Syria","764":"Thailand","792":"Turkey","800":"Uganda",
  "804":"Ukraine","784":"UAE","826":"United Kingdom","840":"United States",
  "858":"Uruguay","862":"Venezuela","704":"Vietnam","887":"Yemen","716":"Zimbabwe",
  "703":"Slovakia","233":"Estonia","428":"Latvia","440":"Lithuania",
};

const CONFLICT_HEAT = {
  "804":10,"275":10,"376":10,"422":9,"643":9,"364":8,"760":8,"887":8,
  "729":7,"180":7,"706":7,"434":6,"50":5,"586":5,"566":4,"704":3,"608":3,
};

const SEV = {
  critical:{ color:"#ef4444", bg:"rgba(239,68,68,0.12)",  label:"CRITICAL" },
  high:    { color:"#f97316", bg:"rgba(249,115,22,0.12)", label:"HIGH"     },
  medium:  { color:"#eab308", bg:"rgba(234,179,8,0.10)",  label:"MEDIUM"   },
  low:     { color:"#22d3ee", bg:"rgba(34,211,238,0.10)", label:"LOW"      },
  info:    { color:"#60a5fa", bg:"rgba(96,165,250,0.10)", label:"INFO"     },
};

const TYPES = {
  earthquake:{ icon:"〰", label:"Seismic"   },
  conflict:  { icon:"⚔",  label:"Conflict"  },
  weather:   { icon:"⛈", label:"Weather"   },
  disaster:  { icon:"🔥", label:"Disaster"  },
  political: { icon:"🏛", label:"Political" },
  health:    { icon:"🏥", label:"Health"    },
  violence:  { icon:"💥", label:"Violence"  },
  userpost:  { icon:"✍",  label:"Report"    },
  info:      { icon:"📰", label:"News"      },
};

const guessCat = t => {
  t = (t||"").toLowerCase();
  if (/earthquake|quake|seismic|tremor/.test(t))               return "earthquake";
  if (/war|attack|airstrike|missile|military|bomb|kill|troops|battle|armed|shoot|terror/.test(t)) return "conflict";
  if (/hurricane|typhoon|cyclone|flood|tornado|storm/.test(t)) return "weather";
  if (/fire|eruption|volcano|tsunami|landslide/.test(t))       return "disaster";
  if (/election|coup|protest|riot|government|minister|president/.test(t)) return "political";
  if (/virus|outbreak|disease|epidemic|pandemic/.test(t))      return "health";
  if (/shooting|violence|assault|gunfire/.test(t))             return "violence";
  return "info";
};

const magToSev = m => m>=7?"critical":m>=6?"high":m>=5?"medium":"low";
const timeAgo = ts => {
  if (!ts) return "";
  const m = Math.floor((Date.now()-new Date(ts).getTime())/60000);
  if (m<1) return "just now";
  if (m<60) return `${m}m ago`;
  if (m<1440) return `${Math.floor(m/60)}h ago`;
  return `${Math.floor(m/1440)}d ago`;
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function BEGDAR() {
  const mapRef  = useRef(null);
  const svgRef  = useRef(null);
  const projRef = useRef(null);

  // Data
  const [worldData,       setWorldData]       = useState(null);
  const [quakes,          setQuakes]          = useState([]);
  const [gdeltNews,       setGdeltNews]       = useState([]);
  const [reliefNews,      setReliefNews]      = useState([]);
  const [conflicts,       setConflicts]       = useState([]);
  const [userPosts,       setUserPosts]       = useState([]);
  const [allEvents,       setAllEvents]       = useState([]);

  // Country panel
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [countryNews,     setCountryNews]     = useState([]);
  const [countryLoading,  setCountryLoading]  = useState(false);
  const [aiSummary,       setAiSummary]       = useState("");
  const [aiLoading,       setAiLoading]       = useState(false);

  // UI
  const [tab,             setTab]             = useState("feed"); // feed | submit | account
  const [filter,          setFilter]          = useState("all");
  const [search,          setSearch]          = useState("");
  const [time,            setTime]            = useState(new Date());
  const [alert,           setAlert]           = useState(null);
  const [tooltip,         setTooltip]         = useState(null);
  const [mapReady,        setMapReady]        = useState(false);
  const [sources,         setSources]         = useState({ usgs:"…", gdelt:"…", reliefweb:"…", realtime:"…" });
  const [newEventFlash,   setNewEventFlash]   = useState(false);

  // Auth
  const [user,            setUser]            = useState(null);
  const [authMode,        setAuthMode]        = useState(null); // "login" | "register" | null
  const [authEmail,       setAuthEmail]       = useState("");
  const [authPass,        setAuthPass]        = useState("");
  const [authName,        setAuthName]        = useState("");
  const [authError,       setAuthError]       = useState("");
  const [authLoading,     setAuthLoading]     = useState(false);

  // News submission
  const [submitTitle,     setSubmitTitle]     = useState("");
  const [submitBody,      setSubmitBody]      = useState("");
  const [submitLocation,  setSubmitLocation]  = useState("");
  const [submitType,      setSubmitType]      = useState("info");
  const [submitSev,       setSubmitSev]       = useState("medium");
  const [submitLoading,   setSubmitLoading]   = useState(false);
  const [submitSuccess,   setSubmitSuccess]   = useState(false);

  // ── Clock ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Auth listener ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data?.session?.user || null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => listener?.subscription?.unsubscribe();
  }, []);

  // ── World atlas ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => r.json()).then(setWorldData);
  }, []);

  // ── USGS Earthquakes ─────────────────────────────────────────────────────────
  const fetchUSGS = useCallback(async () => {
    try {
      const r = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson");
      const d = await r.json();
      setQuakes((d.features||[]).slice(0,60).map(f => ({
        id: f.id, title: f.properties.title, type: "earthquake",
        severity: magToSev(f.properties.mag), mag: f.properties.mag,
        depth: f.geometry?.coordinates[2],
        lat: f.geometry?.coordinates[1], lng: f.geometry?.coordinates[0],
        location: f.properties.place,
        detail: `Magnitude ${f.properties.mag} at depth ${f.geometry?.coordinates[2]}km. ${f.properties.tsunami ? "⚠️ TSUNAMI WARNING ISSUED." : "No tsunami warning."}`,
        url: f.properties.url, source: "USGS",
        timeRaw: f.properties.time, timeStr: timeAgo(f.properties.time),
      })));
      setSources(s => ({...s, usgs:"live"}));
    } catch { setSources(s => ({...s, usgs:"error"})); }
  }, []);

  // ── GDELT News ───────────────────────────────────────────────────────────────
  const fetchGDELT = useCallback(async () => {
    try {
      const url = "https://api.gdeltproject.org/api/v2/doc/doc?query=war+conflict+attack+military+disaster+crisis+explosion+protest&mode=artlist&maxrecords=50&format=json&timespan=24h";
      const d = await (await fetch(url)).json();
      setGdeltNews((d.articles||[]).slice(0,50).map((a,i) => {
        const cat = guessCat(a.title);
        return {
          id: `g${i}_${a.seendatetime}`, title: a.title||"Global Event",
          type: cat, severity: ["conflict","violence"].includes(cat)?"high":"medium",
          location: a.sourcecountry||"Global",
          detail: `Reported by ${a.domain||"Unknown"}`,
          url: a.url, source: a.domain||"GDELT",
          tone: a.tone ? parseFloat(a.tone).toFixed(1) : null,
          lat: null, lng: null, timeRaw: Date.now(), timeStr: "today",
        };
      }));
      setSources(s => ({...s, gdelt:"live"}));
    } catch { setSources(s => ({...s, gdelt:"error"})); }
  }, []);

  // ── ReliefWeb (UN Humanitarian) ──────────────────────────────────────────────
  const fetchReliefWeb = useCallback(async () => {
    try {
      const url = "https://api.reliefweb.int/v1/reports?appname=begdar&limit=20&filter[field]=type&filter[value]=News+and+Press+Release&sort[]=date:desc&profile=full";
      const d = await (await fetch(url)).json();
      const items = (d.data||[]).map((item,i) => ({
        id: `rw${i}_${item.id}`,
        title: item.fields?.title || "Humanitarian Report",
        type: guessCat(item.fields?.title),
        severity: "medium",
        location: item.fields?.country?.map(c=>c.name).join(", ") || "Global",
        detail: item.fields?.body?.slice(0,200) || "UN Humanitarian report.",
        url: item.fields?.url_alias ? `https://reliefweb.int${item.fields.url_alias}` : "https://reliefweb.int",
        source: "ReliefWeb/UN",
        timeRaw: new Date(item.fields?.date?.created||Date.now()).getTime(),
        timeStr: timeAgo(item.fields?.date?.created),
      }));
      setReliefNews(items);
      setSources(s => ({...s, reliefweb:"live"}));
    } catch { setSources(s => ({...s, reliefweb:"error"})); }
  }, []);

  // ── ACLED Demo conflicts ─────────────────────────────────────────────────────
  const loadACLED = useCallback(() => {
    setConflicts([
      { id:"a1",  title:"Russian Forces vs Ukrainian Army — Kharkiv Front",     type:"conflict", severity:"critical", location:"Kharkiv, Ukraine",    lat:49.9, lng:36.2,  fatalities:12, source:"ACLED", timeStr:"3h ago",  timeRaw:Date.now()-10800000, detail:"Ongoing artillery exchanges along the front line. Urban combat in northern suburbs.", url:"https://acleddata.com" },
      { id:"a2",  title:"IDF Airstrike Operations — Northern Gaza",              type:"conflict", severity:"critical", location:"Gaza Strip",           lat:31.5, lng:34.4,  fatalities:34, source:"ACLED", timeStr:"1h ago",  timeRaw:Date.now()-3600000,  detail:"Multiple strikes on residential areas. Humanitarian corridors remain blocked.", url:"https://acleddata.com" },
      { id:"a3",  title:"Houthi Drone Strike — Red Sea Shipping Lane",           type:"conflict", severity:"high",     location:"Red Sea",              lat:15.0, lng:42.5,  fatalities:0,  source:"ACLED", timeStr:"5h ago",  timeRaw:Date.now()-18000000, detail:"Commercial vessel struck near Bab al-Mandab Strait.", url:"https://acleddata.com" },
      { id:"a4",  title:"RSF vs SAF Armed Clashes — Khartoum",                  type:"conflict", severity:"critical", location:"Khartoum, Sudan",      lat:15.5, lng:32.5,  fatalities:28, source:"ACLED", timeStr:"8h ago",  timeRaw:Date.now()-28800000, detail:"RSF advancing in residential districts. 40,000 displaced this week.", url:"https://acleddata.com" },
      { id:"a5",  title:"Myanmar Junta Airstrikes — Shan State",                type:"conflict", severity:"high",     location:"Lashio, Myanmar",      lat:22.9, lng:97.7,  fatalities:9,  source:"ACLED", timeStr:"12h ago", timeRaw:Date.now()-43200000, detail:"Military airstrikes on resistance towns. Three villages evacuated.", url:"https://acleddata.com" },
      { id:"a6",  title:"IED Explosion — Baghdad Government District",          type:"violence", severity:"high",     location:"Baghdad, Iraq",        lat:33.3, lng:44.4,  fatalities:4,  source:"ACLED", timeStr:"6h ago",  timeRaw:Date.now()-21600000, detail:"Four civilians wounded in IED detonation.", url:"https://acleddata.com" },
      { id:"a7",  title:"Mass Protest — Anti-Government March, Tbilisi",        type:"political",severity:"medium",   location:"Tbilisi, Georgia",     lat:41.7, lng:44.8,  fatalities:0,  source:"ACLED", timeStr:"2h ago",  timeRaw:Date.now()-7200000,  detail:"Tens of thousands demand EU alignment. Police deployed tear gas.", url:"https://acleddata.com" },
      { id:"a8",  title:"Al-Shabaab Suicide Bombing — Mogadishu",               type:"conflict", severity:"high",     location:"Mogadishu, Somalia",   lat:2.0,  lng:45.3,  fatalities:7,  source:"ACLED", timeStr:"14h ago", timeRaw:Date.now()-50400000, detail:"Seven soldiers killed. Attack claimed by Al-Shabaab.", url:"https://acleddata.com" },
      { id:"a9",  title:"Gang Violence — G9 Coalition, Port-au-Prince",         type:"violence", severity:"high",     location:"Port-au-Prince, Haiti", lat:18.5,lng:-72.3, fatalities:15, source:"ACLED", timeStr:"20h ago", timeRaw:Date.now()-72000000, detail:"G9 controls ~80% of the capital. Mass displacement ongoing.", url:"https://acleddata.com" },
      { id:"a10", title:"Hezbollah vs IDF — Cross-Border Rocket Exchange",      type:"conflict", severity:"critical", location:"South Lebanon",         lat:33.3, lng:35.5,  fatalities:3,  source:"ACLED", timeStr:"4h ago",  timeRaw:Date.now()-14400000, detail:"Cross-border fire. Lebanese border villages evacuated.", url:"https://acleddata.com" },
      { id:"a11", title:"Russian Cruise Missile Strike — Odesa Port",           type:"conflict", severity:"critical", location:"Odesa, Ukraine",        lat:46.4, lng:30.7,  fatalities:2,  source:"ACLED", timeStr:"7h ago",  timeRaw:Date.now()-25200000, detail:"Port and grain storage targeted. 2 killed, 8 wounded.", url:"https://acleddata.com" },
    ]);
  }, []);

  // ── Supabase: Load + Subscribe to user posts ─────────────────────────────────
  const loadUserPosts = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("news_posts")
        .select("*, profiles(username, avatar_url)")
        .eq("approved", true)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) {
        setUserPosts(data.map(p => ({
          id: `up_${p.id}`,
          title: p.title,
          type: p.type || "userpost",
          severity: p.severity || "medium",
          location: p.location || "Unknown",
          detail: p.body || "",
          lat: p.lat || null,
          lng: p.lng || null,
          source: `@${p.profiles?.username || "user"}`,
          url: null,
          timeRaw: new Date(p.created_at).getTime(),
          timeStr: timeAgo(p.created_at),
          isUserPost: true,
          username: p.profiles?.username || "user",
        })));
        setSources(s => ({...s, realtime:"live"}));
      }
    } catch { setSources(s => ({...s, realtime:"error"})); }
  }, []);

  useEffect(() => {
    // Initial loads
    fetchUSGS(); fetchGDELT(); fetchReliefWeb(); loadACLED(); loadUserPosts();

    // Refresh intervals
    const t1 = setInterval(fetchUSGS,    60 * 1000);       // every 1 min
    const t2 = setInterval(fetchGDELT,   5  * 60 * 1000);  // every 5 min
    const t3 = setInterval(fetchReliefWeb, 10 * 60 * 1000);// every 10 min

    // Supabase real-time subscription
    const channel = supabase
      .channel("news_posts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "news_posts", filter: "approved=eq.true" },
        payload => {
          const p = payload.new;
          setUserPosts(prev => [{
            id: `up_${p.id}`,
            title: p.title, type: p.type || "userpost",
            severity: p.severity || "medium", location: p.location || "Unknown",
            detail: p.body || "", lat: p.lat, lng: p.lng,
            source: `@user`, url: null,
            timeRaw: new Date(p.created_at).getTime(),
            timeStr: "just now", isUserPost: true, username: "user",
          }, ...prev]);
          setNewEventFlash(true);
          setTimeout(() => setNewEventFlash(false), 3000);
        }
      ).subscribe();

    return () => {
      clearInterval(t1); clearInterval(t2); clearInterval(t3);
      supabase.removeChannel(channel);
    };
  }, [fetchUSGS, fetchGDELT, fetchReliefWeb, loadACLED, loadUserPosts]);

  // Merge all events
  useEffect(() => {
    const merged = [...userPosts, ...quakes, ...conflicts, ...gdeltNews, ...reliefNews]
      .sort((a,b) => (b.timeRaw||0) - (a.timeRaw||0));
    setAllEvents(merged);
    const crit = merged.find(e => e.severity === "critical");
    if (crit) { setAlert(crit.title); setTimeout(() => setAlert(null), 8000); }
  }, [quakes, conflicts, gdeltNews, reliefNews, userPosts]);

  // ── Country news + AI ────────────────────────────────────────────────────────
  const openCountry = useCallback(async (name) => {
    setSelectedCountry(name);
    setTab("feed");
    setCountryLoading(true);
    setCountryNews([]); setAiSummary("");
    try {
      const q = encodeURIComponent(name);
      const d = await (await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=20&format=json&timespan=7d`)).json();
      const parsed = (d.articles||[]).slice(0,15).map((a,i) => ({
        id:`cn${i}`, title:a.title||"No title", type:guessCat(a.title),
        url:a.url, source:a.domain||"Unknown",
        tone:a.tone?parseFloat(a.tone).toFixed(1):null, timeStr:"this week",
      }));
      setCountryNews(parsed);
      if (parsed.length > 0) {
        setAiLoading(true);
        try {
          const headlines = parsed.slice(0,8).map(a=>`- ${a.title}`).join("\n");
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
              model:"claude-sonnet-4-20250514", max_tokens:1000,
              messages:[{ role:"user", content:`You are a geopolitical analyst. Based on these recent headlines from ${name}, write a clear 3-sentence situation summary for a global news dashboard. Be factual and neutral.\n\nHeadlines:\n${headlines}\n\nWrite ONLY the 3-sentence summary.` }]
            })
          });
          const data = await res.json();
          setAiSummary(data.content?.[0]?.text || "Summary unavailable.");
        } catch { setAiSummary("AI summary unavailable."); }
        setAiLoading(false);
      }
    } catch { setCountryNews([]); }
    setCountryLoading(false);
  }, []);

  // ── Auth handlers ─────────────────────────────────────────────────────────────
  const handleAuth = async () => {
    setAuthError(""); setAuthLoading(true);
    try {
      if (authMode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail, password: authPass,
          options: { data: { username: authName } }
        });
        if (error) throw error;
        if (data.user) {
          await supabase.from("profiles").upsert({ id: data.user.id, username: authName, email: authEmail });
        }
        setAuthMode(null); setAuthEmail(""); setAuthPass(""); setAuthName("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPass });
        if (error) throw error;
        setAuthMode(null); setAuthEmail(""); setAuthPass("");
      }
    } catch (e) { setAuthError(e.message); }
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut(); setUser(null); setTab("feed");
  };

  // ── Submit news ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!submitTitle.trim()) return;
    setSubmitLoading(true);
    try {
      const { error } = await supabase.from("news_posts").insert({
        title: submitTitle, body: submitBody, location: submitLocation,
        type: submitType, severity: submitSev,
        user_id: user.id, approved: false, // admin approves
      });
      if (error) throw error;
      setSubmitTitle(""); setSubmitBody(""); setSubmitLocation("");
      setSubmitType("info"); setSubmitSev("medium");
      setSubmitSuccess(true); setTimeout(() => setSubmitSuccess(false), 4000);
    } catch (e) { alert("Error submitting: " + e.message); }
    setSubmitLoading(false);
  };

  // ── D3 Map ────────────────────────────────────────────────────────────────────
  const buildMap = useCallback(() => {
    if (!worldData || !mapRef.current || !window.topojson) return;
    const W = mapRef.current.clientWidth || 900;
    const H = mapRef.current.clientHeight || 500;
    const svg = d3.select(svgRef.current).attr("width",W).attr("height",H);
    svg.selectAll("*").remove();
    const proj = d3.geoNaturalEarth1().scale(W/6.3).translate([W/2,H/2]);
    const gen  = d3.geoPath().projection(proj);
    projRef.current = proj;

    svg.append("rect").attr("width",W).attr("height",H).attr("fill","#0d1117");
    svg.append("path").datum({type:"Sphere"}).attr("d",gen).attr("fill","#111827").attr("stroke","rgba(255,255,255,0.05)").attr("stroke-width",1);
    svg.append("path").datum(d3.geoGraticule()()).attr("d",gen).attr("fill","none").attr("stroke","rgba(255,255,255,0.025)").attr("stroke-width",0.5);

    const heatColor = id => {
      const h = CONFLICT_HEAT[String(id)];
      if (!h) return "#1e293b";
      if (h >= 9) return "#7f1d1d";
      if (h >= 7) return "#7c2d12";
      if (h >= 5) return "#713f12";
      return "#1a3a1a";
    };

    const countries = window.topojson.feature(worldData, worldData.objects.countries);
    svg.selectAll(".cty").data(countries.features).enter().append("path")
      .attr("class","cty").attr("d",gen)
      .attr("fill",d=>heatColor(d.id))
      .attr("stroke","rgba(255,255,255,0.07)").attr("stroke-width",0.4)
      .style("cursor","pointer")
      .on("mouseover",function(ev,d){
        d3.select(this).attr("fill","#1d4ed8").attr("stroke","rgba(96,165,250,0.5)").attr("stroke-width",0.8);
        const name = COUNTRY_NAMES[String(d.id)];
        if (name){ const rect=mapRef.current.getBoundingClientRect(); setTooltip({x:ev.clientX-rect.left,y:ev.clientY-rect.top,name}); }
      })
      .on("mouseout",function(ev,d){
        d3.select(this).attr("fill",heatColor(d.id)).attr("stroke","rgba(255,255,255,0.07)").attr("stroke-width",0.4);
        setTooltip(null);
      })
      .on("click",(ev,d)=>{ const name=COUNTRY_NAMES[String(d.id)]; if(name) openCountry(name); });

    svg.append("path").datum(window.topojson.mesh(worldData,worldData.objects.countries,(a,b)=>a!==b))
      .attr("d",gen).attr("fill","none").attr("stroke","rgba(255,255,255,0.07)").attr("stroke-width",0.3);

    setMapReady(true);
  }, [worldData, openCountry]);

  useEffect(() => { buildMap(); }, [buildMap]);

  // Plot event dots
  useEffect(() => {
    if (!mapReady || !projRef.current || !svgRef.current) return;
    const proj = projRef.current;
    const svg  = d3.select(svgRef.current);
    svg.selectAll(".edot,.ering").remove();
    [...quakes,...conflicts,...userPosts.filter(p=>p.lat&&p.lng)].forEach(ev => {
      const [px,py] = proj([ev.lng,ev.lat]);
      if (!px||!py||px<0||py<0) return;
      const col = SEV[ev.severity]?.color || "#fff";
      const r   = ev.type==="earthquake" ? Math.max(4,(ev.mag||5)*1.4) : ev.severity==="critical"?8:ev.severity==="high"?6:5;
      svg.append("circle").attr("class","ering").attr("cx",px).attr("cy",py).attr("r",r+8)
        .attr("fill","none").attr("stroke",col).attr("stroke-width",1.5).attr("opacity",0.18);
      svg.append("circle").attr("class","edot").attr("cx",px).attr("cy",py).attr("r",r)
        .attr("fill",col).attr("opacity",0.9).attr("stroke","rgba(0,0,0,0.5)").attr("stroke-width",1)
        .style("cursor","pointer")
        .on("mouseover",me=>{ const rect=mapRef.current.getBoundingClientRect(); setTooltip({x:me.clientX-rect.left,y:me.clientY-rect.top,ev}); })
        .on("mouseout",()=>setTooltip(null));
    });
  }, [quakes, conflicts, userPosts, mapReady]);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const sl = search.toLowerCase();
  const listEvents = selectedCountry && countryNews.length>0 ? countryNews : allEvents;
  const filtered = listEvents.filter(e => {
    if (filter !== "all" && e.type !== filter) return false;
    if (sl && !e.title?.toLowerCase().includes(sl) && !(e.location||"").toLowerCase().includes(sl)) return false;
    return true;
  });

  const critCount  = allEvents.filter(e=>e.severity==="critical").length;
  const totalLive  = quakes.length + gdeltNews.length + reliefNews.length + conflicts.length + userPosts.length;

  const srcDot = key => ({
    live:"#22c55e", connecting:"#3b82f6", demo:"#f59e0b", error:"#ef4444","…":"#6b7280"
  }[sources[key]]||"#6b7280");

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:"'DM Mono','Fira Code','Courier New',monospace",background:"#0d1117",color:"#e6edf3",height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* ── AUTH MODAL ── */}
      {authMode && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,backdropFilter:"blur(4px)"}}
          onClick={e=>{ if(e.target===e.currentTarget) setAuthMode(null); }}>
          <div style={{background:"#161b22",border:"1px solid #30363d",borderRadius:"12px",padding:"28px",width:"360px",boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
            <div style={{fontSize:"16px",fontWeight:"700",color:"#f0f6fc",marginBottom:"4px",letterSpacing:"0.1em"}}>
              {authMode==="register" ? "Create Account" : "Sign In"}
            </div>
            <div style={{fontSize:"11px",color:"#484f58",marginBottom:"20px"}}>
              {authMode==="register" ? "Join BEGDAR to submit news reports" : "Access your BEGDAR account"}
            </div>

            {authMode==="register" && (
              <div style={{marginBottom:"12px"}}>
                <div style={{fontSize:"11px",color:"#8b949e",marginBottom:"5px"}}>Username</div>
                <input value={authName} onChange={e=>setAuthName(e.target.value)} placeholder="your_username"
                  style={{width:"100%",background:"#0d1117",border:"1px solid #30363d",borderRadius:"6px",padding:"9px 12px",color:"#e6edf3",fontSize:"13px",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
                  onFocus={e=>e.target.style.borderColor="#388bfd"} onBlur={e=>e.target.style.borderColor="#30363d"}/>
              </div>
            )}

            <div style={{marginBottom:"12px"}}>
              <div style={{fontSize:"11px",color:"#8b949e",marginBottom:"5px"}}>Email</div>
              <input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="you@example.com" type="email"
                style={{width:"100%",background:"#0d1117",border:"1px solid #30363d",borderRadius:"6px",padding:"9px 12px",color:"#e6edf3",fontSize:"13px",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
                onFocus={e=>e.target.style.borderColor="#388bfd"} onBlur={e=>e.target.style.borderColor="#30363d"}/>
            </div>

            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"11px",color:"#8b949e",marginBottom:"5px"}}>Password</div>
              <input value={authPass} onChange={e=>setAuthPass(e.target.value)} placeholder="••••••••" type="password"
                style={{width:"100%",background:"#0d1117",border:"1px solid #30363d",borderRadius:"6px",padding:"9px 12px",color:"#e6edf3",fontSize:"13px",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
                onFocus={e=>e.target.style.borderColor="#388bfd"} onBlur={e=>e.target.style.borderColor="#30363d"}
                onKeyDown={e=>e.key==="Enter"&&handleAuth()}/>
            </div>

            {authError && <div style={{fontSize:"11px",color:"#ef4444",marginBottom:"12px",padding:"8px",background:"rgba(239,68,68,0.1)",borderRadius:"6px"}}>{authError}</div>}

            <button onClick={handleAuth} disabled={authLoading} style={{width:"100%",padding:"10px",background:authLoading?"#1f6feb88":"#1f6feb",border:"none",borderRadius:"8px",color:"#fff",fontSize:"13px",fontWeight:"600",cursor:"pointer",fontFamily:"inherit",marginBottom:"12px"}}>
              {authLoading ? "..." : authMode==="register" ? "Create Account" : "Sign In"}
            </button>

            <div style={{textAlign:"center",fontSize:"11px",color:"#484f58"}}>
              {authMode==="register" ? (
                <span>Already have an account? <button onClick={()=>{setAuthMode("login");setAuthError("");}} style={{background:"none",border:"none",color:"#58a6ff",cursor:"pointer",fontFamily:"inherit",fontSize:"11px"}}>Sign in</button></span>
              ) : (
                <span>No account? <button onClick={()=>{setAuthMode("register");setAuthError("");}} style={{background:"none",border:"none",color:"#58a6ff",cursor:"pointer",fontFamily:"inherit",fontSize:"11px"}}>Create one</button></span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BREAKING BANNER ── */}
      {alert && (
        <div style={{background:"#7f1d1d",borderBottom:"1px solid #ef4444",color:"#fca5a5",padding:"7px 20px",fontSize:"12px",fontWeight:"600",textAlign:"center",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",gap:"10px"}}>
          <span style={{background:"#ef4444",color:"#fff",fontSize:"9px",fontWeight:"bold",padding:"2px 7px",borderRadius:"4px",letterSpacing:"0.1em",animation:"pulse 1s infinite"}}>BREAKING</span>
          {alert}
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 18px",background:"#161b22",borderBottom:"1px solid #30363d",flexShrink:0,gap:"14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"11px",flexShrink:0}}>
          <div style={{width:"36px",height:"36px",background:"linear-gradient(135deg,#ef4444,#dc2626)",borderRadius:"10px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px",boxShadow:"0 0 18px rgba(239,68,68,0.35)"}}>🌐</div>
          <div>
            <div style={{fontSize:"19px",fontWeight:"700",color:"#f0f6fc",letterSpacing:"0.22em"}}>BEGDAR</div>
            <div style={{fontSize:"8px",color:"#484f58",letterSpacing:"0.3em",marginTop:"1px"}}>GLOBAL SITUATION MONITOR</div>
          </div>
        </div>

        {/* Search */}
        <div style={{position:"relative",flex:1,maxWidth:"380px"}}>
          <span style={{position:"absolute",left:"11px",top:"50%",transform:"translateY(-50%)",color:"#484f58",fontSize:"13px"}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search country, city, event..."
            style={{width:"100%",background:"#0d1117",border:"1px solid #30363d",borderRadius:"8px",padding:"8px 34px",color:"#e6edf3",fontSize:"12px",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
            onFocus={e=>e.target.style.borderColor="#388bfd"} onBlur={e=>e.target.style.borderColor="#30363d"}/>
          {search && <button onClick={()=>setSearch("")} style={{position:"absolute",right:"10px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#484f58",cursor:"pointer",fontSize:"16px"}}>×</button>}
        </div>

        {/* Right */}
        <div style={{display:"flex",gap:"10px",alignItems:"center",flexShrink:0}}>
          {/* Source dots */}
          <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
            {["usgs","gdelt","reliefweb","realtime"].map(k=>(
              <div key={k} title={k.toUpperCase()} style={{display:"flex",alignItems:"center",gap:"4px",padding:"4px 7px",background:"#0d1117",border:"1px solid #21262d",borderRadius:"5px"}}>
                <div style={{width:"6px",height:"6px",borderRadius:"50%",background:srcDot(k),boxShadow:`0 0 5px ${srcDot(k)}`,animation:sources[k]==="live"?"pulse 2s infinite":"none"}}/>
                <span style={{fontSize:"9px",color:"#484f58",letterSpacing:"0.06em"}}>{k==="reliefweb"?"UN":k.toUpperCase()}</span>
              </div>
            ))}
          </div>

          {/* Real-time flash */}
          {newEventFlash && (
            <div style={{padding:"4px 10px",background:"rgba(34,197,94,0.15)",border:"1px solid rgba(34,197,94,0.4)",borderRadius:"6px",fontSize:"11px",color:"#22c55e",fontWeight:"600",animation:"fadeIn 0.3s"}}>
              ⚡ NEW EVENT
            </div>
          )}

          {/* Critical */}
          {critCount > 0 && (
            <div style={{display:"flex",alignItems:"center",gap:"6px",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.35)",borderRadius:"7px",padding:"5px 11px"}}>
              <div style={{width:"7px",height:"7px",borderRadius:"50%",background:"#ef4444",animation:"pulse 1s infinite"}}/>
              <span style={{fontSize:"11px",color:"#ef4444",fontWeight:"700"}}>{critCount} CRITICAL</span>
            </div>
          )}

          {/* Auth */}
          {user ? (
            <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
              <div style={{padding:"5px 10px",background:"#0d1117",border:"1px solid #30363d",borderRadius:"7px",fontSize:"11px",color:"#8b949e"}}>
                👤 {user.user_metadata?.username || user.email?.split("@")[0]}
              </div>
              <button onClick={handleLogout} style={{padding:"5px 10px",background:"transparent",border:"1px solid #30363d",borderRadius:"7px",color:"#8b949e",cursor:"pointer",fontSize:"11px",fontFamily:"inherit"}}>Sign out</button>
            </div>
          ) : (
            <div style={{display:"flex",gap:"6px"}}>
              <button onClick={()=>{setAuthMode("login");setAuthError("");}} style={{padding:"6px 12px",background:"transparent",border:"1px solid #30363d",borderRadius:"7px",color:"#8b949e",cursor:"pointer",fontSize:"11px",fontFamily:"inherit",fontWeight:"500"}}>Sign in</button>
              <button onClick={()=>{setAuthMode("register");setAuthError("");}} style={{padding:"6px 12px",background:"#238636",border:"1px solid #2ea043",borderRadius:"7px",color:"#fff",cursor:"pointer",fontSize:"11px",fontFamily:"inherit",fontWeight:"600"}}>Register</button>
            </div>
          )}

          {/* Clock */}
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:"15px",color:"#58a6ff",fontWeight:"600",fontVariantNumeric:"tabular-nums"}}>{time.toISOString().slice(11,19)} <span style={{fontSize:"9px",color:"#484f58"}}>UTC</span></div>
            <div style={{fontSize:"8px",color:"#30363d",letterSpacing:"0.1em"}}>{time.toDateString().toUpperCase()}</div>
          </div>
        </div>
      </header>

      {/* ── FILTER BAR ── */}
      <div style={{display:"flex",gap:"6px",padding:"7px 16px",background:"#161b22",borderBottom:"1px solid #21262d",flexShrink:0,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:"10px",color:"#484f58",marginRight:"4px",letterSpacing:"0.1em"}}>FILTER</span>
        {[["all","All"],["conflict","⚔ Conflict"],["earthquake","〰 Seismic"],["violence","💥 Violence"],["weather","⛈ Weather"],["disaster","🔥 Disaster"],["political","🏛 Political"],["userpost","✍ Reports"]].map(([f,lbl])=>(
          <button key={f} onClick={()=>setFilter(f)} style={{padding:"4px 11px",background:filter===f?"#1f6feb":"#0d1117",border:`1px solid ${filter===f?"#388bfd":"#30363d"}`,color:filter===f?"#fff":"#8b949e",borderRadius:"6px",cursor:"pointer",fontSize:"11px",fontFamily:"inherit",fontWeight:filter===f?"600":"400",transition:"all 0.15s"}}>{lbl}</button>
        ))}
        {selectedCountry && (
          <button onClick={()=>{setSelectedCountry(null);setCountryNews([]);setAiSummary("");}} style={{marginLeft:"auto",padding:"4px 11px",background:"#0d1117",border:"1px solid #30363d",color:"#8b949e",borderRadius:"6px",cursor:"pointer",fontSize:"11px",fontFamily:"inherit"}}>
            ← Global
          </button>
        )}
        <span style={{marginLeft:selectedCountry?"6px":"auto",fontSize:"10px",color:"#484f58"}}>
          {totalLive} live · {filtered.length} shown
        </span>
      </div>

      {/* ── BODY ── */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* MAP */}
        <div style={{flex:1,position:"relative",overflow:"hidden"}} ref={mapRef}>
          <TopojsonLoader onLoad={buildMap}/>
          <svg ref={svgRef} style={{width:"100%",height:"100%",display:"block"}}/>

          {/* Legend */}
          <div style={{position:"absolute",bottom:"14px",left:"14px",background:"rgba(22,27,34,0.93)",border:"1px solid #30363d",borderRadius:"10px",padding:"12px 14px",backdropFilter:"blur(8px)"}}>
            <div style={{fontSize:"10px",color:"#484f58",letterSpacing:"0.15em",marginBottom:"8px",fontWeight:"600"}}>CONFLICT INTENSITY</div>
            {[["#7f1d1d","Critical"],["#7c2d12","High tension"],["#713f12","Elevated"],["#1e293b","Stable"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"5px"}}>
                <div style={{width:"12px",height:"7px",borderRadius:"3px",background:c,border:"1px solid rgba(255,255,255,0.1)"}}/>
                <span style={{fontSize:"10px",color:"#8b949e"}}>{l}</span>
              </div>
            ))}
            <div style={{borderTop:"1px solid #21262d",marginTop:"8px",paddingTop:"8px"}}>
              {Object.entries(SEV).slice(0,4).map(([k,v])=>(
                <div key={k} style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"4px"}}>
                  <div style={{width:"8px",height:"8px",borderRadius:"50%",background:v.color}}/>
                  <span style={{fontSize:"10px",color:"#8b949e"}}>{v.label}</span>
                </div>
              ))}
            </div>
          </div>

          {!selectedCountry && (
            <div style={{position:"absolute",bottom:"14px",right:"14px",background:"rgba(22,27,34,0.88)",border:"1px solid #30363d",borderRadius:"8px",padding:"8px 13px",fontSize:"11px",color:"#8b949e",backdropFilter:"blur(8px)"}}>
              🖱 Click any country for news & AI analysis
            </div>
          )}

          {/* Tooltip */}
          {tooltip && (
            <div style={{position:"absolute",left:Math.min((tooltip.x||0)+16,(mapRef.current?.clientWidth||800)-250),top:Math.max((tooltip.y||0)-20,8),background:"#161b22",border:`1px solid ${tooltip.ev?SEV[tooltip.ev.severity]?.color:"#388bfd"}`,borderRadius:"10px",padding:"10px 14px",fontSize:"12px",maxWidth:"240px",pointerEvents:"none",zIndex:60,boxShadow:"0 8px 30px rgba(0,0,0,0.6)"}}>
              {tooltip.ev ? (
                <>
                  <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"6px"}}>
                    <span style={{fontSize:"15px"}}>{TYPES[tooltip.ev.type]?.icon}</span>
                    <span style={{color:SEV[tooltip.ev.severity]?.color,fontWeight:"700",fontSize:"11px",letterSpacing:"0.07em"}}>
                      {tooltip.ev.type==="earthquake"?`M${tooltip.ev.mag}`:SEV[tooltip.ev.severity]?.label}
                    </span>
                  </div>
                  <div style={{color:"#e6edf3",lineHeight:"1.5",marginBottom:"5px",fontSize:"11px"}}>{tooltip.ev.title}</div>
                  <div style={{color:"#8b949e",fontSize:"10px"}}>📍 {tooltip.ev.location}</div>
                  {tooltip.ev.fatalities>0 && <div style={{color:"#ef4444",fontSize:"10px",marginTop:"4px",fontWeight:"600"}}>☠ {tooltip.ev.fatalities} fatalities</div>}
                </>
              ):(
                <div style={{color:"#58a6ff",fontWeight:"700",fontSize:"13px"}}>{tooltip.name}</div>
              )}
            </div>
          )}
        </div>

        {/* ── SIDE PANEL ── */}
        <div style={{width:"365px",flexShrink:0,background:"#161b22",borderLeft:"1px solid #21262d",display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* Tabs */}
          <div style={{display:"flex",borderBottom:"1px solid #21262d",flexShrink:0}}>
            {[
              ["feed",    "📰 Feed"   ],
              ["submit",  "✍ Submit"  ],
              ["account", "👤 Account"],
            ].map(([t,lbl])=>(
              <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"10px 6px",background:tab===t?"#0d1117":"transparent",border:"none",borderBottom:tab===t?"2px solid #388bfd":"2px solid transparent",color:tab===t?"#f0f6fc":"#484f58",cursor:"pointer",fontSize:"11px",fontFamily:"inherit",fontWeight:tab===t?"600":"400",transition:"all 0.15s"}}>{lbl}</button>
            ))}
          </div>

          {/* Country header */}
          {selectedCountry && tab==="feed" && (
            <div style={{padding:"14px",borderBottom:"1px solid #21262d",background:"#0d1117",flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",gap:"9px",marginBottom:"10px"}}>
                <div style={{width:"30px",height:"30px",background:"linear-gradient(135deg,#1f6feb,#388bfd)",borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"15px"}}>🌍</div>
                <div>
                  <div style={{fontSize:"14px",fontWeight:"700",color:"#f0f6fc",letterSpacing:"0.08em"}}>{selectedCountry.toUpperCase()}</div>
                  <div style={{fontSize:"8px",color:"#484f58",letterSpacing:"0.2em"}}>SITUATION REPORT · 7 DAYS</div>
                </div>
              </div>
              <div style={{background:"#161b22",border:"1px solid #30363d",borderRadius:"8px",padding:"11px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"7px"}}>
                  <span style={{fontSize:"12px"}}>🤖</span>
                  <span style={{fontSize:"10px",color:"#58a6ff",fontWeight:"600",letterSpacing:"0.1em"}}>AI ANALYSIS</span>
                  {aiLoading && <div style={{marginLeft:"auto",width:"13px",height:"13px",border:"2px solid #21262d",borderTop:"2px solid #58a6ff",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>}
                </div>
                {aiLoading ? (
                  <div style={{fontSize:"11px",color:"#484f58",fontStyle:"italic"}}>Analyzing headlines...</div>
                ) : aiSummary ? (
                  <div style={{fontSize:"11px",color:"#c9d1d9",lineHeight:"1.7"}}>{aiSummary}</div>
                ) : (
                  <div style={{fontSize:"11px",color:"#30363d"}}>Loading...</div>
                )}
              </div>
            </div>
          )}

          {/* Global stats (no country) */}
          {!selectedCountry && tab==="feed" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",borderBottom:"1px solid #21262d",flexShrink:0}}>
              {[
                {l:"Events",    v:totalLive,   c:"#58a6ff"},
                {l:"Conflict",  v:allEvents.filter(e=>["conflict","violence"].includes(e.type)).length, c:"#ef4444"},
                {l:"Seismic",   v:quakes.length, c:"#f97316"},
                {l:"Reports",   v:userPosts.length, c:"#a78bfa"},
              ].map((s,i)=>(
                <div key={i} style={{padding:"10px 6px",textAlign:"center",borderRight:i<3?"1px solid #21262d":"none"}}>
                  <div style={{fontSize:"20px",fontWeight:"700",color:s.c,fontVariantNumeric:"tabular-nums"}}>{s.v}</div>
                  <div style={{fontSize:"8px",color:"#484f58",letterSpacing:"0.1em",marginTop:"1px"}}>{s.l.toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── TAB: FEED ── */}
          {tab==="feed" && (
            <div style={{flex:1,overflowY:"auto"}}>
              {countryLoading && (
                <div style={{padding:"32px",textAlign:"center",color:"#484f58",fontSize:"12px"}}>
                  <div style={{width:"22px",height:"22px",border:"2px solid #21262d",borderTop:"2px solid #58a6ff",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 10px"}}/>
                  Fetching {selectedCountry} news...
                </div>
              )}
              {!countryLoading && filtered.length===0 && (
                <div style={{padding:"32px",textAlign:"center",color:"#484f58",fontSize:"12px"}}>No events found</div>
              )}
              {!countryLoading && filtered.map((ev,idx)=>{
                const sev = SEV[ev.severity] || SEV.info;
                const typ = TYPES[ev.type] || TYPES.info;
                return (
                  <a key={ev.id||idx} href={ev.url||"#"} target={ev.url?"_blank":"_self"} rel="noreferrer"
                    style={{textDecoration:"none",display:"block",padding:"11px 13px",borderBottom:"1px solid #21262d",borderLeft:`3px solid ${sev.color}`,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#0d1117"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{display:"flex",gap:"8px",alignItems:"flex-start"}}>
                      <span style={{fontSize:"14px",flexShrink:0,marginTop:"1px"}}>{typ.icon}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"12px",color:"#e6edf3",lineHeight:"1.5",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",fontWeight:"500"}}>{ev.title}</div>
                        <div style={{display:"flex",gap:"8px",marginTop:"4px",flexWrap:"wrap",alignItems:"center"}}>
                          {ev.location && <span style={{fontSize:"10px",color:"#484f58"}}>📍 {ev.location}</span>}
                          <span style={{fontSize:"10px",color:"#30363d"}}>{ev.timeStr}</span>
                          {ev.source && <span style={{fontSize:"10px",color:"#30363d"}}>· {ev.source}</span>}
                          {ev.isUserPost && <span style={{fontSize:"9px",color:"#a78bfa",background:"rgba(167,139,250,0.1)",padding:"1px 6px",borderRadius:"4px",border:"1px solid rgba(167,139,250,0.2)"}}>USER REPORT</span>}
                        </div>
                      </div>
                      {ev.severity && ev.severity!=="info" && (
                        <div style={{fontSize:"9px",fontWeight:"700",color:sev.color,background:sev.bg,border:`1px solid ${sev.color}40`,borderRadius:"5px",padding:"3px 7px",flexShrink:0,letterSpacing:"0.05em",whiteSpace:"nowrap"}}>
                          {sev.label}
                        </div>
                      )}
                    </div>
                    {ev.fatalities>0 && <div style={{marginTop:"5px",fontSize:"11px",color:"#ef4444",paddingLeft:"22px",fontWeight:"600"}}>☠ {ev.fatalities} fatalities reported</div>}
                  </a>
                );
              })}
            </div>
          )}

          {/* ── TAB: SUBMIT ── */}
          {tab==="submit" && (
            <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
              {!user ? (
                <div style={{textAlign:"center",padding:"24px 16px"}}>
                  <div style={{fontSize:"32px",marginBottom:"12px"}}>✍</div>
                  <div style={{fontSize:"13px",color:"#e6edf3",fontWeight:"600",marginBottom:"8px"}}>Submit a News Report</div>
                  <div style={{fontSize:"11px",color:"#484f58",lineHeight:"1.6",marginBottom:"16px"}}>
                    Create an account to submit news reports that appear live on BEGDAR's global feed.
                  </div>
                  <button onClick={()=>{setAuthMode("register");setAuthError("");}} style={{padding:"8px 20px",background:"#238636",border:"1px solid #2ea043",borderRadius:"7px",color:"#fff",cursor:"pointer",fontSize:"12px",fontFamily:"inherit",fontWeight:"600"}}>
                    Create Account
                  </button>
                </div>
              ) : submitSuccess ? (
                <div style={{textAlign:"center",padding:"32px 16px"}}>
                  <div style={{fontSize:"36px",marginBottom:"12px"}}>✅</div>
                  <div style={{fontSize:"13px",color:"#22c55e",fontWeight:"600",marginBottom:"8px"}}>Report Submitted!</div>
                  <div style={{fontSize:"11px",color:"#484f58"}}>Your report will be reviewed and published shortly.</div>
                </div>
              ) : (
                <div>
                  <div style={{fontSize:"13px",color:"#f0f6fc",fontWeight:"600",marginBottom:"4px"}}>Submit News Report</div>
                  <div style={{fontSize:"10px",color:"#484f58",marginBottom:"16px"}}>Reports are reviewed before going live on the global feed</div>

                  <div style={{marginBottom:"12px"}}>
                    <div style={{fontSize:"11px",color:"#8b949e",marginBottom:"5px"}}>Headline *</div>
                    <input value={submitTitle} onChange={e=>setSubmitTitle(e.target.value)} placeholder="Brief, factual headline..."
                      style={{width:"100%",background:"#0d1117",border:"1px solid #30363d",borderRadius:"6px",padding:"8px 11px",color:"#e6edf3",fontSize:"12px",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
                      onFocus={e=>e.target.style.borderColor="#388bfd"} onBlur={e=>e.target.style.borderColor="#30363d"}/>
                  </div>

                  <div style={{marginBottom:"12px"}}>
                    <div style={{fontSize:"11px",color:"#8b949e",marginBottom:"5px"}}>Location</div>
                    <input value={submitLocation} onChange={e=>setSubmitLocation(e.target.value)} placeholder="City, Country"
                      style={{width:"100%",background:"#0d1117",border:"1px solid #30363d",borderRadius:"6px",padding:"8px 11px",color:"#e6edf3",fontSize:"12px",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
                      onFocus={e=>e.target.style.borderColor="#388bfd"} onBlur={e=>e.target.style.borderColor="#30363d"}/>
                  </div>

                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"12px"}}>
                    <div>
                      <div style={{fontSize:"11px",color:"#8b949e",marginBottom:"5px"}}>Category</div>
                      <select value={submitType} onChange={e=>setSubmitType(e.target.value)}
                        style={{width:"100%",background:"#0d1117",border:"1px solid #30363d",borderRadius:"6px",padding:"8px 11px",color:"#e6edf3",fontSize:"12px",fontFamily:"inherit",outline:"none",cursor:"pointer"}}>
                        {Object.entries(TYPES).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:"11px",color:"#8b949e",marginBottom:"5px"}}>Severity</div>
                      <select value={submitSev} onChange={e=>setSubmitSev(e.target.value)}
                        style={{width:"100%",background:"#0d1117",border:"1px solid #30363d",borderRadius:"6px",padding:"8px 11px",color:"#e6edf3",fontSize:"12px",fontFamily:"inherit",outline:"none",cursor:"pointer"}}>
                        {Object.entries(SEV).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{marginBottom:"16px"}}>
                    <div style={{fontSize:"11px",color:"#8b949e",marginBottom:"5px"}}>Details</div>
                    <textarea value={submitBody} onChange={e=>setSubmitBody(e.target.value)} placeholder="Additional context, sources, what happened..."
                      rows={4}
                      style={{width:"100%",background:"#0d1117",border:"1px solid #30363d",borderRadius:"6px",padding:"8px 11px",color:"#e6edf3",fontSize:"12px",fontFamily:"inherit",outline:"none",resize:"vertical",boxSizing:"border-box"}}
                      onFocus={e=>e.target.style.borderColor="#388bfd"} onBlur={e=>e.target.style.borderColor="#30363d"}/>
                  </div>

                  <button onClick={handleSubmit} disabled={!submitTitle.trim()||submitLoading}
                    style={{width:"100%",padding:"10px",background:!submitTitle.trim()?"#21262d":"#238636",border:`1px solid ${!submitTitle.trim()?"#30363d":"#2ea043"}`,borderRadius:"8px",color:!submitTitle.trim()?"#484f58":"#fff",cursor:!submitTitle.trim()?"not-allowed":"pointer",fontSize:"13px",fontWeight:"600",fontFamily:"inherit"}}>
                    {submitLoading ? "Submitting..." : "Submit Report"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: ACCOUNT ── */}
          {tab==="account" && (
            <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
              {!user ? (
                <div style={{textAlign:"center",padding:"24px 16px"}}>
                  <div style={{fontSize:"32px",marginBottom:"12px"}}>🌐</div>
                  <div style={{fontSize:"13px",color:"#e6edf3",fontWeight:"600",marginBottom:"8px"}}>Join BEGDAR</div>
                  <div style={{fontSize:"11px",color:"#484f58",lineHeight:"1.6",marginBottom:"16px"}}>
                    Create a free account to submit news reports and become part of the global monitoring network.
                  </div>
                  <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
                    <button onClick={()=>{setAuthMode("login");setAuthError("");}} style={{padding:"8px 16px",background:"transparent",border:"1px solid #30363d",borderRadius:"7px",color:"#e6edf3",cursor:"pointer",fontSize:"12px",fontFamily:"inherit",fontWeight:"500"}}>Sign In</button>
                    <button onClick={()=>{setAuthMode("register");setAuthError("");}} style={{padding:"8px 16px",background:"#238636",border:"1px solid #2ea043",borderRadius:"7px",color:"#fff",cursor:"pointer",fontSize:"12px",fontFamily:"inherit",fontWeight:"600"}}>Register Free</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"14px",background:"#0d1117",borderRadius:"10px",marginBottom:"16px",border:"1px solid #21262d"}}>
                    <div style={{width:"42px",height:"42px",background:"linear-gradient(135deg,#1f6feb,#388bfd)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px"}}>👤</div>
                    <div>
                      <div style={{fontSize:"14px",fontWeight:"600",color:"#f0f6fc"}}>{user.user_metadata?.username || "User"}</div>
                      <div style={{fontSize:"11px",color:"#484f58"}}>{user.email}</div>
                    </div>
                  </div>
                  <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:"8px",padding:"12px",marginBottom:"12px"}}>
                    <div style={{fontSize:"11px",color:"#484f58",letterSpacing:"0.1em",marginBottom:"8px",fontWeight:"600"}}>YOUR ACTIVITY</div>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #21262d"}}>
                      <span style={{fontSize:"11px",color:"#8b949e"}}>Reports submitted</span>
                      <span style={{fontSize:"11px",color:"#58a6ff",fontWeight:"600"}}>
                        {userPosts.filter(p=>p.source?.includes(user.user_metadata?.username)).length}
                      </span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}>
                      <span style={{fontSize:"11px",color:"#8b949e"}}>Member since</span>
                      <span style={{fontSize:"11px",color:"#8b949e"}}>{new Date(user.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button onClick={handleLogout} style={{width:"100%",padding:"9px",background:"transparent",border:"1px solid #30363d",borderRadius:"7px",color:"#ef4444",cursor:"pointer",fontSize:"12px",fontFamily:"inherit",fontWeight:"500"}}>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{padding:"7px 13px",borderTop:"1px solid #21262d",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,background:"#0d1117"}}>
            <span style={{fontSize:"10px",color:"#21262d"}}>BEGDAR · by Beg Bajrami</span>
            <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
              <div style={{width:"5px",height:"5px",borderRadius:"50%",background:"#22c55e",animation:"pulse 2s infinite"}}/>
              <span style={{fontSize:"9px",color:"#21262d"}}>LIVE</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        @keyframes pulse  {0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.35;transform:scale(1.3)}}
        @keyframes spin   {to{transform:rotate(360deg)}}
        @keyframes fadeIn {from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#0d1117}
        ::-webkit-scrollbar-thumb{background:#21262d;border-radius:2px}
        ::-webkit-scrollbar-thumb:hover{background:#30363d}
        input::placeholder,textarea::placeholder{color:#30363d}
        select option{background:#161b22;color:#e6edf3}
      `}</style>
    </div>
  );
}

function TopojsonLoader({ onLoad }) {
  useEffect(() => {
    if (window.topojson) { onLoad(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js";
    s.onload = onLoad; document.head.appendChild(s);
  }, [onLoad]);
  return null;
}
