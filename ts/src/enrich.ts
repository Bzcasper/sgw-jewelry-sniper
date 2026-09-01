// Bulk enrich watched_auctions via GetItemsById 50/batch + parse description HTML
import fs from "fs";

import { getItemsByIds } from "./buyerapi.js";

function parseGold(desc: string) {
  // naive: look for 10K, 14K, 925, "g" weight
  const m = desc.match(/(\d+\.?\d*)\s*g\b/i);
  return {
    weightG: m ? Number(m[1]) : null,
    has925: /925/i.test(desc),
    has10K: /10K/i.test(desc),
    has14K: /14K/i.test(desc),
  };
}

export async function enrich(ids: number[]) {
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const rows = await getItemsByIds(batch);
    for (const r of rows) {
      const g = parseGold(r.description || "");
      console.log(r.itemId, g, r.categoryParentList);
      fs.appendFileSync(
        "data/items.ndjson",
        JSON.stringify({ itemId: r.itemId, enrich: g }) + "\n",
      );
    }
    await new Promise((r) => setTimeout(r, 600));
  }
}
