import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";

// ─── DATA ────────────────────────────────────────────────────────────────────
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
  critical:{ color:"#ef4444", bg:"rgba(239,68,68,0.12)", label:"CRITICAL" },
  high:    { color:"#f97316", bg:"rgba(249,115,22,0.12)", label:"HIGH" },
  medium:  { color:"#eab308", bg:"rgba(234,179,8,0.10)",  label:"MEDIUM" },
  low:     { color:"#22d3ee", bg:"rgba(34,211,238,0.10)", label:"LOW" },
  info:    { color:"#60a5fa", bg:"rgba(96,165,250,0.10)", label:"INFO" },
};

const TYPES = {
  earthquake:{ icon:"〰", label:"Seismic"  },
  conflict:  { icon:"⚔",  label:"Conflict" },
  weather:   { icon:"⛈", label:"Weather"  },
  disaster:  { icon:"🔥", label:"Disaster" },
  political: { icon:"🏛", label:"Political"},
  health:    { icon:"🏥", label:"Health"   },
  violence:  { icon:"💥", label:"Violence" },
  info:      { icon:"📰", label:"News"     },
};

const guessCat = t => {
  t = (t||"").toLowerCase();
  if (/earthquake|quake|seismic|tremor/.test(t)) return "earthquake";
  if (/war|attack|airstrike|missile|military|bomb|kill|troops|battle|armed|shoot|terror/.test(t)) return "conflict";
  if (/hurricane|typhoon|cyclone|flood|tornado|storm/.test(t)) return "weather";
  if (/fire|eruption|volcano|tsunami|landslide/.test(t)) return "disaster";
  if (/election|coup|protest|riot|government|minister|president/.test(t)) return "political";
  if (/virus|outbreak|disease|epidemic|pandemic/.test(t)) return "health";
  if (/shooting|violence|assault|gunfire/.test(t)) return "violence";
  return "info";
};

const magToSev = m => m>=7?"critical":m>=6?"high":m>=5?"medium":"low";

const timeAgo = ts => {
  if (!ts) return "";
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1)    return "just now";
  if (m < 60)   return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m/60)}h ago`;
  return `${Math.floor(m/1440)}d ago`;
};

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function BEGDAR() {
  const mapRef  = useRef(null);
  const svgRef  = useRef(null);
  const projRef = useRef(null);

  const [worldData,        setWorldData]        = useState(null);
  const [quakes,           setQuakes]           = useState([]);
  const [globalNews,       setGlobalNews]       = useState([]);
  const [conflicts,        setConflicts]        = useState([]);
  const [allEvents,        setAllEvents]        = useState([]);
  const [selectedCountry,  setSelectedCountry]  = useState(null);
  const [countryNews,      setCountryNews]      = useState([]);
  const [countryLoading,   setCountryLoading]   = useState(false);
  const [aiSummary,        setAiSummary]        = useState("");
  const [aiLoading,        setAiLoading]        = useState(false);
  const [filter,           setFilter]           = useState("all");
  const [search,           setSearch]           = useState("");
  const [time,             setTime]             = useState(new Date());
  const [alert,            setAlert]            = useState(null);
  const [tooltip,          setTooltip]          = useState(null);
  const [mapReady,         setMapReady]         = useState(false);
  const [sources,          setSources]          = useState({ usgs:"connecting", gdelt:"connecting", acled:"demo" });

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // World atlas
  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => r.json()).then(setWorldData);
  }, []);

  // USGS earthquakes
  const fetchUSGS = useCallback(async () => {
    try {
      const r = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson");
      const d = await r.json();
      setQuakes((d.features||[]).slice(0,50).map(f => ({
        id: f.id,
        title: f.properties.title,
        type: "earthquake",
        severity: magToSev(f.properties.mag),
        mag: f.properties.mag,
        depth: f.geometry?.coordinates[2],
        lat: f.geometry?.coordinates[1],
        lng: f.geometry?.coordinates[0],
        location: f.properties.place,
        detail: `Magnitude ${f.properties.mag} earthquake at depth ${f.geometry?.coordinates[2]}km. ${f.properties.tsunami ? "⚠️ Tsunami warning issued." : "No tsunami warning."}`,
        url: f.properties.url,
        source: "USGS",
        timeRaw: f.properties.time,
        timeStr: timeAgo(f.properties.time),
      })));
      setSources(s => ({...s, usgs:"live"}));
    } catch {
      setSources(s => ({...s, usgs:"error"}));
    }
  }, []);

  // GDELT news
  const fetchGDELT = useCallback(async () => {
    try {
      const url = "https://api.gdeltproject.org/api/v2/doc/doc?query=war+conflict+attack+military+disaster+crisis&mode=artlist&maxrecords=40&format=json&timespan=24h";
      const d = await (await fetch(url)).json();
      setGlobalNews((d.articles||[]).slice(0,40).map((a, i) => {
        const cat = guessCat(a.title);
        return {
          id: `g${i}`,
          title: a.title || "Global Event",
          type: cat,
          severity: ["conflict","violence"].includes(cat) ? "high" : "medium",
          location: a.sourcecountry || "Global",
          detail: `Reported by ${a.domain||"Unknown"}`,
          url: a.url,
          source: a.domain || "GDELT",
          tone: a.tone ? parseFloat(a.tone).toFixed(1) : null,
          lat: null, lng: null,
          timeRaw: Date.now(),
          timeStr: "today",
        };
      }));
      setSources(s => ({...s, gdelt:"live"}));
    } catch {
      setSources(s => ({...s, gdelt:"error"}));
    }
  }, []);

  // ACLED (demo data — replace with real key when approved)
  const loadACLED = useCallback(() => {
    setConflicts([
      { id:"a1",  title:"Russian Forces vs Ukrainian Army — Kharkiv Front",    type:"conflict", severity:"critical", location:"Kharkiv, Ukraine",   lat:49.9, lng:36.2,  fatalities:12, source:"ACLED", timeStr:"3h ago",  timeRaw:Date.now()-10800000, detail:"Ongoing artillery exchanges along the front line. Urban combat reported in northern suburbs.", url:"https://acleddata.com" },
      { id:"a2",  title:"IDF Airstrike Operations — Northern Gaza",             type:"conflict", severity:"critical", location:"Gaza Strip",          lat:31.5, lng:34.4,  fatalities:34, source:"ACLED", timeStr:"1h ago",  timeRaw:Date.now()-3600000,  detail:"Multiple strikes on residential areas. Humanitarian corridors remain blocked.", url:"https://acleddata.com" },
      { id:"a3",  title:"Houthi Drone Strike on Red Sea Vessel",                type:"conflict", severity:"high",     location:"Red Sea",             lat:15.0, lng:42.5,  fatalities:0,  source:"ACLED", timeStr:"5h ago",  timeRaw:Date.now()-18000000, detail:"Commercial vessel struck near the Bab al-Mandab Strait. No casualties reported.", url:"https://acleddata.com" },
      { id:"a4",  title:"RSF vs SAF Armed Clashes — Khartoum",                 type:"conflict", severity:"critical", location:"Khartoum, Sudan",     lat:15.5, lng:32.5,  fatalities:28, source:"ACLED", timeStr:"8h ago",  timeRaw:Date.now()-28800000, detail:"Rapid Support Forces advancing in residential districts. Over 40,000 displaced this week.", url:"https://acleddata.com" },
      { id:"a5",  title:"Myanmar Junta Airstrikes — Shan State",               type:"conflict", severity:"high",     location:"Lashio, Myanmar",     lat:22.9, lng:97.7,  fatalities:9,  source:"ACLED", timeStr:"12h ago", timeRaw:Date.now()-43200000, detail:"Military airstrikes on resistance-held towns. Three villages evacuated.", url:"https://acleddata.com" },
      { id:"a6",  title:"IED Explosion Near Government Building — Baghdad",    type:"violence", severity:"high",     location:"Baghdad, Iraq",       lat:33.3, lng:44.4,  fatalities:4,  source:"ACLED", timeStr:"6h ago",  timeRaw:Date.now()-21600000, detail:"Improvised explosive device detonated. Four civilians wounded.", url:"https://acleddata.com" },
      { id:"a7",  title:"Mass Protest Against Pro-Russia Government — Tbilisi",type:"political",severity:"medium",   location:"Tbilisi, Georgia",    lat:41.7, lng:44.8,  fatalities:0,  source:"ACLED", timeStr:"2h ago",  timeRaw:Date.now()-7200000,  detail:"Tens of thousands demand EU alignment. Police deployed tear gas on demonstrators.", url:"https://acleddata.com" },
      { id:"a8",  title:"Al-Shabaab Suicide Bombing — Mogadishu Checkpoint",   type:"conflict", severity:"high",     location:"Mogadishu, Somalia",  lat:2.0,  lng:45.3,  fatalities:7,  source:"ACLED", timeStr:"14h ago", timeRaw:Date.now()-50400000, detail:"Seven soldiers killed. Attack claimed by Al-Shabaab.", url:"https://acleddata.com" },
      { id:"a9",  title:"Gang Violence — G9 Coalition Activity, Haiti",        type:"violence", severity:"high",     location:"Port-au-Prince, Haiti",lat:18.5,lng:-72.3, fatalities:15, source:"ACLED", timeStr:"20h ago", timeRaw:Date.now()-72000000, detail:"G9 gang coalition controls approximately 80% of the capital. Mass displacement ongoing.", url:"https://acleddata.com" },
      { id:"a10", title:"Hezbollah vs IDF Rocket Exchange — South Lebanon",    type:"conflict", severity:"critical", location:"South Lebanon",        lat:33.3, lng:35.5,  fatalities:3,  source:"ACLED", timeStr:"4h ago",  timeRaw:Date.now()-14400000, detail:"Cross-border rocket fire and air strikes. Lebanese border villages evacuated.", url:"https://acleddata.com" },
      { id:"a11", title:"Russian Cruise Missile Strike — Odesa Port",          type:"conflict", severity:"critical", location:"Odesa, Ukraine",       lat:46.4, lng:30.7,  fatalities:2,  source:"ACLED", timeStr:"7h ago",  timeRaw:Date.now()-25200000, detail:"Port and grain storage facilities targeted. Two confirmed dead, eight wounded.", url:"https://acleddata.com" },
    ]);
  }, []);

  useEffect(() => {
    fetchUSGS(); fetchGDELT(); loadACLED();
    const t = setInterval(() => { fetchUSGS(); fetchGDELT(); }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchUSGS, fetchGDELT, loadACLED]);

  useEffect(() => {
    const merged = [...quakes, ...conflicts, ...globalNews]
      .sort((a,b) => (b.timeRaw||0) - (a.timeRaw||0));
    setAllEvents(merged);
    const crit = merged.find(e => e.severity === "critical");
    if (crit) {
      setAlert(crit.title);
      setTimeout(() => setAlert(null), 8000);
    }
  }, [quakes, conflicts, globalNews]);

  // Fetch country-specific news + AI summary
  const openCountry = useCallback(async (name) => {
    setSelectedCountry(name);
    setCountryLoading(true);
    setCountryNews([]);
    setAiSummary("");

    try {
      const q = encodeURIComponent(name);
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=20&format=json&timespan=7d`;
      const d = await (await fetch(url)).json();
      const parsed = (d.articles||[]).slice(0,15).map((a,i) => ({
        id: `cn${i}`,
        title: a.title || "No title",
        type: guessCat(a.title),
        url: a.url,
        source: a.domain || "Unknown",
        tone: a.tone ? parseFloat(a.tone).toFixed(1) : null,
        timeStr: "this week",
      }));
      setCountryNews(parsed);

      // AI Summary
      if (parsed.length > 0) {
        setAiLoading(true);
        try {
          const headlines = parsed.slice(0,8).map(a => `- ${a.title}`).join("\n");
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              max_tokens: 1000,
              messages: [{
                role: "user",
                content: `You are a geopolitical analyst. Based on these recent news headlines from ${name}, write a clear and factual 3-sentence situation summary for a global news dashboard. Be neutral and concise.\n\nHeadlines:\n${headlines}\n\nWrite ONLY the 3-sentence summary. No intro, no preamble.`
              }]
            })
          });
          const data = await res.json();
          setAiSummary(data.content?.[0]?.text || "Summary unavailable.");
        } catch {
          setAiSummary("AI summary unavailable at this time.");
        }
        setAiLoading(false);
      }
    } catch {
      setCountryNews([]);
    }
    setCountryLoading(false);
  }, []);

  // ── D3 MAP ──────────────────────────────────────────────────────────────────
  const buildMap = useCallback(() => {
    if (!worldData || !mapRef.current || !window.topojson) return;
    const W = mapRef.current.clientWidth || 900;
    const H = mapRef.current.clientHeight || 500;

    const svg = d3.select(svgRef.current).attr("width", W).attr("height", H);
    svg.selectAll("*").remove();

    const proj = d3.geoNaturalEarth1().scale(W / 6.3).translate([W / 2, H / 2]);
    const gen  = d3.geoPath().projection(proj);
    projRef.current = proj;

    // Background
    svg.append("rect").attr("width", W).attr("height", H).attr("fill", "#0d1117");
    svg.append("path").datum({type:"Sphere"}).attr("d", gen)
      .attr("fill","#111827").attr("stroke","rgba(255,255,255,0.05)").attr("stroke-width",1);

    // Grid lines
    svg.append("path").datum(d3.geoGraticule()()).attr("d", gen)
      .attr("fill","none").attr("stroke","rgba(255,255,255,0.03)").attr("stroke-width",0.5);

    const heatColor = id => {
      const h = CONFLICT_HEAT[String(id)];
      if (!h) return "#1e293b";
      if (h >= 9) return "#7f1d1d";
      if (h >= 7) return "#7c2d12";
      if (h >= 5) return "#713f12";
      return "#1a3a1a";
    };

    const countries = window.topojson.feature(worldData, worldData.objects.countries);

    svg.selectAll(".cty")
      .data(countries.features)
      .enter().append("path")
      .attr("class","cty")
      .attr("d", gen)
      .attr("fill", d => heatColor(d.id))
      .attr("stroke","rgba(255,255,255,0.07)")
      .attr("stroke-width", 0.4)
      .style("cursor","pointer")
      .on("mouseover", function(ev, d) {
        d3.select(this).attr("fill","#2563eb").attr("stroke","rgba(96,165,250,0.6)").attr("stroke-width",0.8);
        const name = COUNTRY_NAMES[String(d.id)];
        if (name) {
          const rect = mapRef.current.getBoundingClientRect();
          setTooltip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, name });
        }
      })
      .on("mouseout", function(ev, d) {
        d3.select(this).attr("fill", heatColor(d.id)).attr("stroke","rgba(255,255,255,0.07)").attr("stroke-width",0.4);
        setTooltip(null);
      })
      .on("click", (ev, d) => {
        const name = COUNTRY_NAMES[String(d.id)];
        if (name) openCountry(name);
      });

    svg.append("path")
      .datum(window.topojson.mesh(worldData, worldData.objects.countries, (a,b) => a !== b))
      .attr("d", gen).attr("fill","none")
      .attr("stroke","rgba(255,255,255,0.08)").attr("stroke-width",0.3);

    setMapReady(true);
  }, [worldData, openCountry]);

  useEffect(() => { buildMap(); }, [buildMap]);

  // Plot dots
  useEffect(() => {
    if (!mapReady || !projRef.current || !svgRef.current) return;
    const proj = projRef.current;
    const svg  = d3.select(svgRef.current);
    svg.selectAll(".edot,.ering").remove();

    [...quakes, ...conflicts].filter(e => e.lat && e.lng).forEach(ev => {
      const [px, py] = proj([ev.lng, ev.lat]);
      if (!px || !py || px < 0 || py < 0) return;
      const col = SEV[ev.severity]?.color || "#fff";
      const r   = ev.type === "earthquake"
        ? Math.max(4, (ev.mag||5) * 1.4)
        : ev.severity === "critical" ? 8 : ev.severity === "high" ? 6 : 5;

      // Pulse ring
      svg.append("circle").attr("class","ering")
        .attr("cx",px).attr("cy",py).attr("r",r+7)
        .attr("fill","none").attr("stroke",col)
        .attr("stroke-width",1.5).attr("opacity",0.2);

      // Core dot
      svg.append("circle").attr("class","edot")
        .attr("cx",px).attr("cy",py).attr("r",r)
        .attr("fill",col).attr("opacity",0.92)
        .attr("stroke","rgba(0,0,0,0.5)").attr("stroke-width",1)
        .style("cursor","pointer")
        .on("mouseover", me => {
          const rect = mapRef.current.getBoundingClientRect();
          setTooltip({ x: me.clientX - rect.left, y: me.clientY - rect.top, ev });
        })
        .on("mouseout", () => setTooltip(null));
    });
  }, [quakes, conflicts, mapReady]);

  // ── FILTER ──────────────────────────────────────────────────────────────────
  const sl = search.toLowerCase();
  const listEvents = selectedCountry && countryNews.length > 0 ? countryNews : allEvents;
  const filtered = listEvents.filter(e => {
    if (filter !== "all" && e.type !== filter) return false;
    if (sl && !e.title?.toLowerCase().includes(sl) && !(e.location||"").toLowerCase().includes(sl)) return false;
    return true;
  });

  const critCount = allEvents.filter(e => e.severity === "critical").length;

  const srcStatus = key => ({
    live:       { dot:"#22c55e", text:"Live",        textColor:"#22c55e" },
    connecting: { dot:"#3b82f6", text:"Connecting",  textColor:"#3b82f6" },
    demo:       { dot:"#f59e0b", text:"Demo",        textColor:"#f59e0b" },
    error:      { dot:"#ef4444", text:"Error",       textColor:"#ef4444" },
  }[sources[key]] || { dot:"#6b7280", text:"Unknown", textColor:"#6b7280" });

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace",
      background: "#0d1117",
      color: "#e6edf3",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* ── BREAKING BANNER ── */}
      {alert && (
        <div style={{
          background: "#7f1d1d",
          borderBottom: "1px solid #ef4444",
          color: "#fca5a5",
          padding: "8px 20px",
          fontSize: "12px",
          fontWeight: "600",
          letterSpacing: "0.05em",
          textAlign: "center",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
        }}>
          <span style={{
            background:"#ef4444", color:"#fff", fontSize:"9px", fontWeight:"bold",
            padding:"2px 6px", borderRadius:"3px", letterSpacing:"0.1em",
          }}>BREAKING</span>
          {alert}
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 20px",
        background: "#161b22",
        borderBottom: "1px solid #30363d",
        flexShrink: 0,
        gap: "16px",
      }}>
        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:"12px", flexShrink:0 }}>
          <div style={{
            width:"38px", height:"38px",
            background:"linear-gradient(135deg,#ef4444,#dc2626)",
            borderRadius:"10px",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:"18px",
            boxShadow:"0 0 20px rgba(239,68,68,0.35)",
          }}>🌐</div>
          <div>
            <div style={{ fontSize:"20px", fontWeight:"700", color:"#f0f6fc", letterSpacing:"0.2em" }}>
              BEGDAR
            </div>
            <div style={{ fontSize:"9px", color:"#484f58", letterSpacing:"0.3em", marginTop:"1px" }}>
              GLOBAL SITUATION MONITOR
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ position:"relative", flex:1, maxWidth:"400px" }}>
          <span style={{ position:"absolute", left:"12px", top:"50%", transform:"translateY(-50%)", color:"#484f58", fontSize:"14px" }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search country, city, event..."
            style={{
              width:"100%",
              background:"#0d1117",
              border:"1px solid #30363d",
              borderRadius:"8px",
              padding:"8px 36px",
              color:"#e6edf3",
              fontSize:"13px",
              fontFamily:"inherit",
              outline:"none",
              boxSizing:"border-box",
              transition:"border-color 0.2s",
            }}
            onFocus={e=>e.target.style.borderColor="#388bfd"}
            onBlur={e=>e.target.style.borderColor="#30363d"}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{
              position:"absolute", right:"10px", top:"50%", transform:"translateY(-50%)",
              background:"none", border:"none", color:"#484f58", cursor:"pointer", fontSize:"16px", lineHeight:1,
            }}>×</button>
          )}
        </div>

        {/* Right side */}
        <div style={{ display:"flex", gap:"12px", alignItems:"center", flexShrink:0 }}>
          {/* Source indicators */}
          <div style={{ display:"flex", gap:"8px" }}>
            {["usgs","gdelt","acled"].map(k => {
              const s = srcStatus(k);
              return (
                <div key={k} style={{
                  display:"flex", alignItems:"center", gap:"5px",
                  background:"#161b22",
                  border:"1px solid #30363d",
                  borderRadius:"6px",
                  padding:"4px 8px",
                }}>
                  <div style={{
                    width:"6px", height:"6px", borderRadius:"50%",
                    background: s.dot,
                    boxShadow: `0 0 6px ${s.dot}`,
                    animation: sources[k] === "live" ? "pulse 2s infinite" : "none",
                  }}/>
                  <span style={{ fontSize:"10px", color:"#8b949e", letterSpacing:"0.08em" }}>{k.toUpperCase()}</span>
                  <span style={{ fontSize:"10px", color:s.textColor, fontWeight:"600" }}>{s.text}</span>
                </div>
              );
            })}
          </div>

          {/* Critical badge */}
          {critCount > 0 && (
            <div style={{
              display:"flex", alignItems:"center", gap:"6px",
              background:"rgba(239,68,68,0.1)",
              border:"1px solid rgba(239,68,68,0.4)",
              borderRadius:"8px",
              padding:"6px 12px",
            }}>
              <div style={{ width:"7px", height:"7px", borderRadius:"50%", background:"#ef4444", animation:"pulse 1s infinite" }}/>
              <span style={{ fontSize:"12px", color:"#ef4444", fontWeight:"700" }}>{critCount} CRITICAL</span>
            </div>
          )}

          {/* Clock */}
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:"16px", color:"#58a6ff", fontWeight:"600", fontVariantNumeric:"tabular-nums" }}>
              {time.toISOString().slice(11,19)}
              <span style={{ fontSize:"9px", color:"#484f58", marginLeft:"4px" }}>UTC</span>
            </div>
            <div style={{ fontSize:"9px", color:"#30363d", letterSpacing:"0.12em" }}>
              {time.toDateString().toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      {/* ── FILTER BAR ── */}
      <div style={{
        display:"flex", gap:"6px", padding:"8px 16px",
        background:"#161b22",
        borderBottom:"1px solid #21262d",
        flexShrink:0, flexWrap:"wrap", alignItems:"center",
      }}>
        <span style={{ fontSize:"10px", color:"#484f58", marginRight:"4px", letterSpacing:"0.1em" }}>FILTER</span>
        {[
          ["all",       "All Events"],
          ["conflict",  "⚔ Conflict"],
          ["earthquake","〰 Seismic"],
          ["violence",  "💥 Violence"],
          ["weather",   "⛈ Weather"],
          ["disaster",  "🔥 Disaster"],
          ["political", "🏛 Political"],
        ].map(([f, lbl]) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding:"4px 12px",
            background: filter === f ? "#1f6feb" : "#0d1117",
            border: `1px solid ${filter === f ? "#388bfd" : "#30363d"}`,
            color: filter === f ? "#ffffff" : "#8b949e",
            borderRadius:"6px",
            cursor:"pointer",
            fontSize:"11px",
            fontFamily:"inherit",
            fontWeight: filter === f ? "600" : "400",
            transition:"all 0.15s",
          }}>{lbl}</button>
        ))}

        {selectedCountry && (
          <button
            onClick={() => { setSelectedCountry(null); setCountryNews([]); setAiSummary(""); }}
            style={{
              marginLeft:"auto",
              padding:"4px 12px",
              background:"#0d1117",
              border:"1px solid #30363d",
              color:"#8b949e",
              borderRadius:"6px",
              cursor:"pointer",
              fontSize:"11px",
              fontFamily:"inherit",
              display:"flex", alignItems:"center", gap:"5px",
            }}
          >
            ← Global view
          </button>
        )}

        <span style={{ marginLeft: selectedCountry?"8px":"auto", fontSize:"11px", color:"#484f58" }}>
          {filtered.length} events
        </span>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* MAP */}
        <div style={{ flex:1, position:"relative", overflow:"hidden" }} ref={mapRef}>
          <TopojsonLoader onLoad={buildMap}/>
          <svg ref={svgRef} style={{ width:"100%", height:"100%", display:"block" }}/>

          {/* Map legend */}
          <div style={{
            position:"absolute", bottom:"16px", left:"16px",
            background:"rgba(22,27,34,0.92)",
            border:"1px solid #30363d",
            borderRadius:"10px",
            padding:"12px 14px",
            backdropFilter:"blur(8px)",
          }}>
            <div style={{ fontSize:"10px", color:"#484f58", letterSpacing:"0.15em", marginBottom:"8px", fontWeight:"600" }}>CONFLICT INTENSITY</div>
            {[
              ["#7f1d1d", "Critical conflict zone"],
              ["#7c2d12", "High tension"],
              ["#713f12", "Elevated risk"],
              ["#1e293b", "Stable / monitored"],
            ].map(([c,l]) => (
              <div key={l} style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"5px" }}>
                <div style={{ width:"12px", height:"8px", borderRadius:"3px", background:c, border:"1px solid rgba(255,255,255,0.1)" }}/>
                <span style={{ fontSize:"10px", color:"#8b949e" }}>{l}</span>
              </div>
            ))}
            <div style={{ borderTop:"1px solid #21262d", marginTop:"8px", paddingTop:"8px" }}>
              <div style={{ fontSize:"10px", color:"#484f58", letterSpacing:"0.12em", marginBottom:"6px", fontWeight:"600" }}>EVENT DOTS</div>
              {Object.entries(SEV).slice(0,4).map(([k,v]) => (
                <div key={k} style={{ display:"flex", alignItems:"center", gap:"7px", marginBottom:"4px" }}>
                  <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:v.color }}/>
                  <span style={{ fontSize:"10px", color:"#8b949e" }}>{k.charAt(0).toUpperCase()+k.slice(1)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Click hint */}
          {!selectedCountry && (
            <div style={{
              position:"absolute", bottom:"16px", right:"16px",
              background:"rgba(22,27,34,0.88)",
              border:"1px solid #30363d",
              borderRadius:"8px",
              padding:"8px 14px",
              fontSize:"11px",
              color:"#8b949e",
              backdropFilter:"blur(8px)",
            }}>
              🖱 Click any country for live news & AI analysis
            </div>
          )}

          {/* Tooltip */}
          {tooltip && (
            <div style={{
              position:"absolute",
              left: Math.min((tooltip.x||0)+16, (mapRef.current?.clientWidth||800)-240),
              top:  Math.max((tooltip.y||0)-20, 10),
              background:"#161b22",
              border:`1px solid ${tooltip.ev ? SEV[tooltip.ev.severity]?.color : "#388bfd"}`,
              borderRadius:"10px",
              padding:"10px 14px",
              fontSize:"12px",
              maxWidth:"240px",
              pointerEvents:"none",
              zIndex:60,
              boxShadow:"0 8px 32px rgba(0,0,0,0.6)",
            }}>
              {tooltip.ev ? (
                <>
                  <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"6px" }}>
                    <span style={{ fontSize:"15px" }}>{TYPES[tooltip.ev.type]?.icon}</span>
                    <span style={{ color:SEV[tooltip.ev.severity]?.color, fontWeight:"700", fontSize:"11px", letterSpacing:"0.08em" }}>
                      {tooltip.ev.type === "earthquake" ? `M${tooltip.ev.mag}` : SEV[tooltip.ev.severity]?.label}
                    </span>
                  </div>
                  <div style={{ color:"#e6edf3", lineHeight:"1.5", marginBottom:"5px", fontSize:"11px" }}>{tooltip.ev.title}</div>
                  <div style={{ color:"#8b949e", fontSize:"10px" }}>📍 {tooltip.ev.location}</div>
                  {tooltip.ev.fatalities > 0 && (
                    <div style={{ color:"#ef4444", fontSize:"10px", marginTop:"4px", fontWeight:"600" }}>
                      ☠ {tooltip.ev.fatalities} fatalities reported
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color:"#58a6ff", fontWeight:"700", fontSize:"13px" }}>{tooltip.name}</div>
              )}
            </div>
          )}
        </div>

        {/* ── SIDE PANEL ── */}
        <div style={{
          width:"360px",
          flexShrink:0,
          background:"#161b22",
          borderLeft:"1px solid #21262d",
          display:"flex",
          flexDirection:"column",
          overflow:"hidden",
        }}>

          {/* Country panel OR global stats */}
          {selectedCountry ? (
            <div style={{
              padding:"16px",
              borderBottom:"1px solid #21262d",
              flexShrink:0,
              background:"#0d1117",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"12px" }}>
                <div style={{
                  width:"32px", height:"32px",
                  background:"linear-gradient(135deg,#1f6feb,#388bfd)",
                  borderRadius:"8px",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:"16px",
                }}>🌍</div>
                <div>
                  <div style={{ fontSize:"15px", fontWeight:"700", color:"#f0f6fc", letterSpacing:"0.08em" }}>
                    {selectedCountry.toUpperCase()}
                  </div>
                  <div style={{ fontSize:"9px", color:"#484f58", letterSpacing:"0.2em" }}>
                    SITUATION REPORT · LAST 7 DAYS
                  </div>
                </div>
              </div>

              {/* AI Summary box */}
              <div style={{
                background:"#161b22",
                border:"1px solid #30363d",
                borderRadius:"8px",
                padding:"12px",
              }}>
                <div style={{
                  display:"flex", alignItems:"center", gap:"7px",
                  marginBottom:"8px",
                }}>
                  <span style={{ fontSize:"13px" }}>🤖</span>
                  <span style={{ fontSize:"10px", color:"#58a6ff", fontWeight:"600", letterSpacing:"0.1em" }}>AI SITUATION SUMMARY</span>
                  {aiLoading && (
                    <div style={{
                      marginLeft:"auto",
                      width:"14px", height:"14px",
                      border:"2px solid #30363d",
                      borderTop:"2px solid #58a6ff",
                      borderRadius:"50%",
                      animation:"spin 0.8s linear infinite",
                    }}/>
                  )}
                </div>
                {aiLoading ? (
                  <div style={{ fontSize:"12px", color:"#484f58", fontStyle:"italic" }}>
                    Analyzing {selectedCountry} headlines...
                  </div>
                ) : aiSummary ? (
                  <div style={{ fontSize:"12px", color:"#c9d1d9", lineHeight:"1.7" }}>
                    {aiSummary}
                  </div>
                ) : (
                  <div style={{ fontSize:"12px", color:"#30363d" }}>Loading...</div>
                )}
              </div>
            </div>
          ) : (
            /* Global stats */
            <div style={{
              display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
              borderBottom:"1px solid #21262d",
              flexShrink:0,
            }}>
              {[
                { label:"Total Events", value:allEvents.length,    color:"#58a6ff" },
                { label:"Conflicts",    value:allEvents.filter(e=>["conflict","violence"].includes(e.type)).length, color:"#ef4444" },
                { label:"Earthquakes",  value:quakes.length,       color:"#f97316" },
              ].map((s, i) => (
                <div key={i} style={{
                  padding:"12px 8px",
                  textAlign:"center",
                  borderRight: i < 2 ? "1px solid #21262d" : "none",
                }}>
                  <div style={{ fontSize:"24px", fontWeight:"700", color:s.color, fontVariantNumeric:"tabular-nums" }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize:"9px", color:"#484f58", letterSpacing:"0.12em", marginTop:"2px" }}>
                    {s.label.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Event list */}
          <div style={{ flex:1, overflowY:"auto" }}>
            {countryLoading && (
              <div style={{
                padding:"32px 20px",
                textAlign:"center",
                color:"#484f58",
                fontSize:"13px",
              }}>
                <div style={{
                  width:"24px", height:"24px",
                  border:"2px solid #21262d",
                  borderTop:"2px solid #58a6ff",
                  borderRadius:"50%",
                  animation:"spin 0.8s linear infinite",
                  margin:"0 auto 12px",
                }}/>
                Fetching {selectedCountry} news...
              </div>
            )}

            {!countryLoading && filtered.length === 0 && (
              <div style={{ padding:"32px 20px", textAlign:"center", color:"#484f58", fontSize:"13px" }}>
                No events found
              </div>
            )}

            {!countryLoading && filtered.map((ev, idx) => {
              const sev = SEV[ev.severity] || SEV.info;
              const typ = TYPES[ev.type] || TYPES.info;
              return (
                <a
                  key={ev.id||idx}
                  href={ev.url||"#"}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    textDecoration:"none",
                    display:"block",
                    padding:"12px 14px",
                    borderBottom:"1px solid #21262d",
                    borderLeft:`3px solid ${sev.color}`,
                    transition:"background 0.12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#0d1117"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <div style={{ display:"flex", gap:"8px", alignItems:"flex-start" }}>
                    <span style={{ fontSize:"15px", flexShrink:0, marginTop:"1px" }}>{typ.icon}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{
                        fontSize:"12px",
                        color:"#e6edf3",
                        lineHeight:"1.5",
                        overflow:"hidden",
                        display:"-webkit-box",
                        WebkitLineClamp:2,
                        WebkitBoxOrient:"vertical",
                        fontWeight:"500",
                      }}>
                        {ev.title}
                      </div>
                      <div style={{ display:"flex", gap:"8px", marginTop:"4px", flexWrap:"wrap", alignItems:"center" }}>
                        {ev.location && (
                          <span style={{ fontSize:"10px", color:"#484f58" }}>📍 {ev.location}</span>
                        )}
                        <span style={{ fontSize:"10px", color:"#30363d" }}>{ev.timeStr}</span>
                        {ev.source && (
                          <span style={{ fontSize:"10px", color:"#30363d" }}>· {ev.source}</span>
                        )}
                      </div>
                    </div>
                    {ev.severity && ev.severity !== "info" && (
                      <div style={{
                        fontSize:"9px",
                        fontWeight:"700",
                        color: sev.color,
                        background: sev.bg,
                        border:`1px solid ${sev.color}40`,
                        borderRadius:"5px",
                        padding:"3px 7px",
                        flexShrink:0,
                        letterSpacing:"0.05em",
                        whiteSpace:"nowrap",
                      }}>
                        {sev.label}
                      </div>
                    )}
                  </div>

                  {ev.fatalities > 0 && (
                    <div style={{
                      marginTop:"5px",
                      fontSize:"11px",
                      color:"#ef4444",
                      paddingLeft:"23px",
                      fontWeight:"600",
                    }}>
                      ☠ {ev.fatalities} fatalities reported
                    </div>
                  )}
                </a>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding:"8px 14px",
            borderTop:"1px solid #21262d",
            display:"flex",
            justifyContent:"space-between",
            alignItems:"center",
            flexShrink:0,
            background:"#0d1117",
          }}>
            <span style={{ fontSize:"10px", color:"#30363d" }}>BEGDAR · by Beg Bajrami</span>
            <span style={{ fontSize:"10px", color:"#21262d" }}>USGS · GDELT · ACLED</span>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.3)} }
        @keyframes spin  { to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { width:4px }
        ::-webkit-scrollbar-track { background:#0d1117 }
        ::-webkit-scrollbar-thumb { background:#21262d; border-radius:2px }
        ::-webkit-scrollbar-thumb:hover { background:#30363d }
        input::placeholder { color:#30363d }
      `}</style>
    </div>
  );
}

function TopojsonLoader({ onLoad }) {
  useEffect(() => {
    if (window.topojson) { onLoad(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js";
    s.onload = onLoad;
    document.head.appendChild(s);
  }, [onLoad]);
  return null;
}
