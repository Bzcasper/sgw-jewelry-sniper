pub fn demographics_bonus(rich_town_score: f64) -> f64 {
    if rich_town_score > 1.25 {
        1.10
    } else {
        1.0
    }
}
pub fn bidder_score(
    last_second_pct: f64,
    avg_markup: f64,
    seller_affinity: f64,
    jewelry_affinity: f64,
    recency_hours: f64,
) -> f64 {
    let recency_decay = (recency_hours / 72.0).min(1.0);
    let z =
        0.8 * last_second_pct + 0.6 * avg_markup + 0.5 * seller_affinity + 0.4 * jewelry_affinity
            - 0.3 * recency_decay;
    1.0 / (1.0 + (-z).exp())
}
pub fn adjust_max(base: f64, rich_score: f64, peer_score: f64, bid_increment: f64) -> f64 {
    let mut m = base * demographics_bonus(rich_score);
    if peer_score > 0.6 {
        m += bid_increment;
    }
    (m * 100.0).round() / 100.0
}
