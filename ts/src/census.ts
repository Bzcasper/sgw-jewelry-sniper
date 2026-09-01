import { cfg } from "./config.js";
// ACS 5yr vars: B02001_002E white, B01002_001E medianAge, B19013_001E medianHH, B19301_001E perCapita, B25077_001E home
const VARS = "NAME,B02001_002E,B01002_001E,B19013_001E,B19301_001E,B25077_001E";
const BASE = "https://api.census.gov/data/2023/acs/acs5";

export async function geocodeZip(zip: string) {
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${zip}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const r = await fetch(url).then((x) => x.json());
  const g = r.result?.geographies?.["Counties"]?.[0];
  return {
    countyFips: g?.GEOID?.slice(-3),
    stateFips: g?.GEOID?.slice(0, 2),
    zcta: zip,
    lat: r.result?.addressMatches?.[0]?.coordinates?.y,
    lng: r.result?.addressMatches?.[0]?.coordinates?.x,
  };
}

export async function fetchACS(zcta: string, stateFips: string) {
  const url = `${BASE}?get=${VARS}&for=zip%20code%20tabulation%20area:${zcta}&in=state:${stateFips}&key=${cfg.censusKey}`;
  const j = await fetch(url).then((x) => x.json());
  // j[0]=header, j[1]=values
  if (!Array.isArray(j) || j.length < 2) throw new Error("ACS empty " + zcta);
  const vals = j[1];
  return {
    zcta,
    white: Number(vals[1]),
    medianAge: Number(vals[2]),
    medianHH: Number(vals[3]),
    perCapita: Number(vals[4]),
    homeValue: Number(vals[5]),
  };
}

export function scoreDemographics(z: any, county: any) {
  const richTownScore = z.medianHH / county.medianHH;
  const richSurrounding = county.medianHH / 70000; // vs state avg placeholder; replace with state fetch
  return {
    richTownScore,
    richSurrounding,
    whitePct: z.white,
    medianAge: z.medianAge,
    medianHHIncome: z.medianHH,
    medianHomeValue: z.homeValue,
    fetchedAt: new Date().toISOString(),
  };
}
