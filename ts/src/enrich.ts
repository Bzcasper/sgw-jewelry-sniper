// Bulk enrich watched_auctions via GetItemsById 50/batch + parse description HTML
import { getItemsByIds } from "./buyerapi.js";
import db from "./db.js";

function parseGold(desc: string): {
  weightG: number | null;
  has925: boolean;
  has10K: boolean;
  has14K: boolean;
} {
  const m = desc.match(/(\d+\.?\d*)\s*g\b/i);
  return {
    weightG: m ? Number(m[1]) : null,
    has925: /925/i.test(desc),
    has10K: /10K/i.test(desc),
    has14K: /14K/i.test(desc),
  };
}

export async function enrich(ids: number[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const rows: any[] = await getItemsByIds(batch);
    const upd = db.prepare(
      `UPDATE watched_auctions SET categoryParentList=@cpl, catFullName=COALESCE(@catFull,''), lastPolledAt=@now WHERE itemId=@itemId`,
    );
    for (const r of rows) {
      const g = parseGold(r.description ?? "");
      console.log(r.itemId, g, r.categoryParentList);
      upd.run({
        itemId: r.itemId,
        cpl: r.categoryParentList ?? null,
        catFull: r.catFullName ?? null,
        now: new Date().toISOString(),
      });
    }
    await new Promise((res) => setTimeout(res, 600));
  }
}

// CLI: npx tsx src/enrich.ts 275585046 275772810
if (import.meta.url.endsWith("enrich.ts")) {
  const ids = process.argv.slice(2).map(Number).filter(Boolean);
  if (ids.length) enrich(ids).catch(console.error);
}
