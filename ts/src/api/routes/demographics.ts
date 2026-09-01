import type { FastifyInstance } from "fastify";

import {
  geocodeAddress,
  fetchACSByZCTA,
  fetchACSByCounty,
  fetchACSByState,
  scoreDemographics,
  mockDemo,
} from "../../census.js";
import db, { upsertDemographics, upsertCensusGeo } from "../../db.js";

export default async function demoRoutes(f: FastifyInstance) {
  f.get("/:zcta", async (req) => {
    const { zcta } = req.params as any;
    const row = db.prepare(`SELECT * FROM demographics WHERE zcta=?`).get(zcta);
    if (row) return row;
    // live fetch with mock fallback (needs CENSUS_API_KEY)
    try {
      const z = await fetchACSByZCTA(zcta);
      // need county/state — try geocode fallback state 18
      const county = await fetchACSByCounty("097", "18").catch(() => z);
      const state = await fetchACSByState("18").catch(() => county);
      const score = await scoreDemographics(z as any, county as any, state as any);
      upsertDemographics(score as any);
      return score;
    } catch (_e: any) {
      return mockDemo(zcta);
    }
  });
  f.get("/zip/:zip", async (req) => {
    const { zip } = req.params as any;
    const q = req.query as any;
    const city = q.city,
      state = q.state;
    const full = [q.address, city, state, zip].filter(Boolean).join(" ");
    try {
      const geo = await geocodeAddress(full || zip);
      upsertCensusGeo({
        zip,
        zcta: geo.zcta || zip,
        countyFips: geo.countyFips || null,
        stateFips: geo.stateFips || null,
        lat: geo.lat,
        lng: geo.lng,
        geoid: geo.geoid,
      });
      const z = await fetchACSByZCTA(geo.zcta || zip).catch(() => null);
      if (!z) return mockDemo(zip);
      const county =
        geo.countyFips && geo.stateFips
          ? await fetchACSByCounty(geo.countyFips, geo.stateFips).catch(() => z)
          : z;
      const stateF = geo.stateFips
        ? await fetchACSByState(geo.stateFips).catch(() => county)
        : county;
      const score = await scoreDemographics(z as any, county as any, stateF as any);
      upsertDemographics(score as any);
      return { geo, score };
    } catch (_e: any) {
      return {
        geo: { zcta: zip },
        score: mockDemo(zip),
        error: (_e as Error).message.slice(0, 300),
      };
    }
  });
  f.post("/score", async (req) => {
    const { z, county, state } = req.body as any;
    return scoreDemographics(z, county, state);
  });
}
