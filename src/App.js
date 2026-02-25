import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const SEV_COLOR = {
  critical: "#ff1a3a",
  high:     "#ff7200",
  medium:   "#ffc800",
  low:      "#00d4ff",
  info:     "#4488ff",
};

const TYPE_META = {
  earthquake: { icon: "〰", label: "Seismic",   color: "#ff7200" },
  conflict:   { icon: "⚔",  label: "Conflict",  color: "#ff1a3a" },
  weather:    { icon: "⛈",  label: "Weather",   color: "#00aaff" },
  disaster:   { icon: "🔥", label: "Disaster",  color: "#ff5500" },
  political:  { icon: "🏛", label: "Political", color: "#cc44ff" },
  health:     { icon: "🏥", label: "Health",    color: "#00ff99" },
  violence:   { icon: "💥", label: "Violence",  color: "#ff2060" },
  info:       { icon: "📡", label: "News",      color: "#4488ff" },
};

// ─── UTILS ──────────────────────────────────────────────────────────────────
const guessCat = (title = "", tags = "") => {
  const t = (title + " " + tags).toLowerCase();
  if (/earthquake|quake|seismic|tremor/.test(t)) return "earthquake";
  if (/war|attack|airstrike|missile|military|troops|battle|bombing|shooting|armed|killed|explosion/.test(t)) return "conflict";
  if (/hurricane|typhoon|cyclone|flood|tornado|storm/.test(t)) return "weather";
  if (/wildfire|fire|eruption|volcano|tsunami|landslide/.test(t)) return "disaster";
  if (/election|coup|protest|riot|government|minister|president|parliament/.test(t)) return "political";
  if (/virus|outbreak|disease|epidemic|pandemic|health/.test(t)) return "health";
  if (/shooting|violence|assault|gunfire|casualties/.test(t)) return "violence";
  return "info";
};

const magToSev = m => m >= 7 ? "critical" : m >= 6 ? "high" : m >= 5 ? "medium" : "low";

const acledToSev = (fatalities) => {
  if (fatalities >= 100) return "critical";
  if (fatalities >= 20)  return "high";
  if (fatalities >= 5)   return "medium";
  return "low";
};

const timeAgo = (ts) => {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m/60)}h ago`;
  return `${Math.floor(m/1440)}d ago`;
};

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function BEGDAR() {
  const mapRef   = useRef(null);
  const svgRef   = useRef(null);
  const projRef  = useRef(null);
  const pathRef  = useRef(null);
  const topoReady = useRef(false);

  const [worldData,     setWorldData]     = useState(null);
  const [quakes,        setQuakes]        = useState([]);
  const [newsEvents,    setNewsEvents]    = useState([]);
  const [conflicts,     setConflicts]     = useState([]);
  const [allEvents,     setAllEvents]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [sources,       setSources]       = useState({ usgs: "loading", gdelt: "loading", acled: "loading" });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [filter,        setFilter]        = useState("all");
  const [search,        setSearch]        = useState("");
  const [time,          setTime]          = useState(new Date());
  const [alert,         setAlert]         = useState(null);
  const [tooltip,       setTooltip]       = useState(null);
  const [mapReady,      setMapReady]      = useState(false);
  const [pulse,         setPulse]         = useState(0);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Pulse animation trigger
  useEffect(() => {
    const t = setInterval(() => setPulse(p => p + 1), 1800);
    return () => clearInterval(t);
  }, []);

  // ── FETCH WORLD ATLAS ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => r.json())
      .then(data => setWorldData(data));
  }, []);

  // ── USGS Earthquakes ───────────────────────────────────────────────────────
  const fetchUSGS = useCallback(async () => {
    try {
      const r = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson");
      const d = await r.json();
      const parsed = (d.features || []).slice(0, 50).map(f => ({
        id:       f.id,
        title:    f.properties.title,
        type:     "earthquake",
        severity: magToSev(f.properties.mag),
        mag:      f.properties.mag,
        depth:    f.geometry?.coordinates[2],
        lat:      f.geometry?.coordinates[1],
        lng:      f.geometry?.coordinates[0],
        location: f.properties.place,
        detail:   `Magnitude ${f.properties.mag} — Depth ${f.geometry?.coordinates[2]}km. ${f.properties.tsunami ? "⚠️ TSUNAMI WARNING ISSUED." : "No tsunami warning."} Status: ${f.properties.status}.`,
        url:      f.properties.url,
        source:   "USGS",
        timeRaw:  f.properties.time,
        timeStr:  timeAgo(f.properties.time),
      }));
      setQuakes(parsed);
      setSources(s => ({ ...s, usgs: "live" }));
    } catch {
      setSources(s => ({ ...s, usgs: "error" }));
    }
  }, []);

  // ── GDELT News ─────────────────────────────────────────────────────────────
  const fetchGDELT = useCallback(async () => {
    try {
      const url = "https://api.gdeltproject.org/api/v2/doc/doc?query=war+conflict+attack+military+disaster+crisis+earthquake&mode=artlist&maxrecords=30&format=json&timespan=24h";
      const r = await fetch(url);
      const d = await r.json();
      const parsed = (d.articles || []).slice(0, 30).map((a, i) => {
        const cat = guessCat(a.title);
        return {
          id:       `gdelt_${i}_${a.seendatetime}`,
          title:    a.title || "Global Event",
          type:     cat,
          severity: ["conflict","violence"].includes(cat) ? "high" : cat === "earthquake" ? "high" : "medium",
          location: a.sourcecountry || "Global",
          detail:   `Source: ${a.domain || "Unknown"} · Tone score: ${a.tone ? parseFloat(a.tone).toFixed(1) : "N/A"} (lower = more negative/severe)`,
          url:      a.url,
          source:   a.domain || "GDELT",
          lat:      null,
          lng:      null,
          timeRaw:  a.seendatetime ? new Date(
            `${a.seendatetime.slice(0,4)}-${a.seendatetime.slice(4,6)}-${a.seendatetime.slice(6,8)}T${a.seendatetime.slice(8,10)}:${a.seendatetime.slice(10,12)}:00Z`
          ).getTime() : Date.now(),
          timeStr: timeAgo(a.seendatetime ? new Date(
            `${a.seendatetime.slice(0,4)}-${a.seendatetime.slice(4,6)}-${a.seendatetime.slice(6,8)}T${a.seendatetime.slice(8,10)}:${a.seendatetime.slice(10,12)}:00Z`
          ) : new Date()),
        };
      });
      setNewsEvents(parsed);
      setSources(s => ({ ...s, gdelt: "live" }));
    } catch {
      setSources(s => ({ ...s, gdelt: "error" }));
    }
  }, []);

  // ── ACLED Conflict Data ────────────────────────────────────────────────────
  // ACLED is free for researchers — register at acleddata.com to get API key
  // Demo mode shows real ACLED structure with recent public data
  const fetchACLED = useCallback(async () => {
    // ACLED API endpoint (requires free registration at acleddata.com)
    // Replace with your key: https://api.acleddata.com/acled/read?key=YOUR_KEY&email=YOUR_EMAIL
    const ACLED_KEY   = ""; // <-- paste your free ACLED key here
    const ACLED_EMAIL = ""; // <-- paste your registered email here

    if (ACLED_KEY && ACLED_EMAIL) {
      try {
        const url = `https://api.acleddata.com/acled/read?key=${ACLED_KEY}&email=${ACLED_EMAIL}&limit=50&fields=event_id_cnty|event_date|event_type|sub_event_type|country|location|latitude|longitude|fatalities|notes|actor1|actor2&event_date_where=BETWEEN&event_date=${getDateMinus(7)}|${getToday()}`;
        const r = await fetch(url);
        const d = await r.json();
        const parsed = (d.data || []).map(a => ({
          id:       `acled_${a.event_id_cnty}`,
          title:    `${a.event_type}: ${a.actor1}${a.actor2 ? " vs " + a.actor2 : ""} — ${a.location}, ${a.country}`,
          type:     "conflict",
          severity: acledToSev(parseInt(a.fatalities) || 0),
          location: `${a.location}, ${a.country}`,
          detail:   `${a.notes || "No details."} Fatalities: ${a.fatalities || 0}. Sub-type: ${a.sub_event_type}.`,
          lat:      parseFloat(a.latitude),
          lng:      parseFloat(a.longitude),
          source:   "ACLED",
          fatalities: parseInt(a.fatalities) || 0,
          timeRaw:  new Date(a.event_date).getTime(),
          timeStr:  timeAgo(new Date(a.event_date)),
          url:      `https://acleddata.com/dashboard/#/dashboard`,
        }));
        setConflicts(parsed);
        setSources(s => ({ ...s, acled: "live" }));
        return;
      } catch {
        setSources(s => ({ ...s, acled: "error" }));
      }
    }

    // ── DEMO MODE (ACLED-structure, real recent conflicts) ──
    // Replace this with real API once you register at acleddata.com (free)
    const demo = [
      { id:"acled_1", title:"Armed Clashes — Russian Forces vs Ukrainian Army, Kharkiv Oblast", type:"conflict", severity:"critical", location:"Kharkiv, Ukraine", lat:49.9, lng:36.2, detail:"Artillery exchanges along front lines. Urban combat reported. 12 fatalities confirmed.", fatalities:12, source:"ACLED·Demo", timeStr:"3h ago", timeRaw: Date.now()-10800000, url:"https://acleddata.com" },
      { id:"acled_2", title:"Airstrike — IDF Operations, Northern Gaza", type:"conflict", severity:"critical", location:"Gaza City, Gaza Strip", lat:31.5, lng:34.4, detail:"Multiple airstrikes on residential areas. Aid workers unable to access zone.", fatalities:34, source:"ACLED·Demo", timeStr:"1h ago", timeRaw: Date.now()-3600000, url:"https://acleddata.com" },
      { id:"acled_3", title:"Drone Strike — Houthi Attack on Red Sea Vessel", type:"conflict", severity:"high", location:"Red Sea", lat:15.0, lng:42.5, detail:"Commercial vessel hit by drone near Bab al-Mandab strait. No casualties.", fatalities:0, source:"ACLED·Demo", timeStr:"5h ago", timeRaw: Date.now()-18000000, url:"https://acleddata.com" },
      { id:"acled_4", title:"Armed Clashes — RSF vs SAF Forces, Khartoum", type:"conflict", severity:"critical", location:"Khartoum, Sudan", lat:15.5, lng:32.5, detail:"Rapid Support Forces advance in residential district. 40,000 displaced this week.", fatalities:28, source:"ACLED·Demo", timeStr:"8h ago", timeRaw: Date.now()-28800000, url:"https://acleddata.com" },
      { id:"acled_5", title:"Armed Clashes — Myanmar Military vs Resistance, Shan State", type:"conflict", severity:"high", location:"Lashio, Myanmar", lat:22.9, lng:97.7, detail:"Junta airstrikes on resistance-held towns. Three villages evacuated.", fatalities:9, source:"ACLED·Demo", timeStr:"12h ago", timeRaw: Date.now()-43200000, url:"https://acleddata.com" },
      { id:"acled_6", title:"Explosive Ordnance — IED Blast, Baghdad", type:"violence", severity:"high", location:"Baghdad, Iraq", lat:33.3, lng:44.4, detail:"IED detonation near government building. 4 wounded.", fatalities:4, source:"ACLED·Demo", timeStr:"6h ago", timeRaw: Date.now()-21600000, url:"https://acleddata.com" },
      { id:"acled_7", title:"Mass Protest — Anti-Government Demonstration, Tbilisi", type:"political", severity:"medium", location:"Tbilisi, Georgia", lat:41.7, lng:44.8, detail:"Tens of thousands protest pro-Russia government pivot. Police deploy tear gas.", fatalities:0, source:"ACLED·Demo", timeStr:"2h ago", timeRaw: Date.now()-7200000, url:"https://acleddata.com" },
      { id:"acled_8", title:"Armed Clashes — Al-Shabaab Attack, Mogadishu", type:"conflict", severity:"high", location:"Mogadishu, Somalia", lat:2.0, lng:45.3, detail:"Suicide bombing at checkpoint. 7 soldiers killed.", fatalities:7, source:"ACLED·Demo", timeStr:"14h ago", timeRaw: Date.now()-50400000, url:"https://acleddata.com" },
      { id:"acled_9", title:"Violence Against Civilians — Haiti Gang Activity", type:"violence", severity:"high", location:"Port-au-Prince, Haiti", lat:18.5, lng:-72.3, detail:"G9 gang faction controls 80% of capital. Mass displacement ongoing.", fatalities:15, source:"ACLED·Demo", timeStr:"20h ago", timeRaw: Date.now()-72000000, url:"https://acleddata.com" },
      { id:"acled_10", title:"Armed Clashes — Hezbollah vs IDF, Southern Lebanon", type:"conflict", severity:"critical", location:"South Lebanon", lat:33.3, lng:35.5, detail:"Cross-border rocket exchange. Lebanese villages evacuated.", fatalities:3, source:"ACLED·Demo", timeStr:"4h ago", timeRaw: Date.now()-14400000, url:"https://acleddata.com" },
      { id:"acled_11", title:"Air/Drone Strike — Russian Missile Barrage, Odesa", type:"conflict", severity:"critical", location:"Odesa, Ukraine", lat:46.4, lng:30.7, detail:"Cruise missile salvo targets port infrastructure. 2 killed, 8 wounded.", fatalities:2, source:"ACLED·Demo", timeStr:"7h ago", timeRaw: Date.now()-25200000, url:"https://acleddata.com" },
      { id:"acled_12", title:"Protest — Coup Attempt Aftermath, Bamako", type:"political", severity:"medium", location:"Bamako, Mali", lat:12.6, lng:-8.0, detail:"Pro-junta demonstrations. Opposition leaders arrested.", fatalities:0, source:"ACLED·Demo", timeStr:"18h ago", timeRaw: Date.now()-64800000, url:"https://acleddata.com" },
    ];
    setConflicts(demo);
    setSources(s => ({ ...s, acled: "demo" }));
  }, []);

  const getToday = () => new Date().toISOString().slice(0,10);
  const getDateMinus = (days) => {
    const d = new Date(); d.setDate(d.getDate() - days);
    return d.toISOString().slice(0,10);
  };

  // Initial fetch + refresh
  useEffect(() => {
    fetchUSGS();
    fetchGDELT();
    fetchACLED();
    const t = setInterval(() => { fetchUSGS(); fetchGDELT(); fetchACLED(); }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchUSGS, fetchGDELT, fetchACLED]);

  // Merge all events
  useEffect(() => {
    const merged = [...quakes, ...conflicts, ...newsEvents]
      .sort((a, b) => (b.timeRaw || 0) - (a.timeRaw || 0));
    setAllEvents(merged);
    if (merged.length > 0) setLoading(false);
    // Push critical alert banner
    const crit = merged.find(e => e.severity === "critical");
    if (crit) {
      setAlert(crit.title);
      const t = setTimeout(() => setAlert(null), 7000);
      return () => clearTimeout(t);
    }
  }, [quakes, conflicts, newsEvents]);

  // ── D3 MAP ─────────────────────────────────────────────────────────────────
  const buildMap = useCallback(() => {
    if (!worldData || !mapRef.current || !window.topojson) return;
    const container = mapRef.current;
    const W = container.clientWidth  || 900;
    const H = container.clientHeight || 500;

    const svg = d3.select(svgRef.current).attr("width", W).attr("height", H);
    svg.selectAll("*").remove();

    const proj = d3.geoNaturalEarth1().scale(W / 6.3).translate([W / 2, H / 2]);
    const gen  = d3.geoPath().projection(proj);
    projRef.current = proj;
    pathRef.current = gen;

    // Ocean
    svg.append("rect").attr("width", W).attr("height", H).attr("fill", "#02080f");

    // Sphere boundary
    svg.append("path")
      .datum({ type: "Sphere" })
      .attr("d", gen)
      .attr("fill", "#020c1a")
      .attr("stroke", "rgba(0,120,200,0.15)")
      .attr("stroke-width", 1);

    // Graticule
    const grat = d3.geoGraticule()();
    svg.append("path").datum(grat).attr("d", gen)
      .attr("fill", "none")
      .attr("stroke", "rgba(0,100,180,0.06)")
      .attr("stroke-width", 0.5);

    // Countries
    const countries = window.topojson.feature(worldData, worldData.objects.countries);
    const countryG = svg.append("g").attr("class", "countries");

    countryG.selectAll("path")
      .data(countries.features)
      .enter().append("path")
      .attr("d", gen)
      .attr("fill", "rgba(12,30,55,0.9)")
      .attr("stroke", "rgba(0,120,200,0.2)")
      .attr("stroke-width", 0.4)
      .style("cursor", "pointer")
      .on("mouseover", function(ev, d) {
        d3.select(this).attr("fill", "rgba(0,100,180,0.35)");
      })
      .on("mouseout", function() {
        d3.select(this).attr("fill", "rgba(12,30,55,0.9)");
      });

    // Country borders
    const borders = window.topojson.mesh(worldData, worldData.objects.countries, (a,b) => a !== b);
    svg.append("path").datum(borders).attr("d", gen)
      .attr("fill", "none")
      .attr("stroke", "rgba(0,100,180,0.18)")
      .attr("stroke-width", 0.3);

    setMapReady(true);
  }, [worldData]);

  useEffect(() => { buildMap(); }, [buildMap]);

  // ── PLOT EVENTS ON MAP ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !projRef.current || !svgRef.current) return;
    const proj = projRef.current;
    const svg  = d3.select(svgRef.current);

    svg.selectAll(".event-dot").remove();
    svg.selectAll(".event-ring").remove();

    const eventsWithCoords = [...quakes, ...conflicts].filter(e => e.lat && e.lng);

    eventsWithCoords.forEach(ev => {
      const [px, py] = proj([ev.lng, ev.lat]);
      if (!px || !py || px < 0 || py < 0) return;

      const col = SEV_COLOR[ev.severity] || "#fff";
      const r   = ev.type === "earthquake"
        ? Math.max(3, (ev.mag || 5) * 1.4)
        : ev.severity === "critical" ? 7
        : ev.severity === "high" ? 5 : 4;

      // Outer glow ring
      svg.append("circle")
        .attr("class", "event-ring")
        .attr("cx", px).attr("cy", py)
        .attr("r", r + 5)
        .attr("fill", "none")
        .attr("stroke", col)
        .attr("stroke-width", 1)
        .attr("opacity", 0.25);

      // Core dot
      svg.append("circle")
        .attr("class", "event-dot")
        .attr("cx", px).attr("cy", py)
        .attr("r", r)
        .attr("fill", col)
        .attr("opacity", 0.88)
        .attr("stroke", "rgba(0,0,0,0.5)")
        .attr("stroke-width", 0.5)
        .style("cursor", "pointer")
        .on("mouseover", (mouseEv) => {
          const rect = mapRef.current.getBoundingClientRect();
          setTooltip({
            x: mouseEv.clientX - rect.left,
            y: mouseEv.clientY - rect.top,
            ev,
          });
        })
        .on("mouseout", () => setTooltip(null))
        .on("click", () => setSelectedEvent(ev));
    });
  }, [quakes, conflicts, mapReady, pulse]);

  // ── FILTER + SEARCH ────────────────────────────────────────────────────────
  const sl = search.toLowerCase();
  const filtered = allEvents.filter(e => {
    if (filter !== "all" && e.type !== filter) return false;
    if (sl && !e.title?.toLowerCase().includes(sl) && !e.location?.toLowerCase().includes(sl)) return false;
    return true;
  });

  const critCount     = allEvents.filter(e => e.severity === "critical").length;
  const conflictCount = allEvents.filter(e => e.type === "conflict" || e.type === "violence").length;

  const srcBadge = (key) => ({
    live:    { color: "#00ff88", label: "LIVE" },
    demo:    { color: "#ffc800", label: "DEMO" },
    error:   { color: "#ff4444", label: "ERR"  },
    loading: { color: "#4488ff", label: "..."  },
  }[sources[key]] || { color:"#777", label:"?" });

  return (
    <div style={{
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      background: "#010810",
      color: "#9ab8cc",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* ── BREAKING ALERT ── */}
      {alert && (
        <div style={{
          background: "linear-gradient(90deg, #8b0010, #cc0020, #8b0010)",
          color: "#fff",
          padding: "7px 20px",
          fontSize: "11px",
          fontWeight: "bold",
          letterSpacing: "0.12em",
          textAlign: "center",
          borderBottom: "1px solid #ff3355",
          flexShrink: 0,
          animation: "alertSlide 0.3s ease",
          zIndex: 9999,
        }}>
          ⚡ BREAKING — {alert}
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 18px",
        background: "rgba(1,6,16,0.98)",
        borderBottom: "1px solid rgba(0,140,255,0.12)",
        flexShrink: 0,
        gap: "16px",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
          <div style={{
            width: "38px", height: "38px",
            border: "2px solid #ff1a3a",
            borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "17px",
            animation: "heartbeat 2s infinite",
            boxShadow: "0 0 22px rgba(255,26,58,0.45)",
          }}>🌐</div>
          <div>
            <div style={{
              fontSize: "22px",
              fontWeight: "bold",
              color: "#fff",
              letterSpacing: "0.28em",
              lineHeight: 1,
              textShadow: "0 0 20px rgba(255,50,80,0.4)",
            }}>BEGDAR</div>
            <div style={{ fontSize: "8.5px", color: "#0080cc", letterSpacing: "0.38em", marginTop: "3px" }}>
              GLOBAL SITUATION MONITOR
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative", flex: 1, maxWidth: "400px" }}>
          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#334", fontSize: "13px" }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search country, city, event type..."
            style={{
              width: "100%",
              background: "rgba(0,15,35,0.8)",
              border: "1px solid rgba(0,140,255,0.2)",
              borderRadius: "4px",
              padding: "7px 32px 7px 32px",
              color: "#aaccdd",
              fontSize: "12px",
              fontFamily: "inherit",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.2s",
            }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{
              position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "#445", cursor: "pointer", fontSize: "13px",
            }}>✕</button>
          )}
        </div>

        {/* Status badges */}
        <div style={{ display: "flex", gap: "8px", flexShrink: 0, alignItems: "center" }}>
          {["usgs","gdelt","acled"].map(k => {
            const b = srcBadge(k);
            return (
              <div key={k} style={{
                padding: "4px 8px",
                background: `${b.color}12`,
                border: `1px solid ${b.color}40`,
                borderRadius: "3px",
                fontSize: "9px",
                color: b.color,
                letterSpacing: "0.1em",
                display: "flex", gap: "5px", alignItems: "center",
              }}>
                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: b.color, animation: b.label === "LIVE" ? "pulse 1.5s infinite" : "none" }} />
                {k.toUpperCase()} {b.label}
              </div>
            );
          })}

          <div style={{
            background: "rgba(255,26,58,0.1)",
            border: "1px solid rgba(255,26,58,0.4)",
            borderRadius: "4px",
            padding: "5px 10px",
            display: "flex", gap: "7px", alignItems: "center",
          }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#ff1a3a", animation: "pulse 1s infinite" }} />
            <span style={{ fontSize: "11px", color: "#ff3355", fontWeight: "bold", letterSpacing: "0.1em" }}>
              {critCount} CRITICAL
            </span>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "16px", color: "#0099dd", fontWeight: "bold", letterSpacing: "0.07em" }}>
              {time.toISOString().slice(11,19)}&nbsp;<span style={{ fontSize: "9px", color: "#2a4a5a" }}>UTC</span>
            </div>
            <div style={{ fontSize: "8px", color: "#1a3040", letterSpacing: "0.18em" }}>{time.toDateString().toUpperCase()}</div>
          </div>
        </div>
      </header>

      {/* ── FILTER BAR ── */}
      <div style={{
        display: "flex", gap: "6px", padding: "7px 16px",
        background: "rgba(1,6,16,0.95)",
        borderBottom: "1px solid rgba(0,100,180,0.08)",
        flexShrink: 0,
        flexWrap: "wrap",
        alignItems: "center",
      }}>
        <span style={{ fontSize: "9px", color: "#1a3050", letterSpacing: "0.2em", marginRight: "4px" }}>FILTER:</span>
        {[
          ["all",       "🌐 ALL"],
          ["conflict",  "⚔  CONFLICT"],
          ["earthquake","〰 SEISMIC"],
          ["violence",  "💥 VIOLENCE"],
          ["weather",   "⛈ WEATHER"],
          ["disaster",  "🔥 DISASTER"],
          ["political", "🏛 POLITICAL"],
          ["health",    "🏥 HEALTH"],
        ].map(([f, lbl]) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "3px 9px",
            background: filter === f ? `rgba(${f==="conflict"?"255,26,58":f==="earthquake"?"255,114,0":"0,140,255"},0.15)` : "transparent",
            border: `1px solid ${filter === f ? (f==="conflict"?"#ff1a3a":f==="earthquake"?"#ff7200":"#0af") : "rgba(0,100,180,0.18)"}`,
            color: filter === f ? (f==="conflict"?"#ff3355":f==="earthquake"?"#ff7200":"#0af") : "#2a4a5a",
            borderRadius: "3px",
            cursor: "pointer",
            fontSize: "9px",
            letterSpacing: "0.08em",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}>{lbl}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: "9px", color: "#1a3050" }}>
          {filtered.length} EVENTS SHOWN
        </span>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── MAP ── */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }} ref={mapRef}>
          <TopojsonLoader onLoad={buildMap} />
          <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }} />

          {/* Tooltip */}
          {tooltip && (
            <div style={{
              position: "absolute",
              left: Math.min(tooltip.x + 14, (mapRef.current?.clientWidth || 800) - 240),
              top:  Math.max(tooltip.y - 30, 10),
              background: "rgba(1,8,20,0.96)",
              border: `1px solid ${SEV_COLOR[tooltip.ev.severity]}`,
              borderRadius: "5px",
              padding: "9px 13px",
              fontSize: "11px",
              maxWidth: "230px",
              pointerEvents: "none",
              zIndex: 60,
              boxShadow: `0 0 16px ${SEV_COLOR[tooltip.ev.severity]}30`,
            }}>
              <div style={{ color: SEV_COLOR[tooltip.ev.severity], fontWeight: "bold", marginBottom: "5px", fontSize: "12px" }}>
                {TYPE_META[tooltip.ev.type]?.icon} {tooltip.ev.type === "earthquake" ? `M${tooltip.ev.mag}` : tooltip.ev.severity.toUpperCase()}
              </div>
              <div style={{ color: "#cce", lineHeight: "1.5", marginBottom: "4px" }}>{tooltip.ev.title}</div>
              <div style={{ color: "#456" }}>📍 {tooltip.ev.location}</div>
              {tooltip.ev.fatalities > 0 && (
                <div style={{ color: "#ff4466", marginTop: "3px" }}>☠ {tooltip.ev.fatalities} fatalities</div>
              )}
            </div>
          )}

          {/* Map info */}
          <div style={{
            position: "absolute", bottom: "12px", left: "12px",
            display: "flex", gap: "8px",
          }}>
            <div style={{
              background: "rgba(1,8,20,0.88)",
              border: "1px solid rgba(0,80,160,0.2)",
              borderRadius: "5px",
              padding: "8px 11px",
              fontSize: "10px",
            }}>
              <div style={{ color: "#0077aa", letterSpacing: "0.18em", marginBottom: "6px", fontSize: "9px" }}>SEVERITY</div>
              {Object.entries(SEV_COLOR).map(([s, c]) => (
                <div key={s} style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"3px" }}>
                  <div style={{ width:"7px", height:"7px", borderRadius:"50%", background:c }} />
                  <span style={{ color:"#2a5070", fontSize:"9px" }}>{s.toUpperCase()}</span>
                </div>
              ))}
            </div>
            <div style={{
              background: "rgba(1,8,20,0.88)",
              border: "1px solid rgba(0,80,160,0.2)",
              borderRadius: "5px",
              padding: "8px 11px",
              fontSize: "9px",
            }}>
              <div style={{ color: "#0077aa", letterSpacing: "0.18em", marginBottom: "6px" }}>LIVE ON MAP</div>
              <div style={{ color: "#ff7200", marginBottom:"2px" }}>〰 {quakes.length} Earthquakes</div>
              <div style={{ color: "#ff1a3a", marginBottom:"2px" }}>⚔ {conflicts.length} Conflicts</div>
              <div style={{ color: "#4488ff" }}>📰 {newsEvents.length} News events</div>
            </div>
          </div>

          {loading && (
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(1,6,16,0.85)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: "14px",
            }}>
              <div style={{ fontSize: "36px", animation: "spin 2s linear infinite" }}>🌐</div>
              <div style={{ fontSize: "11px", color: "#0099dd", letterSpacing: "0.35em" }}>CONNECTING TO LIVE FEEDS...</div>
              <div style={{ display: "flex", gap: "10px" }}>
                {["USGS","GDELT","ACLED"].map((s,i) => (
                  <div key={s} style={{
                    fontSize: "9px", color: "#1a3a50",
                    border: "1px solid #0a2030",
                    borderRadius: "3px",
                    padding: "3px 7px",
                    animation: `fadeIn 0.5s ${i*0.2}s both`,
                  }}>{s}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── SIDE PANEL ── */}
        <div style={{
          width: "340px",
          flexShrink: 0,
          background: "rgba(1,5,14,0.98)",
          borderLeft: "1px solid rgba(0,100,180,0.1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Quick stats */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            borderBottom: "1px solid rgba(0,100,180,0.08)",
            flexShrink: 0,
          }}>
            {[
              { l: "TOTAL", v: allEvents.length, c: "#4488ff" },
              { l: "CONFLICTS", v: conflictCount, c: "#ff1a3a" },
              { l: "SEISMIC", v: quakes.length, c: "#ff7200" },
            ].map((s,i) => (
              <div key={i} style={{
                padding: "9px 8px", textAlign: "center",
                borderRight: i < 2 ? "1px solid rgba(0,100,180,0.08)" : "none",
              }}>
                <div style={{ fontSize: "20px", fontWeight: "bold", color: s.c }}>{s.v}</div>
                <div style={{ fontSize: "8px", color: "#1a3040", letterSpacing: "0.15em", marginTop: "1px" }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Event feed */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.length === 0 && !loading && (
              <div style={{ padding: "24px", textAlign: "center", color: "#1a3040", fontSize: "12px" }}>
                No events match your filters
              </div>
            )}
            {filtered.map((ev, idx) => {
              const meta = TYPE_META[ev.type] || TYPE_META.info;
              const isSelected = selectedEvent?.id === ev.id;
              return (
                <div
                  key={ev.id || idx}
                  onClick={() => setSelectedEvent(isSelected ? null : ev)}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid rgba(0,80,140,0.07)",
                    borderLeft: `3px solid ${SEV_COLOR[ev.severity] || "#222"}`,
                    cursor: "pointer",
                    background: isSelected ? `${SEV_COLOR[ev.severity]}08` : "transparent",
                    transition: "background 0.1s",
                  }}
                >
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "14px", flexShrink: 0, marginTop: "1px" }}>{meta.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: "11.5px",
                        color: "#c8e0f0",
                        lineHeight: "1.4",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: isSelected ? 10 : 2,
                        WebkitBoxOrient: "vertical",
                      }}>{ev.title}</div>
                      <div style={{ display: "flex", gap: "8px", marginTop: "3px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "9px", color: "#1a3a50" }}>📍 {ev.location}</span>
                        <span style={{ fontSize: "9px", color: "#1a3a50" }}>{ev.timeStr}</span>
                        <span style={{ fontSize: "9px", color: "#1a3050" }}>· {ev.source}</span>
                      </div>
                    </div>
                    <div style={{
                      fontSize: "8.5px",
                      fontWeight: "bold",
                      color: SEV_COLOR[ev.severity],
                      border: `1px solid ${SEV_COLOR[ev.severity]}35`,
                      background: `${SEV_COLOR[ev.severity]}0d`,
                      borderRadius: "3px",
                      padding: "2px 5px",
                      flexShrink: 0,
                      letterSpacing: "0.05em",
                    }}>{ev.severity?.toUpperCase()}</div>
                  </div>

                  {isSelected && (
                    <div style={{
                      marginTop: "9px",
                      paddingTop: "9px",
                      borderTop: "1px solid rgba(0,100,180,0.12)",
                      fontSize: "11px",
                      color: "#5a7a90",
                      lineHeight: "1.65",
                    }}>
                      <div>{ev.detail}</div>
                      {ev.mag && (
                        <div style={{ color: "#ff7200", marginTop: "5px", fontWeight: "bold" }}>
                          〰 Magnitude {ev.mag} · Depth {ev.depth}km
                        </div>
                      )}
                      {ev.fatalities > 0 && (
                        <div style={{ color: "#ff3355", marginTop: "4px" }}>
                          ☠ Reported fatalities: {ev.fatalities}
                        </div>
                      )}
                      {ev.lat && (
                        <div style={{ color: "#2a4a5a", marginTop: "4px", fontSize: "10px" }}>
                          🌐 {ev.lat?.toFixed(2)}°, {ev.lng?.toFixed(2)}°
                        </div>
                      )}
                      {ev.url && (
                        <a href={ev.url} target="_blank" rel="noreferrer" style={{
                          display: "inline-block", marginTop: "6px",
                          color: "#0099cc", fontSize: "10px", textDecoration: "none",
                          border: "1px solid rgba(0,153,204,0.3)", borderRadius: "3px", padding: "2px 7px",
                        }}>→ Source ↗</a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 12px",
            borderTop: "1px solid rgba(0,80,140,0.1)",
            display: "flex", justifyContent: "space-between",
            fontSize: "8.5px",
            color: "#0e2535",
            letterSpacing: "0.1em",
            flexShrink: 0,
          }}>
            <span style={{ color: "#0e2030" }}>BEGDAR · by Beg Bajrami</span>
            <span>USGS · GDELT · ACLED</span>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap');
        @keyframes pulse       { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(1.4)} }
        @keyframes heartbeat   { 0%,100%{box-shadow:0 0 22px rgba(255,26,58,0.45)} 50%{box-shadow:0 0 38px rgba(255,26,58,0.85)} }
        @keyframes spin        { to{transform:rotate(360deg)} }
        @keyframes alertSlide  { from{transform:translateY(-100%);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes fadeIn      { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar { width: 3px }
        ::-webkit-scrollbar-track { background: #010810 }
        ::-webkit-scrollbar-thumb { background: rgba(0,100,180,0.25); border-radius: 2px }
        input::placeholder { color: #122030 }
        input:focus { border-color: rgba(0,140,255,0.45) !important; box-shadow: 0 0 10px rgba(0,140,255,0.08) }
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
    return () => {};
  }, [onLoad]);
  return null;
}
