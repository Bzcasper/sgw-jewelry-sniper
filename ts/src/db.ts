import sqlite3 from "better-sqlite3";
import fs from "fs";
const db = sqlite3("data/sgw_jewelry.db");
db.exec(fs.readFileSync("schema.sql","utf8"));
export function insertWatched(row:any) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO watched_auctions(itemId,sellerId,categoryId,title,startTime,endTime,currentPrice,minimumBid,bidIncrement,imageURL,catFullName,pickupZip,zcta) VALUES(@itemId,@sellerId,@categoryId,@title,@startTime,@endTime,@currentPrice,@minimumBid,@bidIncrement,@imageURL,@catFullName,@pickupZip,@zcta)`);
  stmt.run(row);
  fs.appendFileSync("data/items.ndjson", JSON.stringify(row)+"\n");
}
export default db;
