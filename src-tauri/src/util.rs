//! Small dependency-light helpers: timestamps and a fast non-crypto RNG.

use std::time::{SystemTime, UNIX_EPOCH};

/// Current time as an ISO 8601 / RFC 3339 UTC string (e.g. `2026-06-29T18:30:00Z`).
pub fn now_iso8601() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// Current unix time in milliseconds.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// SplitMix64 - tiny, fast, good-enough PRNG for humanization jitter.
/// Not cryptographic; jitter quality does not require it (SPEC §F3a).
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self {
            state: seed.wrapping_add(0x9E37_79B9_7F4A_7C15),
        }
    }

    /// Seed from the wall clock so each playback session differs.
    pub fn from_clock() -> Self {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x1234_5678);
        Self::new(nanos ^ 0xA5A5_5A5A_DEAD_BEEF)
    }

    pub fn next_u64(&mut self) -> u64 {
        let mut z = {
            self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
            self.state
        };
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform f64 in [0, 1).
    pub fn next_f64(&mut self) -> f64 {
        // 53-bit mantissa precision.
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    /// Uniform f64 in [lo, hi).
    pub fn range_f64(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * self.next_f64()
    }

    /// A uniformly-distributed point within a disc of `radius` around origin.
    /// Returns (dx, dy). Uses sqrt-radius sampling for uniform area density.
    pub fn point_in_disc(&mut self, radius: f64) -> (f64, f64) {
        if radius <= 0.0 {
            return (0.0, 0.0);
        }
        let theta = self.range_f64(0.0, std::f64::consts::TAU);
        let r = radius * self.next_f64().sqrt();
        (r * theta.cos(), r * theta.sin())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rng_f64_in_unit_range() {
        let mut rng = Rng::new(42);
        for _ in 0..10_000 {
            let v = rng.next_f64();
            assert!((0.0..1.0).contains(&v));
        }
    }

    #[test]
    fn disc_points_within_radius() {
        let mut rng = Rng::new(7);
        let radius = 25.0;
        for _ in 0..10_000 {
            let (dx, dy) = rng.point_in_disc(radius);
            assert!((dx * dx + dy * dy).sqrt() <= radius + 1e-9);
        }
    }

    #[test]
    fn disc_zero_radius_is_origin() {
        let mut rng = Rng::new(1);
        assert_eq!(rng.point_in_disc(0.0), (0.0, 0.0));
    }
}
