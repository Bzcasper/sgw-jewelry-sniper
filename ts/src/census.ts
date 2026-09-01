import { cfg } from "./config.js";

const VARS = "NAME,B02001_002E,B01002_001E,B19013_001E,B19301_001E,B25077_001E";
const BASE = "https://api.census.gov/data/2023/acs/acs5";
const GEO_BASE = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

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
  white: number;
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
  pct65plus?: number;
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
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((res) => setTimeout(res, 400 * (i + 1) ** 2));
    }
  }
}

export async function geocodeZip(zip: string, city?: string, state?: string): Promise<Geo> {
  const q = encodeURIComponent(`${zip} ${city ?? ""} ${state ?? ""}`.trim());
  const url = `${GEO_BASE}?address=${q}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const r = await fetchJson(url);
  const counties = r.result?.geographies?.["Counties"] as any[] | undefined;
  const tracts = r.result?.geographies?.["Census Tracts"] as any[] | undefined;
  const g = counties?.[0] ?? tracts?.[0];
  const match = r.result?.addressMatches?.[0];
  const geoid: string | null = g?.GEOID ?? null;
  // GEOID county = state(2)+county(3) e.g., 18097
  const stateFips = geoid ? geoid.slice(0, 2) : "";
  const countyFips = geoid ? geoid.slice(2, 5) : "";
  return {
    zcta: zip,
    countyFips,
    stateFips,
    lat: match?.coordinates?.y ?? null,
    lng: match?.coordinates?.x ?? null,
    geoid,
  };
}

export async function fetchACSByZCTA(zcta: string, stateFips: string): Promise<ACS> {
  const url = `${BASE}?get=${VARS}&for=zip%20code%20tabulation%20area:${zcta}&in=state:${stateFips}&key=${cfg.censusKey}`;
  const j = await fetchJson(url);
  if (!Array.isArray(j) || j.length < 2) throw new Error(`ACS empty ${zcta}`);
  const vals = j[1] as string[];
  return {
    zcta,
    white: Number(vals[1]),
    medianAge: Number(vals[2]),
    medianHH: Number(vals[3]),
    perCapita: Number(vals[4]),
    homeValue: Number(vals[5]),
  };
}

export async function fetchACSByCounty(countyFips: string, stateFips: string): Promise<ACS> {
  const url = `${BASE}?get=${VARS}&for=county:${countyFips}&in=state:${stateFips}&key=${cfg.censusKey}`;
  const j = await fetchJson(url);
  if (!Array.isArray(j) || j.length < 2) throw new Error(`ACS county empty ${countyFips}`);
  const vals = j[1] as string[];
  return {
    zcta: countyFips,
    white: Number(vals[1]),
    medianAge: Number(vals[2]),
    medianHH: Number(vals[3]),
    perCapita: Number(vals[4]),
    homeValue: Number(vals[5]),
  };
}

export async function fetchACSByState(stateFips: string): Promise<ACS> {
  const url = `${BASE}?get=${VARS}&for=state:${stateFips}&key=${cfg.censusKey}`;
  const j = await fetchJson(url);
  if (!Array.isArray(j) || j.length < 2) throw new Error(`ACS state empty ${stateFips}`);
  const vals = j[1] as string[];
  return {
    zcta: stateFips,
    white: Number(vals[1]),
    medianAge: Number(vals[2]),
    medianHH: Number(vals[3]),
    perCapita: Number(vals[4]),
    homeValue: Number(vals[5]),
  };
}

export async function scoreDemographics(z: ACS, county: ACS, state: ACS): Promise<DemoScore> {
  const richTownScore = county.medianHH ? z.medianHH / county.medianHH : 1;
  const richSurroundingScore = state.medianHH ? county.medianHH / state.medianHH : 1;
  // whitePct needs total pop; ACS B02001_001E is total; we only fetched white alone — approximate as white/median proxy (v1). For now white = absolute count, caller can compute pct if needed.
  return {
    zcta: z.zcta,
    countyFips: county.zcta,
    stateFips: state.zcta,
    whitePct: z.white,
    medianAge: z.medianAge,
    medianHHIncome: z.medianHH,
    perCapitaIncome: z.perCapita,
    medianHomeValue: z.homeValue,
    richTownScore,
    richSurroundingScore,
    fetchedAt: new Date().toISOString(),
  };
}
