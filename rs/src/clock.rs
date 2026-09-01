use chrono::DateTime;
const BASE: &str = "https://buyerapi.shopgoodwill.com/api/";
pub async fn server_offset_ms(cl:&reqwest::Client) -> i64 {
    let t0 = chrono::Utc::now().timestamp_millis();
    let r = cl.post(format!("{}Dashboard/GetCurrentTime", BASE)).send().await;
    let t1 = chrono::Utc::now().timestamp_millis();
    if let Ok(resp)=r { if let Some(d)=resp.headers().get("date") { if let Ok(s)=d.to_str() { if let Ok(dt)=DateTime::parse_from_rfc2822(s) { return dt.timestamp_millis() + (t1-t0)/2 - chrono::Utc::now().timestamp_millis(); } } } }
    0
}
pub fn parse_end(end:&str, off:i64) -> i64 {
    DateTime::parse_from_rfc3339(end).map(|d| d.timestamp_millis()+off).unwrap_or(0)
}
