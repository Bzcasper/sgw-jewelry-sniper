use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::env;
const BASE: &str = "https://buyerapi.shopgoodwill.com/api/";
pub fn client() -> anyhow::Result<reqwest::Client> {
    let mut h = HeaderMap::new();
    h.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    h.insert("Accept", HeaderValue::from_static("application/json"));
    h.insert("Origin", HeaderValue::from_static("https://shopgoodwill.com"));
    h.insert("Referer", HeaderValue::from_static("https://shopgoodwill.com/"));
    h.insert("User-Agent", HeaderValue::from_static("Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0"));
    if let Ok(t) = env::var("BEARER") { h.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", t))?); }
    Ok(reqwest::Client::builder().default_headers(h).build()?)
}
#[derive(Deserialize)] pub struct Modal { #[serde(rename="itemId")] pub item_id:i64, #[serde(rename="sellerId")] pub seller_id:i64, #[serde(rename="minimumBid")] pub minimum_bid:f64, #[serde(rename="currentPrice")] pub current_price:f64, #[serde(rename="endTime")] pub end_time:String }
#[derive(Serialize)] pub struct PlaceReq { pub itemId:i64, pub sellerId:i64, pub quantity:i32, pub bidAmount:f64 }
#[derive(Deserialize, Debug)] pub struct PlaceResp { pub status:bool, pub result:i32, pub message:String }
pub async fn show_bid_modal(cl:&reqwest::Client, id:i64) -> anyhow::Result<Modal> {
    Ok(cl.get(format!("{}ItemBid/ShowBidModal?itemId={}", BASE, id)).send().await?.json().await?)
}
pub async fn place_bid(cl:&reqwest::Client, req:&PlaceReq) -> anyhow::Result<PlaceResp> {
    Ok(cl.post(format!("{}ItemBid/PlaceBid", BASE)).json(req).send().await?.json().await?)
}
