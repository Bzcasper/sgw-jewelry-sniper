use std::env;
pub struct Config {
    pub base: String,
    pub bearer: String,
    pub fire_before_ms: i64,
    pub items: String,
}
impl Config {
    pub fn from_env() -> Self {
        Self {
            base: env::var("DATABASE_URL").ok().unwrap_or("https://buyerapi.shopgoodwill.com/api/".into()),
            bearer: env::var("BEARER").unwrap_or_default(),
            fire_before_ms: env::var("FIRE_BEFORE_MS").ok().and_then(|v| v.parse().ok()).unwrap_or(900),
            items: env::var("ITEMS").unwrap_or("275585046:30".into()),
        }
    }
}
