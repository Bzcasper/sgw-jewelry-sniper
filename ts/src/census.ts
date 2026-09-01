import { cfg } from "./config.js";

const VARS_DETAILED =
  "NAME,B01001_001E,B02001_001E,B02001_002E,B01002_001E,B19013_001E,B19301_001E,B25077_001E";
const BASE = "https://api.census.gov/data/2023/acs/acs5";

export type Geo = {
  zcta: string;
  countyFips: string;
  stateFips: string;
  lat: number | null;
  lng: number | null;
  geoid: string | null;
};

export type ACS = {
  zcta: string;
  totalPop: number;
  white: number;
  whiteTotal: number;
  medianAge: number;
  medianHH: number;
  perCapita: number;
  homeValue: number;
};

export type DemoScore = {
  zcta: string;
  countyFips: string;
  stateFips: string;
  whitePct: number;
  medianAge: number;
  medianHHIncome: number;
  perCapitaIncome: number;
  medianHomeValue: number;
  richTownScore: number;
  richSurroundingScore: number;
  fetchedAt: string;
};

async function fetchJson(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "sgw-sniper/0.1" } });
      const text = await r.text();
      // Census returns HTML Invalid Key page with 200 — detect
      if (text.trim().startsWith("<"))
        throw new Error(`Census HTML (likely Invalid Key): ${text.slice(0, 120)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url} ${text.slice(0, 300)}`);
      return JSON.parse(text);
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((res) => setTimeout(res, 400 * (i + 1) ** 2));
    }
  }
}

// Full address geocoding — verified for 4105 N Franklin Rd Indianapolis IN 46226 → 18097
export async function geocodeAddress(fullAddress: string): Promise<Geo> {
  const q = encodeURIComponent(fullAddress);
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${q}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const r = await fetchJson(url);
  const counties = r.result?.geographies?.["Counties"] as any[] | undefined;
  const g = counties?.[0];
  const match = r.result?.addressMatches?.[0];
  const geoid: string | null = g?.GEOID ?? null;
  const stateFips = geoid ? geoid.slice(0, 2) : "";
  const countyFips = geoid ? geoid.slice(2, 5) : "";
  // ZCTA from address zip extraction fallback
  const m = fullAddress.match(/\b(\d{5})\b/);
  const zcta = m ? m[1] : "";
  return {
    zcta,
    countyFips,
    stateFips,
    lat: match?.coordinates?.y ?? null,
    lng: match?.coordinates?.x ?? null,
    geoid,
  };
}

export async function geocodeZip(zip: string, city?: string, state?: string): Promise<Geo> {
  // Try address-style first, fallback to zip-only ZCTA handling
  try {
    return await geocodeAddress(city && state ? `${city} ${state} ${zip}` : zip);
  } catch {
    // Fallback: zip directly as ZCTA, state/county empty — caller must provide via Seller mapping
    return { zcta: zip, countyFips: "", stateFips: "", lat: null, lng: null, geoid: null };
  }
}

// ZCTA 860 has no in=state (geography.json 860 has no requires)
export async function fetchACSByZCTA(zcta: string): Promise<ACS> {
  const url = `${BASE}?get=${VARS_DETAILED}&for=zip%20code%20tabulation%20area:${zcta}&key=${cfg.censusKey}`;
  const j = await fetchJson(url);
  if (!Array.isArray(j) || j.length < 2) throw new Error(`ACS empty ${zcta}`);
  const vals = j[1] as string[];
  // vals: [NAME, B01001_001E, B02001_001E, B02001_002E, B01002_001E, B19013_001E, B19301_001E, B25077_001E, zip]
  const toNum = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > -600000000 ? n : 0;
  };
  return {
    zcta,
    totalPop: toNum(vals[1]),
    whiteTotal: toNum(vals[2]),
    white: toNum(vals[3]),
    medianAge: toNum(vals[4]),
    medianHH: toNum(vals[5]),
    perCapita: toNum(vals[6]),
    homeValue: toNum(vals[7]),
  };
}

export async function fetchACSByCounty(countyFips: string, stateFips: string): Promise<ACS> {
  const url = `${BASE}?get=${VARS_DETAILED}&for=county:${countyFips}&in=state:${stateFips}&key=${cfg.censusKey}`;
  const j = await fetchJson(url);
  if (!Array.isArray(j) || j.length < 2) throw new Error(`ACS county empty ${countyFips}`);
  const vals = j[1] as string[];
  const toNum = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > -600000000 ? n : 0;
  };
  return {
    zcta: countyFips,
    totalPop: toNum(vals[1]),
    whiteTotal: toNum(vals[2]),
    white: toNum(vals[3]),
    medianAge: toNum(vals[4]),
    medianHH: toNum(vals[5]),
    perCapita: toNum(vals[6]),
    homeValue: toNum(vals[7]),
  };
}

export async function fetchACSByState(stateFips: string): Promise<ACS> {
  const url = `${BASE}?get=${VARS_DETAILED}&for=state:${stateFips}&key=${cfg.censusKey}`;
  const j = await fetchJson(url);
  if (!Array.isArray(j) || j.length < 2) throw new Error(`ACS state empty ${stateFips}`);
  const vals = j[1] as string[];
  const toNum = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > -600000000 ? n : 0;
  };
  return {
    zcta: stateFips,
    totalPop: toNum(vals[1]),
    whiteTotal: toNum(vals[2]),
    white: toNum(vals[3]),
    medianAge: toNum(vals[4]),
    medianHH: toNum(vals[5]),
    perCapita: toNum(vals[6]),
    homeValue: toNum(vals[7]),
  };
}

export function scoreDemographics(z: ACS, county: ACS, state: ACS): DemoScore {
  const richTownScore = county.medianHH ? z.medianHH / county.medianHH : 1;
  const richSurroundingScore = state.medianHH ? county.medianHH / state.medianHH : 1;
  const whitePct = z.totalPop ? (z.white / z.totalPop) * 100 : 0;
  return {
    zcta: z.zcta,
    countyFips: county.zcta,
    stateFips: state.zcta,
    whitePct,
    medianAge: z.medianAge,
    medianHHIncome: z.medianHH,
    perCapitaIncome: z.perCapita,
    medianHomeValue: z.homeValue,
    richTownScore,
    richSurroundingScore,
    fetchedAt: new Date().toISOString(),
  };
}

// Mock fallback when key missing/invalid (verified DEMO_KEY now fails) — keeps pipeline alive per RULE #9
export function mockDemo(zcta: string): DemoScore {
  return {
    zcta,
    countyFips: "097",
    stateFips: "18",
    whitePct: 70,
    medianAge: 38,
    medianHHIncome: 55000,
    perCapitaIncome: 30000,
    medianHomeValue: 180000,
    richTownScore: 1.0,
    richSurroundingScore: 1.0,
    fetchedAt: new Date().toISOString(),
  };
}
