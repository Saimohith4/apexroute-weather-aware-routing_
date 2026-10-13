import { useEffect, useRef, useState, type FormEvent } from "react";

import {

  Truck,
  MapPin,
  CalendarClock,
  Weight,
  Route,
  CloudSun,
  ArrowRight,
  LoaderCircle,
  ShieldCheck,
  Settings,
  Radar,
  SlidersHorizontal,
  ShieldAlert,
  Sun,
  Moon,
  FlaskConical,
  RefreshCw,
  TrendingDown,
  LogIn,
  LogOut,
  UserPlus,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
  ChevronDown,
  AtSign,
  CircleUserRound,
} from "lucide-react";

import "./App.css";

import RouteMap from "./RouteMap";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const defaultApiUrl = import.meta.env.DEV
  ? "http://127.0.0.1:8000/api"
  : "/api";
const API_BASE_URL = (configuredApiUrl || defaultApiUrl).replace(/\/+$/, "");


export type Position = [longitude: number, latitude: number];

export type HourlyForecast = {

  hour: number;
  forecast_time: string;
  wind_mph: number;
  rain_inches: number;
  snowfall_inches: number;
  risk: {
    overall_risk: string;
    risk_score?: number;
    risks?: { wind?: string; rain?: string; snow?: string };
    no_travel?: boolean;
  };
};

export type RouteCheckpoint = {

  mile?: number;
  distance_miles?: number;
  latitude?: number;
  longitude?: number;
  eta: string;
  data_available: boolean;
  weather?: {
    wind_mph: number;
    rain_inches: number;
    snowfall_inches: number;
    forecast_time?: string;
  } | null;
  risk?: {
    overall_risk: string;
    risk_score?: number;
    risks?: {
      wind?: string;
      rain?: string;
      snow?: string;
    };
    no_travel?: boolean;
  } | null;
  forecast_hours?: HourlyForecast[];
};

export type RouteResult = {

  route_id: number;
  distance_miles: number;
  duration_seconds: number;
  severe_miles: number;
  high_miles: number;
  average_risk_score: number | null;
  weather_coverage_percent: number;
  unknown_miles: number;
  recommendation_rank: number;
  coordinates: Position[];
  checkpoints: RouteCheckpoint[];
};

type AnalysisResult = {

  status: string;
  message: string;
  recommended_route_id: number | null;
  routes: RouteResult[];
};

function getDefaultDeparture(): string {

  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

type LocationSuggestion = {

  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

type LocationAutocompleteProps = {

  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

function LocationAutocomplete({

  id,
  label,
  value,
  placeholder,
  onChange,
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const requestNumber = useRef(0);
  useEffect(() => {
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      setIsSearching(false);
      setSearchError("");
      return;
    }
    const currentRequest = ++requestNumber.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError("");
      try {
        const params = new URLSearchParams({
          q: query,
          format: "jsonv2",
          addressdetails: "1",
          limit: "5",
        });
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
          {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
        );
        if (!response.ok) {
          throw new Error("Location search is temporarily unavailable.");
        }
        const data = (await response.json()) as LocationSuggestion[];
        if (currentRequest === requestNumber.current) {
          setSuggestions(data);
          setIsOpen(true);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError" &&
            currentRequest === requestNumber.current) {
          setSuggestions([]);
          setIsOpen(true);
          setSearchError("Could not load suggestions. You can still enter the location manually.");
        }
      } finally {
        if (currentRequest === requestNumber.current) {
          setIsSearching(false);
        }
      }
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [value]);
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);
  function chooseSuggestion(suggestion: LocationSuggestion) {
    onChange(suggestion.display_name);
    setSuggestions([]);
    setIsOpen(false);
    setSearchError("");
  }
  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <div className="input-wrap">
        <MapPin size={18} aria-hidden="true" />
        <input
          id={id}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (value.trim().length >= 3) setIsOpen(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-controls={`${id}-suggestions`}
          required
        />
        {isSearching && (
          <LoaderCircle className="spin" size={16} aria-label="Searching locations" />
        )}
      </div>
      {isOpen && (suggestions.length > 0 || isSearching || searchError) && (
        <div
          id={`${id}-suggestions`}
          role="listbox"
          aria-label={`${label} suggestions`}
          style={{
            position: "absolute",
            zIndex: 50,
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            maxHeight: 260,
            overflowY: "auto",
            background: "#ffffff",
            border: "1px solid #dce3ed",
            borderRadius: 12,
            boxShadow: "0 16px 36px rgba(18, 34, 58, 0.16)",
            padding: 6,
          }}
        >
          {isSearching && (
            <div style={{ padding: "12px 14px", color: "#64748b", fontSize: 13 }}>
              Searching locations…
            </div>
          )}
          {!isSearching && searchError && (
            <div style={{ padding: "12px 14px", color: "#64748b", fontSize: 13 }}>
              {searchError}
            </div>
          )}
          {!isSearching && !searchError && suggestions.length === 0 && (
            <div style={{ padding: "12px 14px", color: "#64748b", fontSize: 13 }}>
              No matching locations found.
            </div>
          )}
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.place_id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => chooseSuggestion(suggestion)}
              style={{
                display: "block",
                width: "100%",
                padding: "11px 12px",
                border: 0,
                borderRadius: 8,
                background: "transparent",
                color: "#17243a",
                textAlign: "left",
                fontSize: 13,
                lineHeight: 1.45,
                cursor: "pointer",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = "#f1f5f9";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ display: "block", fontWeight: 600 }}>
                {suggestion.display_name.split(",").slice(0, 2).join(",")}
              </span>
              <span style={{ display: "block", color: "#64748b", marginTop: 2 }}>
                {suggestion.display_name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type AuthUser = { id: number; username: string; email: string; first_name?: string; last_name?: string };

const AUTH_API = `${API_BASE_URL}/auth/`;

async function fetchCsrfToken(): Promise<string> {
  const response = await fetch(`${AUTH_API}csrf/`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Could not initialize CSRF protection."));
  }
  const data = await response.json() as { csrfToken?: string };
  if (!data.csrfToken) {
    throw new Error("The authentication service did not return a CSRF token.");
  }
  return data.csrfToken;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as Record<string, unknown>;
    if (typeof data.error === "string") return data.error;
    if (typeof data.detail === "string") return data.detail;
    if (typeof data.message === "string") return data.message;
  } catch { /* response may not contain JSON */ }
  return fallback;
}

function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`${AUTH_API}me/`, { method: "GET", credentials: "include" })
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json() as { user?: AuthUser } & AuthUser;
          if (active) setAuthUser(data.user ?? data);
        }
      })
      .catch(() => {
        if (active) setAuthError("Unable to reach the authentication service. Start Django and add the authentication endpoints.");
      })
      .finally(() => { if (active) setAuthChecked(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!profileMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileMenuOpen]);

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = window.localStorage.getItem("apexroute-theme");
    return saved === "light" || saved === "dark" ? saved : "dark";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("apexroute-theme", theme);
  }, [theme]);
  const [activePage, setActivePage] = useState<"dispatch" | "arbitrator" | "corridor" | "forecast" | "simulator" | "settings">("dispatch");
  const [baselineResult, setBaselineResult] = useState<AnalysisResult | null>(null);
  const [baselineInputs, setBaselineInputs] = useState<{ origin: string; destination: string; departure: string; load: string; interval: string } | null>(null);
  const [simulationDeparture, setSimulationDeparture] = useState(getDefaultDeparture());
  const [simulationLoad, setSimulationLoad] = useState("25000");
  const [simulationInterval, setSimulationInterval] = useState("10");
  const [simulationResult, setSimulationResult] = useState<AnalysisResult | null>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState("");
  const [origin, setOrigin] = useState("Austin, Texas, USA");
  const [destination, setDestination] = useState(
    "Mueller Lake Park, Austin, Texas, USA",
  );
  const [departure, setDeparture] = useState(getDefaultDeparture());
  const [load, setLoad] = useState("25000");
  const [interval, setInterval] = useState("10");
  const [forecastHour, setForecastHour] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function analyzeTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setSelectedRouteId(null);
    setForecastHour(0);
    try {
      const csrfToken = await fetchCsrfToken();
      const response = await fetch(
        `${API_BASE_URL}/analyze-route/`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken,
          },
          body: JSON.stringify({
            origin: origin.trim(),
            destination: destination.trim(),
            departure_time: new Date(departure).toISOString(),
            load_lbs: Number(load),
            interval_miles: Number(interval),
          }),
        },
      );
      const data: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "Unable to analyze this trip.";
        throw new Error(message);
      }
      if (
        typeof data !== "object" ||
        data === null ||
        !("routes" in data) ||
        !Array.isArray(data.routes)
      ) {
        throw new Error("The backend returned an unexpected response.");
      }
      const analysis = data as AnalysisResult;
      setResult(analysis);
      setBaselineResult(analysis);
      setBaselineInputs({ origin: origin.trim(), destination: destination.trim(), departure, load, interval });
      setSimulationDeparture(departure);
      setSimulationLoad(load);
      setSimulationInterval(interval);
      setSimulationResult(null);
      setSelectedRouteId(
        analysis.recommended_route_id ??
          analysis.routes[0]?.route_id ??
          null,
      );
      setActivePage("arbitrator");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to the Django backend.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function runWhatIfSimulation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!baselineResult || !baselineInputs) {
      setSimulationError("Run a baseline route analysis first, then test a scenario.");
      return;
    }
    setSimulationLoading(true);
    setSimulationError("");
    setSimulationResult(null);
    try {
      const csrfToken = await fetchCsrfToken();
      const response = await fetch(`${API_BASE_URL}/analyze-route/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
        body: JSON.stringify({
          origin: baselineInputs.origin,
          destination: baselineInputs.destination,
          departure_time: new Date(simulationDeparture).toISOString(),
          load_lbs: Number(simulationLoad),
          interval_miles: Number(simulationInterval),
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
          ? data.error
          : "Unable to simulate this scenario.";
        throw new Error(message);
      }
      if (typeof data !== "object" || data === null || !("routes" in data) || !Array.isArray(data.routes)) {
        throw new Error("The backend returned an unexpected simulation response.");
      }
      setSimulationResult(data as AnalysisResult);
    } catch (err: unknown) {
      setSimulationError(err instanceof Error ? err.message : "Could not connect to the Django backend.");
    } finally {
      setSimulationLoading(false);
    }
  }
  function openSimulator() {
    setSimulationDeparture(departure);
    setSimulationLoad(load);
    setSimulationInterval(interval);
    setSimulationError("");
    setActivePage("simulator");
  }
  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    if (authMode === "register" && authPassword !== authConfirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }
    if (authPassword.length < 8) {
      setAuthError("Use a password with at least 8 characters.");
      return;
    }
    setAuthLoading(true);
    try {
      const csrfToken = await fetchCsrfToken();
      const response = await fetch(`${AUTH_API}${authMode === "register" ? "register/" : "login/"}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
        body: JSON.stringify(authMode === "register"
          ? { full_name: authName.trim(), email: authEmail.trim(), password: authPassword }
          : { email: authEmail.trim(), password: authPassword }),
      });
      if (!response.ok) throw new Error(await readApiError(response, authMode === "register" ? "Could not create your account." : "Invalid email or password."));
      const data = await response.json() as { user?: AuthUser } & AuthUser;
      setAuthUser(data.user ?? data);
      setAuthPassword("");
      setAuthConfirmPassword("");
      setAuthError("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  }

  
async function logoutUser() {
  try {
    const csrfToken = await fetchCsrfToken();
    const response = await fetch(`${AUTH_API}logout/`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRFToken": csrfToken },
    });

    if (!response.ok) {
      throw new Error(await readApiError(response, "Could not log out."));
    }

   
    setAuthUser(null);
    setAuthMode("login");
    setAuthEmail("");
    setAuthPassword("");
    setAuthConfirmPassword("");
    setAuthName("");
    setAuthError("");
    setProfileMenuOpen(false);

    
    setResult(null);
    setBaselineResult(null);
    setBaselineInputs(null);
    setSimulationResult(null);
    setSimulationError("");

    
    setSelectedRouteId(null);
    setForecastHour(0);
    setActivePage("dispatch");

    
    setOrigin("Austin, Texas, USA");
    setDestination("Mueller Lake Park, Austin, Texas, USA");
    setDeparture(getDefaultDeparture());
    setLoad("25000");
    setInterval("10");

    
    setSimulationDeparture(getDefaultDeparture());
    setSimulationLoad("25000");
    setSimulationInterval("10");

    setError("");
    setLoading(false);
    setSimulationLoading(false);
  } catch (error) {
    setAuthError(
      error instanceof Error ? error.message : "Could not log out."
    );
  }
}


  const baselineRecommendedRoute = baselineResult?.routes.find(route => route.route_id === baselineResult.recommended_route_id) ?? baselineResult?.routes[0] ?? null;
  const simulatedRecommendedRoute = simulationResult?.routes.find(route => route.route_id === simulationResult.recommended_route_id) ?? simulationResult?.routes[0] ?? null;
  const selectedRoute = result?.routes.find(
    (route) => route.route_id === selectedRouteId,
  );
  const selectedForecasts = (selectedRoute?.checkpoints ?? []).flatMap((checkpoint) => {
    const sample = checkpoint.forecast_hours?.find((item) => item.hour === forecastHour);
    return sample ? [{ checkpoint, sample }] : [];
  });
  const riskCounts = selectedForecasts.reduce<Record<string, number>>((counts, item) => {
    const risk = item.sample.risk.overall_risk || "Unknown";
    counts[risk] = (counts[risk] ?? 0) + 1;
    return counts;
  }, {});
  const averageWind = selectedForecasts.length
    ? selectedForecasts.reduce((sum, item) => sum + item.sample.wind_mph, 0) / selectedForecasts.length
    : null;
  const totalRain = selectedForecasts.reduce((sum, item) => sum + item.sample.rain_inches, 0);
  const totalSnow = selectedForecasts.reduce((sum, item) => sum + item.sample.snowfall_inches, 0);
  if (!authChecked || !authUser) {
    return (
      <main className={`auth-screen ${theme === "dark" ? "auth-dark" : "auth-light"}`}>
        <section className="auth-brand-panel">
          <div className="auth-brand"><span className="auth-brand-icon"><Radar size={24} /></span><span><strong>APEXROUTE</strong><small>FLEET INTELLIGENCE</small></span></div>
          <div className="auth-hero-copy"><span className="auth-eyebrow">INTELLIGENT FLEET PLANNING</span><h1>Every mile.<br/><span>Weather-aware.</span></h1><p>Plan safer journeys with weather-aware routing, checkpoint risk analysis, and scenario simulation.</p><div className="auth-feature-list"><span><ShieldCheck size={16}/> Load-aware safety analysis</span><span><CloudSun size={16}/> Weather at estimated arrival</span><span><FlaskConical size={16}/> What-if route simulation</span></div></div>
          <span className="auth-footer-note">APEXROUTE · WEATHER INTELLIGENCE</span>
        </section>
        <section className="auth-form-panel">
          <button className="auth-theme-toggle" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}</button>
          <div className="auth-form-wrap">
            {!authChecked ? <div className="auth-loading"><LoaderCircle className="spin" size={28}/><p>Checking your session…</p></div> : <>
              <span className="auth-eyebrow">WELCOME {authMode === "login" ? "BACK" : "ABOARD"}</span>
              <h2>{authMode === "login" ? "Sign in to ApexRoute" : "Create your account"}</h2>
              <p className="auth-subtitle">{authMode === "login" ? "Access your route plans and fleet intelligence workspace." : "Set up your workspace to start planning weather-aware routes."}</p>
              <form className="auth-form" onSubmit={submitAuth}>
                {authMode === "register" && <label><span>FULL NAME</span><div className="auth-input"><UserRound size={17}/><input value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Your full name" autoComplete="name" required/></div></label>}
                <label><span>EMAIL ADDRESS</span><div className="auth-input"><Mail size={17}/><input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required/></div></label>
                <label><span>PASSWORD</span><div className="auth-input"><LockKeyhole size={17}/><input type={showPassword ? "text" : "password"} value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={authMode === "login" ? "current-password" : "new-password"} minLength={8} required/><button type="button" className="auth-show-password" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
                {authMode === "register" && <label><span>CONFIRM PASSWORD</span><div className="auth-input"><LockKeyhole size={17}/><input type={showPassword ? "text" : "password"} value={authConfirmPassword} onChange={e => setAuthConfirmPassword(e.target.value)} placeholder="Re-enter your password" autoComplete="new-password" minLength={8} required/></div></label>}
                {authError && <div className="auth-error" role="alert">{authError}</div>}
                <button className="auth-submit" type="submit" disabled={authLoading}>{authLoading ? <LoaderCircle className="spin" size={17}/> : authMode === "login" ? <LogIn size={17}/> : <UserPlus size={17}/>} {authLoading ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}<ArrowRight size={17}/></button>
              </form>
              <p className="auth-switch">{authMode === "login" ? "New to ApexRoute?" : "Already have an account?"} <button type="button" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}>{authMode === "login" ? "Create account" : "Sign in"}</button></p>
              <p className="auth-security-note"><ShieldCheck size={14}/> Your account is protected by secure server-side authentication.</p>
            </>}
          </div>
        </section>
      </main>
    );
  }
  return (
    <main className={`app-shell page-${activePage}`}>
      <aside className="sidebar">
        <a className="sidebar-brand" href="#dispatch" aria-label="ApexRoute home">
          <span className="sidebar-brand-icon"><Radar size={20} /></span>
          <span className="sidebar-brand-copy"><strong>APEXROUTE</strong><small>FLEET INTELLIGENCE</small></span>
          <span className="sidebar-online"><i /> ONLINE</span>
        </a>
        <span className="sidebar-label">OPERATIONAL UNITS</span>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <button type="button" className={`sidebar-link ${activePage === "dispatch" ? "active" : ""}`} onClick={() => setActivePage("dispatch")}>
            <SlidersHorizontal size={17} /><span>Dispatch &amp; Configuration</span>
          </button>
          <button type="button" className={`sidebar-link ${activePage === "arbitrator" ? "active" : ""}`} onClick={() => setActivePage("arbitrator")}>
            <Route size={17} /><span>Route Arbitrator</span>
          </button>
          <button type="button" className={`sidebar-link ${activePage === "simulator" ? "active" : ""}`} onClick={openSimulator}>
            <FlaskConical size={17} /><span>What-If Simulator</span>
          </button>
          <button type="button" className={`sidebar-link ${activePage === "corridor" ? "active" : ""}`} onClick={() => setActivePage("corridor")}>
            <MapPin size={17} /><span>Corridor Heatmap</span>
          </button>
          <button type="button" className={`sidebar-link ${activePage === "forecast" ? "active" : ""}`} onClick={() => setActivePage("forecast")}>
            <ShieldAlert size={17} /><span>Risk Matrix &amp; Safety</span>
          </button>
        </nav>

      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-system">
            <span className="system-nominal"><i /> READY TO PLAN</span>
          </div>
          <div className="topbar-actions">
            <div className="profile-menu-wrap" ref={profileMenuRef}>
              <button
                type="button"
                className={`controller-profile ${profileMenuOpen ? "is-open" : ""}`}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                aria-label="Open profile menu"
                onClick={() => setProfileMenuOpen((open) => !open)}
              >
                <span className="controller-avatar"><UserRound size={17} /></span>
                <span className="controller-profile-copy">
                  <strong>{[authUser.first_name, authUser.last_name].filter(Boolean).join(" ") || authUser.username || "My profile"}</strong>
                  <small>Account &amp; preferences</small>
                </span>
                <ChevronDown className="profile-chevron" size={15} />
              </button>
              {profileMenuOpen && (
                <div className="profile-dropdown" role="menu" aria-label="Profile menu">
                  <div className="profile-dropdown-heading">
                    <span className="controller-avatar"><UserRound size={18} /></span>
                    <span>
                      <strong>{[authUser.first_name, authUser.last_name].filter(Boolean).join(" ") || authUser.username || "ApexRoute user"}</strong>
                      <small>{authUser.email || "Email not available"}</small>
                    </span>
                  </div>
                  <div className="profile-detail-list">
                    <div><AtSign size={14} /><span>Username</span><strong>{authUser.username || "—"}</strong></div>
                    <div><Mail size={14} /><span>Email</span><strong title={authUser.email}>{authUser.email || "—"}</strong></div>
                    <div><CircleUserRound size={14} /><span>Account ID</span><strong>{authUser.id}</strong></div>
                  </div>
                  <div className="profile-dropdown-status"><i /> Signed in securely</div>
                  <button type="button" className="profile-menu-action" role="menuitem" onClick={() => { setActivePage("settings"); setProfileMenuOpen(false); }}>
                    <Settings size={16} /><span>Settings</span><small>{activePage === "settings" ? "Open" : "Preferences"}</small>
                  </button>
                  <button type="button" className="profile-menu-action profile-signout-action" role="menuitem" onClick={() => { setProfileMenuOpen(false); void logoutUser(); }}>
                    <LogOut size={16} /><span>Sign out</span><small>Log out</small>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      {activePage === "dispatch" && <section className="hero" id="dispatch">
        <div className="eyebrow">
          <span className="eyebrow-line" />
          INTELLIGENT FLEET PLANNING
        </div>
        <h1>
          Every mile.
          <br />
          <span>Weather-aware.</span>
        </h1>
        <p>
          Compare truck routes with forecast conditions at your estimated
          arrival time. Plan smarter before the journey begins.
        </p>
      </section>}
      {activePage !== "dispatch" && (
        <section className="page-heading">
          <span className="eyebrow">
            {activePage === "arbitrator" ? "ROUTE DECISION ENGINE" : activePage === "corridor" ? "CORRIDOR OVERVIEW" : activePage === "forecast" ? "RISK MATRIX & SAFETY" : activePage === "simulator" ? "SCENARIO LAB" : "PREFERENCES"}
          </span>
          <h1>
            {activePage === "arbitrator" ? "Route arbitrator" : activePage === "corridor" ? "Corridor heatmap" : activePage === "forecast" ? "Risk Matrix & Safety" : activePage === "simulator" ? "What-if route simulator" : "Settings"}
          </h1>
          <p>
            {activePage === "arbitrator" ? "Compare route safety, exposure, and travel efficiency." : activePage === "corridor" ? "Inspect route geometry and checkpoint-level weather risk." : activePage === "forecast" ? "Review checkpoint risk levels and forecast conditions across the next 48 hours." : activePage === "simulator" ? "Change departure time or payload and rerun the real analysis to see how the recommended plan changes." : "Personalize the dashboard appearance and viewing experience."}
          </p>
        </section>
      )}
      <section className="workspace">
        {activePage === "dispatch" && <form className="planner panel" onSubmit={analyzeTrip}>
          <div className="section-heading">
            <div className="heading-icon">
              <Truck size={19} />
            </div>
            <div>
              <h2>Plan your trip</h2>
              <p>Configure your journey parameters</p>
            </div>
          </div>
          <label className="field-label" htmlFor="origin">
            ORIGIN
          </label>
          <LocationAutocomplete
            id="origin"
            label="Origin"
            value={origin}
            onChange={setOrigin}
            placeholder="Enter starting location"
          />
          <label className="field-label" htmlFor="destination">
            DESTINATION
          </label>
          <LocationAutocomplete
            id="destination"
            label="Destination"
            value={destination}
            onChange={setDestination}
            placeholder="Enter destination"
          />
          <div className="field-grid">
            <div>
              <label className="field-label" htmlFor="departure">
                DEPARTURE
              </label>
              <div className="input-wrap">
                <CalendarClock size={17} />
                <input
                  id="departure"
                  type="datetime-local"
                  value={departure}
                  onChange={(event) => setDeparture(event.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="load">
                LOAD (LB)
              </label>
              <div className="input-wrap">
                <Weight size={17} />
                <input
                  id="load"
                  type="number"
                  min="0"
                  max="100000"
                  value={load}
                  onChange={(event) => setLoad(event.target.value)}
                  required
                />
              </div>
            </div>
          </div>
          <label className="field-label">
            WEATHER CHECKPOINT INTERVAL
          </label>
          <div className="interval-options">
            {["10", "25", "50"].map((value) => (
              <button
                key={value}
                type="button"
                className={`interval-option ${
                  interval === value ? "selected" : ""
                }`}
                aria-pressed={interval === value}
                onClick={() => setInterval(value)}
              >
                {value} <span>miles</span>
              </button>
            ))}
          </div>
          <button
            className="analyze-button"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <LoaderCircle className="spin" size={18} />
                Analyzing routes...
              </>
            ) : (
              <>
                Analyze routes <ArrowRight size={18} />
              </>
            )}
          </button>
          <p className="form-footnote">
            <ShieldCheck size={15} />
            Weather forecasts may be incomplete or uncertain.
          </p>
        </form>}
        <section className="results-area" id="route-comparison">
          {activePage === "simulator" && (
            <div className="simulator-layout">
              <section className="panel simulator-intro">
                <div className="simulator-icon"><FlaskConical size={22} /></div>
                <div><span className="eyebrow">WHAT-IF SCENARIO</span><h2>Test a different plan</h2><p>Keep the same origin and destination, adjust the departure time or truck payload, and rerun the actual route and weather analysis. Your baseline remains unchanged.</p></div>
              </section>
              {!baselineResult || !baselineInputs ? (
                <section className="panel simulator-empty"><CloudSun size={28}/><h3>Build your baseline first</h3><p>Run a route analysis from Dispatch &amp; Configuration. That result becomes the baseline for your scenario comparison.</p><button type="button" className="analyze-button" onClick={() => setActivePage("dispatch")}>Go to dispatch planning <ArrowRight size={17}/></button></section>
              ) : (
                <>
                  <form className="panel simulator-form" onSubmit={runWhatIfSimulation}>
                    <div className="simulator-form-heading"><div><span className="eyebrow">SCENARIO CONTROLS</span><h3>Change one or more variables</h3></div><span className="simulator-baseline-pill"><ShieldCheck size={14}/> Baseline saved</span></div>
                    <div className="simulator-route-context"><div><span>ORIGIN</span><strong>{baselineInputs.origin}</strong></div><ArrowRight size={17}/><div><span>DESTINATION</span><strong>{baselineInputs.destination}</strong></div></div>
                    <div className="simulator-fields">
                      <label><span>SCENARIO DEPARTURE</span><input type="datetime-local" value={simulationDeparture} onChange={event => setSimulationDeparture(event.target.value)} required/></label>
                      <label><span>TRUCK PAYLOAD (LB)</span><input type="number" min="0" max="100000" value={simulationLoad} onChange={event => setSimulationLoad(event.target.value)} required/></label>
                    </div>
                    <div className="simulator-interval"><span>WEATHER CHECKPOINT INTERVAL</span><div className="interval-options">{["10", "25", "50"].map(value => <button type="button" key={value} className={`interval-option ${simulationInterval === value ? "selected" : ""}`} aria-pressed={simulationInterval === value} onClick={() => setSimulationInterval(value)}>{value} <span>miles</span></button>)}</div></div>
                    {simulationError && <p className="simulator-error" role="alert">{simulationError}</p>}
                    <button type="submit" className="analyze-button" disabled={simulationLoading}>{simulationLoading ? <><LoaderCircle className="spin" size={17}/> Recalculating scenario...</> : <><RefreshCw size={17}/> Run what-if simulation <ArrowRight size={17}/></>}</button>
                    <p className="simulator-footnote"><ShieldCheck size={14}/> Results are recalculated by the backend. No risk scores are estimated in the browser.</p>
                  </form>
                  {simulationLoading && <section className="panel simulator-status"><LoaderCircle className="spin" size={24}/><h3>Re-evaluating the corridor</h3><p>Fetching routes and weather conditions for your scenario.</p></section>}
                  {simulationResult && baselineRecommendedRoute && simulatedRecommendedRoute && (
                    <section className="simulator-results">
                      <div className="simulator-results-heading"><div><span className="eyebrow">BASELINE VS SCENARIO</span><h2>Decision impact</h2><p>{simulationResult.message || "Comparison of each analysis's top-ranked route."}</p></div><span className="simulator-complete"><ShieldCheck size={15}/> Simulation complete</span></div>
                      <div className="simulator-comparison-grid">
                        <article className="panel simulator-result-card"><span className="simulator-card-label">BASELINE PLAN</span><h3>Route {baselineRecommendedRoute.route_id}</h3><p>Original analysis</p><div className="simulator-metric"><span>Distance</span><strong>{baselineRecommendedRoute.distance_miles.toFixed(1)} mi</strong></div><div className="simulator-metric"><span>Drive time</span><strong>{Math.round(baselineRecommendedRoute.duration_seconds / 60)} min</strong></div><div className="simulator-metric"><span>Severe-risk miles</span><strong>{baselineRecommendedRoute.severe_miles.toFixed(1)} mi</strong></div><div className="simulator-metric"><span>High-risk miles</span><strong>{baselineRecommendedRoute.high_miles.toFixed(1)} mi</strong></div><div className="simulator-metric"><span>Average risk</span><strong>{baselineRecommendedRoute.average_risk_score == null ? "N/A" : `${baselineRecommendedRoute.average_risk_score.toFixed(1)} / 5`}</strong></div><div className="simulator-coverage"><span>Weather coverage</span><strong>{baselineRecommendedRoute.weather_coverage_percent}%</strong></div></article>
                        <article className="panel simulator-result-card simulator-result-scenario"><span className="simulator-card-label">WHAT-IF PLAN</span><h3>Route {simulatedRecommendedRoute.route_id}</h3><p>Recalculated recommendation</p><div className="simulator-metric"><span>Distance</span><strong>{simulatedRecommendedRoute.distance_miles.toFixed(1)} mi</strong></div><div className="simulator-metric"><span>Drive time</span><strong>{Math.round(simulatedRecommendedRoute.duration_seconds / 60)} min</strong></div><div className="simulator-metric"><span>Severe-risk miles</span><strong>{simulatedRecommendedRoute.severe_miles.toFixed(1)} mi</strong></div><div className="simulator-metric"><span>High-risk miles</span><strong>{simulatedRecommendedRoute.high_miles.toFixed(1)} mi</strong></div><div className="simulator-metric"><span>Average risk</span><strong>{simulatedRecommendedRoute.average_risk_score == null ? "N/A" : `${simulatedRecommendedRoute.average_risk_score.toFixed(1)} / 5`}</strong></div><div className="simulator-coverage"><span>Weather coverage</span><strong>{simulatedRecommendedRoute.weather_coverage_percent}%</strong></div></article>
                      </div>
                      <div className="panel simulator-impact-panel"><div className="simulator-impact-title"><TrendingDown size={18}/><div><h3>What changed?</h3><p>Differences below are scenario minus baseline. Negative risk-mile changes are improvements.</p></div></div><div className="simulator-impact-grid">{[{label:"Severe-risk miles",delta:simulatedRecommendedRoute.severe_miles-baselineRecommendedRoute.severe_miles,unit:"mi",lowerBetter:true},{label:"High-risk miles",delta:simulatedRecommendedRoute.high_miles-baselineRecommendedRoute.high_miles,unit:"mi",lowerBetter:true},{label:"Drive time",delta:(simulatedRecommendedRoute.duration_seconds-baselineRecommendedRoute.duration_seconds)/60,unit:"min",lowerBetter:true},{label:"Distance",delta:simulatedRecommendedRoute.distance_miles-baselineRecommendedRoute.distance_miles,unit:"mi",lowerBetter:true}].map(metric => {const improved = metric.lowerBetter ? metric.delta < -0.05 : metric.delta > 0.05; const worsened = metric.lowerBetter ? metric.delta > 0.05 : metric.delta < -0.05; return <div className="simulator-impact-metric" key={metric.label}><span>{metric.label}</span><strong className={improved ? "impact-better" : worsened ? "impact-worse" : "impact-neutral"}>{metric.delta > 0 ? "+" : ""}{metric.delta.toFixed(1)} {metric.unit}</strong><small>{improved ? "Lower than baseline" : worsened ? "Higher than baseline" : "No material change"}</small></div>;})}</div><p className="simulator-disclaimer">This is a comparison of the top-ranked route from each run, not a guarantee of future road safety. Weather forecasts and route availability can change.</p></div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
          {activePage === "settings" && (
            <section className="panel settings-panel">
              <div className="settings-heading">
                <div className="heading-icon"><Settings size={20} /></div>
                <div><h2>Appearance</h2><p>Choose the look that works best for your workspace.</p></div>
              </div>
              <div className="settings-option">
                <div className="settings-option-copy">
                  <span className="settings-option-icon">{theme === "dark" ? <Moon size={19} /> : <Sun size={19} />}</span>
                  <div><strong>Theme</strong><p>Switch between light and dark mode. Your choice is saved on this device.</p></div>
                </div>
                <div className="theme-choice" role="group" aria-label="Choose theme">
                  <button type="button" className={theme === "light" ? "selected" : ""} aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Sun size={16} /> Light</button>
                  <button type="button" className={theme === "dark" ? "selected" : ""} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Moon size={16} /> Dark</button>
                </div>
              </div>
              <div className="settings-note"><ShieldCheck size={17} /><span>Appearance settings apply across the dashboard and remain saved after refresh.</span></div>
            </section>
          )}
          {activePage === "dispatch" && !error && !loading && (
            <div className="dispatch-telemetry-stack">
              <section className="panel telemetry-panel">
                <div className="telemetry-panel-heading">
                  <div className="telemetry-title"><ShieldCheck size={18} /><h2>Active Telemetry Constraint Profile</h2></div>
                  <span className="ruleset-badge">RISK RULES</span>
                </div>
                <div className="constraint-grid">
                  <article className="constraint-tile"><span>CRITICAL WIND LIMIT</span><strong className="constraint-danger">55 <small>MPH</small></strong><p>Immediate no-travel threshold</p></article>
                  <article className="constraint-tile"><span>PRECIPITATION LIMIT</span><strong className="constraint-cyan">1.00 <small>IN/HR</small></strong><p>Rain no-travel threshold</p></article>
                  <article className="constraint-tile"><span>LOAD PROFILE</span><strong className="constraint-blue">{Number(load || 0).toLocaleString()} <small>LBS</small></strong><p>Current configured payload</p></article>
                </div>
                <div className="rule-callout"><ShieldAlert size={18}/><div><strong>LOAD-AWARE RULE ENGINE</strong><p>Wind at 45–54 mph with a load above 30,000 lbs triggers No Travel. Wind at 35–44 mph with a load above 40,000 lbs is classified Severe.</p></div></div>
                <div className="priority-panel"><span className="priority-heading">ARBITRATION PRIORITY HIERARCHY</span><div className="priority-grid"><div><small>01</small><strong>Fewest Severe<br/>Miles</strong></div><div><small>02</small><strong>Fewest High<br/>Miles</strong></div><div><small>03</small><strong>Lowest Mean<br/>Risk</strong></div><div><small>04</small><strong>Shortest Safe<br/>ETA</strong></div></div></div>
              </section>
              <section className="panel corridor-topology-panel">
                <div className="telemetry-panel-heading"><div className="telemetry-title"><MapPin size={18}/><h2>Corridor Risk Topology</h2></div><div className="topology-legend"><span><i className="legend-nominal"/>Nominal</span><span><i className="legend-hazard"/>Severe / Hazard</span></div></div>
                {result && selectedRoute ? <><div className="topology-summary"><span>ANALYZED ROUTE {selectedRoute.route_id}</span><strong>{selectedRoute.distance_miles.toFixed(1)} MI</strong></div><div className="topology-track"><span style={{width:`${Math.max(0,Math.min(100,selectedRoute.weather_coverage_percent))}%`}}/><i style={{left:`${Math.max(0,Math.min(100,selectedRoute.weather_coverage_percent))}%`}}/></div><div className="topology-labels"><span>Origin</span><span>{selectedRoute.checkpoints.length} checkpoints</span><span>Destination</span></div><p className="topology-note">Weather coverage {selectedRoute.weather_coverage_percent}% · {selectedRoute.severe_miles.toFixed(1)} severe-risk mi · {selectedRoute.high_miles.toFixed(1)} high-risk mi</p></> : <div className="topology-placeholder"><Radar size={24}/><strong>Corridor scan awaiting analysis</strong><p>Run the trip analysis to display route coverage and checkpoint risk summaries here.</p></div>}
              </section>
              <section className="panel dispatch-source-panel"><div><Radar size={18}/><span><strong>Forecast availability</strong><small>Weather conditions are checked along each route</small></span></div><span className="source-status"><i/>Ready</span></section>
            </div>
          )}
          {activePage !== "dispatch" && activePage !== "settings" && activePage !== "simulator" && !result && !loading && !error && (
            <div className="empty-state panel">
              <div className="empty-icon"><CloudSun size={34} /></div>
              <span className="eyebrow">NO ANALYSIS YET</span>
              <h2>Start with dispatch planning.</h2>
              <p>Configure a trip and analyze routes before viewing route comparisons, corridor checkpoints, or forecast conditions.</p>
              <button type="button" className="analyze-button" onClick={() => setActivePage("dispatch")}>Go to dispatch planning <ArrowRight size={18} /></button>
            </div>
          )}
          {activePage === "dispatch" && loading && (
            <div className="loading-panel panel">
              <LoaderCircle className="spin" size={28} />
              <h2>Analyzing your journey</h2>
              <p>Finding routes and checking forecast conditions...</p>
            </div>
          )}
          {activePage === "dispatch" && error && (
            <div className="error-panel panel" role="alert">
              <h2>Analysis could not be completed</h2>
              <p>{error}</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setError("")}
              >
                Dismiss
              </button>
            </div>
          )}
          {result && (
            <>
              {activePage === "dispatch" && (
                <div className="dispatch-success panel">
                  <div className="empty-icon"><ShieldCheck size={30} /></div>
                  <span className="eyebrow">ANALYSIS COMPLETE</span>
                  <h2>Your routes are ready.</h2>
                  <p>{result.routes.length} route options were analyzed. Review the recommendation and compare safety metrics before choosing a route.</p>
                  <button type="button" className="analyze-button" onClick={() => setActivePage("arbitrator")}>Compare routes <ArrowRight size={18} /></button>
                </div>
              )}
              {activePage === "arbitrator" && (
                <>
              <div className="results-header">
                <div>
                  <span className="eyebrow">ANALYSIS COMPLETE</span>
                  <h2>Route comparison</h2>
                  <p>
                    {result.routes.length} route options returned by routing API
                  </p>
                </div>
                <span className="result-badge">
                  <ShieldCheck size={15} />
                  Forecast checked
                </span>
              </div>
              {result.recommended_route_id !== null && (
                <div className="recommendation-banner">
                  <ShieldCheck size={21} />
                  <div>
                    <strong>
                      Recommended: Route {result.recommended_route_id}
                    </strong>
                    <p>{result.message || "Ranked using route risk and travel time."}</p>
                  </div>
                </div>
              )}
                </>
              )}
              {(activePage === "forecast" || activePage === "corridor") && selectedRoute && (
                <section className="forecast-control panel" aria-label="Weather forecast timeline">
                  <div className="forecast-control-heading">
                    <div>
                      <span className="eyebrow">CORRIDOR FORECAST</span>
                      <h3>Weather risk timeline</h3>
                      <p>Move through the next 48 hours to inspect forecast conditions at every checkpoint.</p>
                    </div>
                    <div className="forecast-hour-pill">
                      <strong>+{forecastHour}h</strong>
                      <span>{forecastHour === 0 ? "Departure" : "From departure"}</span>
                    </div>
                  </div>
                  <div className="forecast-slider-row">
                    <span>0H</span>
                    <input className="forecast-slider" aria-label="Forecast hours after departure"
                      type="range" min="0" max="48" step="1" value={forecastHour}
                      onChange={(event) => setForecastHour(Number(event.target.value))} />
                    <span>48H</span>
                  </div>
                  <div className="forecast-ticks" aria-hidden="true">
                    <span>0h</span><span>12h</span><span>24h</span><span>36h</span><span>48h</span>
                  </div>
                  <div className="forecast-metrics" aria-live="polite">
                    <div className="forecast-metric"><span>CHECKPOINTS WITH DATA</span><strong>{selectedForecasts.length}<small> / {selectedRoute.checkpoints.length}</small></strong></div>
                    <div className="forecast-metric"><span>AVERAGE WIND</span><strong>{averageWind === null ? "—" : `${averageWind.toFixed(1)} mph`}</strong></div>
                    <div className="forecast-metric"><span>RAINFALL</span><strong>{selectedForecasts.length ? `${totalRain.toFixed(2)} in/hr total` : "—"}</strong></div>
                    <div className="forecast-metric"><span>SNOWFALL</span><strong>{selectedForecasts.length ? `${totalSnow.toFixed(2)} in/hr total` : "—"}</strong></div>
                  </div>
                  <div className="forecast-risk-summary" aria-live="polite">
                    <span>RISK DISTRIBUTION AT +{forecastHour}H</span>
                    {["Low", "Moderate", "High", "Severe", "No Travel", "Unknown"].map((risk) => (
                      <span className={`risk-count risk-${risk.toLowerCase().replace(" ", "-")}`} key={risk}>{risk} <strong>{riskCounts[risk] ?? 0}</strong></span>
                    ))}
                  </div>
                  <div className="forecast-heatmap" aria-label="Checkpoint risk heatmap">
                    {selectedRoute.checkpoints.map((checkpoint, index) => {
                      const sample = checkpoint.forecast_hours?.find((item) => item.hour === forecastHour);
                      const risk = sample?.risk?.overall_risk ?? "Unknown";
                      const colorMap: Record<string, string> = {
                        Low: "#5ce1ce", Moderate: "#f4cc70", High: "#ff9d65",
                        Severe: "#ff6b7b", "No Travel": "#e14b69", Unknown: "#718096",
                      };
                      return <div key={`${selectedRoute.route_id}-heat-${index}`} className="heatmap-cell"
                        title={sample ? `Mile ${(checkpoint.distance_miles ?? checkpoint.mile ?? 0).toFixed(1)} · ${risk} · Wind ${sample.wind_mph.toFixed(1)} mph · Rain ${sample.rain_inches.toFixed(2)} in/hr · Snow ${sample.snowfall_inches.toFixed(2)} in/hr` : `Mile ${checkpoint.distance_miles ?? checkpoint.mile ?? 0}: forecast unavailable`}
                        style={{ background: colorMap[risk] ?? colorMap.Unknown }} />;
                    })}
                  </div>
                  <div className="forecast-legend">
                    <span><i style={{ background: "#5ce1ce" }} />Low</span>
                    <span><i style={{ background: "#f4cc70" }} />Moderate</span>
                    <span><i style={{ background: "#ff9d65" }} />High</span>
                    <span><i style={{ background: "#ff6b7b" }} />Severe</span>
                    <span><i style={{ background: "#e14b69" }} />No Travel</span>
                    <span><i style={{ background: "#718096" }} />Unknown</span>
                  </div>
                  <p className="forecast-footnote">
                    Hover over a heatmap segment to inspect its exact forecast values. {selectedForecasts.length} of {selectedRoute.checkpoints.length} checkpoints have forecast data for +{forecastHour}h. Risk colors change only when weather crosses a risk threshold.
                  </p>
                </section>
              )}
              {activePage === "forecast" && (
                <section className="panel safety-matrix-panel">
                  <div className="telemetry-panel-heading">
                    <div className="telemetry-title"><ShieldAlert size={18}/><h2>Operational risk threshold matrix</h2></div>
                    <span className="ruleset-badge">LOAD-AWARE</span>
                  </div>
                  <p className="safety-matrix-intro">Reference thresholds used by the route risk engine. The final route risk is determined by the highest applicable weather risk and load-specific rules.</p>
                  <div className="safety-table-wrap"><table className="safety-table">
                    <thead><tr><th>Hazard</th><th>Low</th><th>Moderate</th><th>High</th><th>Severe</th><th>No Travel</th></tr></thead>
                    <tbody>
                      <tr><th>Wind</th><td>&lt;25 mph</td><td>25–34 mph</td><td>35–44 mph</td><td>45–54 mph*</td><td>≥55 mph</td></tr>
                      <tr><th>Rain</th><td>&lt;0.10 in/hr</td><td>0.10–&lt;0.25</td><td>0.25–&lt;0.50</td><td>0.50–1.00</td><td>&gt;1.00 in/hr</td></tr>
                      <tr><th>Snow</th><td>&lt;0.50 in/hr</td><td>0.50–&lt;1.00</td><td>1.00–&lt;2.00</td><td>2.00–3.00</td><td>&gt;3.00 in/hr</td></tr>
                    </tbody>
                  </table></div>
                  <div className="safety-matrix-note"><ShieldCheck size={16}/><span>*Load-aware wind rules also apply: 45–54 mph with a load above 30,000 lb triggers No Travel; 35–44 mph with a load above 40,000 lb is classified Severe.</span></div>
                </section>
              )}
              {activePage === "corridor" && <div id="corridor-map" className="corridor-map-panel">
                <RouteMap
                  routes={result.routes}
                  selectedRouteId={selectedRouteId}
                  onSelectRoute={setSelectedRouteId}
                  forecastHour={forecastHour}
                />
              </div>}
              {activePage === "corridor" && selectedRoute && (
                <div className="selected-route-summary panel">
                  <span className="eyebrow">SELECTED ROUTE</span>
                  <h3>Route {selectedRoute.route_id} checkpoint details</h3>
                  <p>
                    {selectedRoute.checkpoints?.length ?? 0} checkpoints
                    {" · "}
                    {selectedRoute.weather_coverage_percent}% weather coverage
                  </p>
                </div>
              )}
              {activePage === "arbitrator" && (
                <>
              <div className="route-list-heading">
                <h3>Available routes</h3>
                <span>Select a route to inspect it on the map</span>
              </div>
              <div className="route-comparison-grid">
              {result.routes.map((route) => {
                const isSelected = route.route_id === selectedRouteId;
                const isRecommended =
                  route.route_id === result.recommended_route_id;
                return (
                  <article
                    key={route.route_id}
                    className={`route-card panel ${
                      isSelected ? "route-recommended" : ""
                    }`}
                    onClick={() => setSelectedRouteId(route.route_id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedRouteId(route.route_id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                  >
                    <div className="route-card-top">
                      <div className="route-number">
                        {String(route.recommendation_rank).padStart(2, "0")}
                      </div>
                      <div className="route-title">
                        <h3>Route {route.route_id}</h3>
                        <p>
                          {isRecommended
                            ? "Recommended option"
                            : isSelected
                              ? "Currently selected"
                              : "Alternative route"}
                        </p>
                      </div>
                      {isRecommended && (
                        <span className="best-badge">TOP RANKED</span>
                      )}
                    </div>
                    <div className="route-metrics">
                      <div>
                        <span>DISTANCE</span>
                        <strong>
                          {route.distance_miles.toFixed(1)} <small>mi</small>
                        </strong>
                      </div>
                      <div>
                        <span>DRIVE TIME</span>
                        <strong>
                          {Math.round(route.duration_seconds / 60)}
                          <small> min</small>
                        </strong>
                      </div>
                      <div>
                        <span>AVG. RISK</span>
                        <strong>
                          {route.average_risk_score == null
                            ? "N/A"
                            : route.average_risk_score.toFixed(1)}
                          <small> / 5</small>
                        </strong>
                      </div>
                    </div>
                    <div className="route-risk-row">
                      <span>
                        Severe-risk miles:{" "}
                        <strong>{route.severe_miles.toFixed(1)}</strong>
                      </span>
                      <span>
                        High-risk miles:{" "}
                        <strong>{route.high_miles.toFixed(1)}</strong>
                      </span>
                    </div>
                    <div className="coverage">
                      <div className="coverage-label">
                        <span>Weather coverage</span>
                        <strong>{route.weather_coverage_percent}%</strong>
                      </div>
                      <div className="coverage-track">
                        <div
                          className="coverage-fill"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, route.weather_coverage_percent),
                            )}%`,
                          }}
                        />
                      </div>
                      {route.unknown_miles > 0 && (
                        <p className="coverage-warning">
                          {route.unknown_miles.toFixed(1)} miles have unknown weather.
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
              </div>
              <section className="panel checkpoint-timeline-panel">
                <div className="telemetry-panel-heading">
                  <div className="telemetry-title"><Route size={18}/><h2>Selected corridor checkpoint telemetry</h2></div>
                  <span className="ruleset-badge">{selectedRoute?.checkpoints.length ?? 0} CHECKPOINTS</span>
                </div>
                {selectedRoute && selectedRoute.checkpoints.length > 0 ? (
                  <div className="checkpoint-timeline">
                    {selectedRoute.checkpoints.map((checkpoint, index) => {
                      const sample = checkpoint.forecast_hours?.find((item) => item.hour === forecastHour);
                      const risk = sample?.risk?.overall_risk ?? checkpoint.risk?.overall_risk ?? "Unknown";
                      const riskClass = risk.toLowerCase().replace(/\s+/g, "-");
                      return <article className="checkpoint-timeline-item" key={`${selectedRoute.route_id}-checkpoint-${index}`}>
                        <span className={`checkpoint-node risk-node-${riskClass}`}>{String(index + 1).padStart(2, "0")}</span>
                        <div className="checkpoint-detail">
                          <strong>Checkpoint {index + 1}</strong>
                          <span>{(checkpoint.distance_miles ?? checkpoint.mile ?? 0).toFixed(1)} mi from origin</span>
                          <small>{checkpoint.eta ? new Date(checkpoint.eta).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "ETA unavailable"}</small>
                        </div>
                        <span className={`checkpoint-risk risk-label-${riskClass}`}>{risk}</span>
                        <div className="checkpoint-weather">{sample ? `${sample.wind_mph.toFixed(1)} mph wind · ${sample.rain_inches.toFixed(2)} in/hr rain · ${sample.snowfall_inches.toFixed(2)} in/hr snow` : "Forecast sample unavailable for this hour"}</div>
                      </article>;
                    })}
                  </div>
                ) : <p className="timeline-empty">No checkpoint telemetry is available for the selected route.</p>}
              </section>
              <p className="disclaimer">
                Risk-mile totals are estimates based on checkpoint sampling.
                Forecasts are not guarantees of road safety.
              </p>
                </>
              )}
            </>
          )}
        </section>
      </section>
      <footer className="footer">
        <span>
          ROUTEWISE <span className="brand-accent">/</span> WEATHER INTELLIGENCE
        </span>
        <span>OpenRouteService · Open-Meteo</span>
      </footer>
      </div>
    </main>
  );
}

export default App;
