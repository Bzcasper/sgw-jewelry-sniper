// sgw-sniper — Rust last-second executor (tokio + reqwest)
// Same contracts as TS: ShowBidModal -> PlaceBid at T-900ms, refresh at T-5s

use anyhow::Result;
use chrono::DateTime;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::env;

const BASE: &str = "https://buyerapi.shopgoodwill.com/api/";

#[derive(Deserialize, Debug)] struct Modal {
    #[serde(rename="itemId")] item_id: i64,
    #[serde(rename="sellerId")] seller_id: i64,
    #[serde(rename="currentPrice")] current_price: f64,
    #[serde(rename="minimumBid")] minimum_bid: f64,
    #[serde(rename="endTime")] end_time: String,
    #[serde(rename="bidIncrement")] bid_increment: Option<f64>,
}
#[derive(Serialize)] struct PlaceReq { itemId: i64, sellerId: i64, quantity: i32, bidAmount: f64 }
#[derive(Deserialize, Debug)] struct PlaceResp { status: bool, result: i32, message: String, #[serde(rename="pastDueMessage")] past_due: Option<String> }

fn client() -> Result<reqwest::Client> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert("Accept", HeaderValue::from_static("application/json"));
    headers.insert("Origin", HeaderValue::from_static("https://shopgoodwill.com"));
    headers.insert("Referer", HeaderValue::from_static("https://shopgoodwill.com/"));
    headers.insert("User-Agent", HeaderValue::from_static("Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0"));
    if let Ok(tok) = env::var("BEARER") { headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", tok))?); }
    Ok(reqwest::Client::builder().default_headers(headers).build()?)
}

async fn server_offset_ms(cl: &reqwest::Client) -> i64 {
    let t0 = chrono::Utc::now().timestamp_millis();
    let r = cl.post(format!("{}Dashboard/GetCurrentTime", BASE)).send().await;
    let t1 = chrono::Utc::now().timestamp_millis();
    if let Ok(resp) = r {
        if let Some(date) = resp.headers().get("date") {
            if let Ok(s) = date.to_str() { if let Ok(dt) = DateTime::parse_from_rfc2822(s) { return dt.timestamp_millis() + (t1-t0)/2 - chrono::Utc::now().timestamp_millis(); } }
        }
    }
    0
}
async fn get_modal(cl: &reqwest::Client, id: i64) -> Result<Modal> {
    let m: Modal = cl.get(format!("{}ItemBid/ShowBidModal?itemId={}", BASE, id)).send().await?.json().await?;
    Ok(m)
}
async fn place_bid(cl: &reqwest::Client, req: &PlaceReq) -> Result<PlaceResp> {
    let r = cl.post(format!("{}ItemBid/PlaceBid", BASE)).json(req).send().await?;
    let resp: PlaceResp = r.json().await?;
    Ok(resp)
}

#[tokio::main]
async fn main() -> Result<()> {
    let items_raw = env::var("ITEMS").unwrap_or("275048676:25".into());
    let fire_before: i64 = env::var("FIRE_BEFORE_MS").ok().and_then(|v| v.parse().ok()).unwrap_or(900);
    let cl = client()?;
    let off = server_offset_ms(&cl).await;
    println!("server offset {}ms", off);
    let mut entries: Vec<(i64,i64,f64)> = items_raw.split(',').filter_map(|s|{
        let mut p=s.split(':'); Some((p.next()?.parse().ok()?, 0i64, p.next()?.parse().ok()?))
    }).collect();
    // pre-warm sellerIds
    for e in &mut entries { if let Ok(m)=get_modal(&cl, e.0).await { e.1=m.seller_id; } }
    let mut handles=vec![];
    for (item_id, seller_id, max) in entries {
        let cl2=cl.clone();
        handles.push(tokio::spawn(async move {
            let mut modal = match get_modal(&cl2, item_id).await { Ok(m)=>m, Err(e)=>{eprintln!("[{}] modal err {}", item_id, e); return;} };
            let mut end_ms = DateTime::parse_from_rfc3339(&modal.end_time).map(|d| d.timestamp_millis()).unwrap_or(0) + off;
            if end_ms==0 || end_ms < chrono::Utc::now().timestamp_millis() {
                // fallback detail
                if let Ok(det) = cl2.get(format!("{}ItemDetail/GetItemDetailModelByItemId/{}", BASE, item_id)).send().await {
                    if let Ok(v) = det.json::<serde_json::Value>().await { if let Some(s)=v.get("endTime").and_then(|x|x.as_str()) { if let Ok(dt)=DateTime::parse_from_rfc3339(s) { end_ms=dt.timestamp_millis()+off; } } }
                }
            }
            println!("[{}] min={} cur={} end={} max={}", item_id, modal.minimum_bid, modal.current_price, end_ms, max);
            if max < modal.minimum_bid { println!("[{}] skip max < min", item_id); return; }
            let refresh_at = end_ms - 5000;
            let fire_at = end_ms - fire_before;
            let now = chrono::Utc::now().timestamp_millis();
            if refresh_at > now { tokio::time::sleep(tokio::time::Duration::from_millis((refresh_at-now) as u64)).await;
                if let Ok(m2)=get_modal(&cl2, item_id).await { modal=m2; println!("[{} refresh T-5s] min={}", item_id, modal.minimum_bid); if max < modal.minimum_bid { println!("[{}] abort", item_id); return; } }
            }
            let wait = fire_at - chrono::Utc::now().timestamp_millis();
            if wait>0 { tokio::time::sleep(tokio::time::Duration::from_millis(wait as u64)).await; }
            // spin last 50ms
            while chrono::Utc::now().timestamp_millis() < fire_at { tokio::task::yield_now().await; }
            let req = PlaceReq{ itemId:item_id, sellerId: if seller_id!=0 {seller_id} else {modal.seller_id}, quantity:1, bidAmount: max.max(modal.minimum_bid) };
            println!("[FIRE {}] {:?}", chrono::Utc::now().to_rfc3339(), req);
            match place_bid(&cl2, &req).await {
                Ok(resp)=>{ println!("[RESP] {:?}", resp); if !resp.status && (resp.result==-4||resp.result==-5) && chrono::Utc::now().timestamp_millis() < end_ms-200 {
                    if let Ok(m3)=get_modal(&cl2, item_id).await { if max >= m3.minimum_bid { let r2=PlaceReq{ bidAmount:m3.minimum_bid, ..req}; println!("[RETRY] {:?}", place_bid(&cl2,&r2).await); } }
                } if resp.result==-110 { eprintln!("AUTH EXPIRED — POST SignIn/RefreshToken"); } },
                Err(e)=> eprintln!("[FIRE ERR] {}", e),
            }
        }));
    }
    for h in handles { let _=h.await; }
    Ok(())
}
