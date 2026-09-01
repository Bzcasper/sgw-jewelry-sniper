//! Rust mirror of ts/src/algorithm.ts — scoring for Census + bidder + flip

pub struct DemoRaw {
    pub median_hh: f64,
    pub home_value: f64,
    pub white_pct: f64,
    pub median_age: f64,
}

pub struct DemoScore {
    pub rich_town_score: f64,
    pub rich_surrounding: f64,
    pub composite: f64,
    pub bonus: f64,
}

pub fn score_demographics(z: &DemoRaw, county: &DemoRaw, state: &DemoRaw) -> DemoScore {
    let rich_town = if county.median_hh != 0.0 { z.median_hh / county.median_hh } else { 1.0 };
    let rich_sur = if state.median_hh != 0.0 { county.median_hh / state.median_hh } else { 1.0 };
    let home_ratio = if county.home_value != 0.0 { z.home_value / county.home_value } else { 1.0 };
    let norm_rich = ((rich_town - 0.8) / 0.6).clamp(0.0, 1.0);
    let norm_sur = ((rich_sur - 0.9) / 0.4).clamp(0.0, 1.0);
    let norm_white = (z.white_pct / 100.0).clamp(0.0, 1.0);
    let norm_age = (z.median_age / 60.0).clamp(0.0, 1.0);
    let norm_home = ((z.median_hh / 30000.0).ln() / 3.0_f64.ln()).clamp(0.0, 1.0);
    let composite = 0.35 * norm_rich + 0.2 * norm_sur + 0.15 * norm_white + 0.15 * norm_age + 0.15 * norm_home;
    let bonus = if composite > 0.75 || rich_town > 1.25 || home_ratio > 1.3 { 1.10 } else if composite > 0.55 { 1.05 } else { 1.0 };
    DemoScore { rich_town_score: rich_town, rich_surrounding: rich_sur, composite, bonus }
}

pub fn bidder_score(last_second_pct: f64, avg_markup: f64, seller_affinity: f64, jewelry_affinity: f64, recency_hours: f64, win_rate: f64) -> f64 {
    let decay = (recency_hours / 72.0).min(1.0);
    let z = 0.8 * last_second_pct + 0.6 * avg_markup + 0.5 * seller_affinity + 0.4 * jewelry_affinity - 0.3 * decay + 0.2 * win_rate;
    1.0 / (1.0 + (-z).exp())
}

pub fn adjust_max(base: f64, rich_score: f64, peer_score: f64, inc: f64) -> f64 {
    let mut m = base * if rich_score > 1.25 { 1.10 } else if rich_score > 1.1 { 1.05 } else { 1.0 };
    if peer_score > 0.6 { m += inc; }
    (m * 100.0).round() / 100.0
}

pub fn flip_score(current: f64, shipping: f64, closed_median: Option<f64>, bonus: f64, peer_threat_high: bool) -> f64 {
    let baseline = closed_median.map(|m| m * 0.7).unwrap_or(current * 1.5);
    let landed = current + shipping;
    let raw = if baseline != 0.0 { (baseline - landed) / baseline } else { 0.0 };
    let mut adj = raw * bonus;
    if peer_threat_high { adj *= 0.85; }
    (adj * 1000.0).round() / 1000.0
}
