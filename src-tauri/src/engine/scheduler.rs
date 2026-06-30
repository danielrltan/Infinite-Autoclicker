//! Scheduler (SPEC §F4). One-shot + interval, with weekly recurrence behind a
//! flag. Schedules live only while the app is open (v1 decision, SPEC §17.2).
//! Timers run on a tokio runtime; firing invokes the stored `on_fire` callback.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::{Datelike, Local, TimeZone};
use tokio::runtime::Handle;
use tokio::task::AbortHandle;

use crate::model::{Macro, PlaybackOpts, Schedule, ScheduleInfo, Weekday};
use crate::util::now_ms;

type FireFn = Arc<dyn Fn(Macro, PlaybackOpts) + Send + Sync>;

struct Armed {
    info: ScheduleInfo,
    abort: AbortHandle,
}

pub struct Scheduler {
    inner: Arc<Mutex<HashMap<String, Armed>>>,
    next_id: AtomicU64,
    handle: Handle,
    on_fire: FireFn,
}

impl Scheduler {
    pub fn new(handle: Handle, on_fire: FireFn) -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
            handle,
            on_fire,
        }
    }

    pub fn arm(&self, macro_: Macro, schedule: Schedule, opts: PlaybackOpts) -> String {
        let id = format!("sch-{}", self.next_id.fetch_add(1, Ordering::SeqCst));
        let macro_name = macro_.name.clone();
        let next = next_run(&schedule, now_ms());

        let inner = Arc::clone(&self.inner);
        let on_fire = Arc::clone(&self.on_fire);
        let id_task = id.clone();
        let sched_task = schedule.clone();

        let join = self.handle.spawn(async move {
            run_schedule(id_task, sched_task, macro_, opts, on_fire, inner).await;
        });

        let info = ScheduleInfo {
            id: id.clone(),
            macro_name,
            schedule,
            next_run_ms: next,
        };
        self.inner.lock().unwrap().insert(
            id.clone(),
            Armed {
                info,
                abort: join.abort_handle(),
            },
        );
        id
    }

    pub fn cancel(&self, id: &str) {
        if let Some(a) = self.inner.lock().unwrap().remove(id) {
            a.abort.abort();
        }
    }

    /// Cancel every armed schedule (panic / app shutdown).
    pub fn cancel_all(&self) {
        let mut map = self.inner.lock().unwrap();
        for (_, a) in map.drain() {
            a.abort.abort();
        }
    }

    pub fn list(&self) -> Vec<ScheduleInfo> {
        self.inner
            .lock()
            .unwrap()
            .values()
            .map(|a| a.info.clone())
            .collect()
    }
}

async fn run_schedule(
    id: String,
    schedule: Schedule,
    macro_: Macro,
    opts: PlaybackOpts,
    on_fire: FireFn,
    registry: Arc<Mutex<HashMap<String, Armed>>>,
) {
    // Loops until `next_run` returns None (past one-shot) or the task is aborted.
    while let Some(next) = next_run(&schedule, now_ms()) {
        // Reflect next run in the registry for list_schedules.
        if let Some(a) = registry.lock().unwrap().get_mut(&id) {
            a.info.next_run_ms = Some(next);
        }
        let delay = (next - now_ms()).max(0) as u64;
        tokio::time::sleep(Duration::from_millis(delay)).await;

        // Still armed?
        if !registry.lock().unwrap().contains_key(&id) {
            return;
        }
        (on_fire)(macro_.clone(), opts);

        if matches!(schedule, Schedule::Once { .. }) {
            break;
        }
    }
    registry.lock().unwrap().remove(&id);
}

/// Pure next-run computation (unix epoch ms). `None` = will not run again.
pub fn next_run(schedule: &Schedule, now: i64) -> Option<i64> {
    match schedule {
        Schedule::Once { at_ms } => (*at_ms > now).then_some(*at_ms),
        Schedule::Interval {
            every_ms,
            start_at_ms,
        } => {
            let every = (*every_ms).max(1);
            match start_at_ms {
                Some(start) if *start > now => Some(*start),
                Some(start) => {
                    let elapsed = now - start;
                    let n = elapsed / every + 1;
                    Some(start + n * every)
                }
                None => Some(now + every),
            }
        }
        Schedule::Weekly { days, hour, minute } => next_weekly(days, *hour, *minute, now),
    }
}

fn weekday_matches(d: chrono::Weekday, days: &[Weekday]) -> bool {
    let mapped = match d {
        chrono::Weekday::Mon => Weekday::Mon,
        chrono::Weekday::Tue => Weekday::Tue,
        chrono::Weekday::Wed => Weekday::Wed,
        chrono::Weekday::Thu => Weekday::Thu,
        chrono::Weekday::Fri => Weekday::Fri,
        chrono::Weekday::Sat => Weekday::Sat,
        chrono::Weekday::Sun => Weekday::Sun,
    };
    days.contains(&mapped)
}

fn next_weekly(days: &[Weekday], hour: u8, minute: u8, now: i64) -> Option<i64> {
    if days.is_empty() {
        return None;
    }
    let now_dt = Local.timestamp_millis_opt(now).single()?;
    for ahead in 0..8 {
        let day = now_dt.date_naive() + chrono::Duration::days(ahead);
        if !weekday_matches(day.weekday(), days) {
            continue;
        }
        let candidate = day.and_hms_opt(hour as u32, minute as u32, 0)?;
        let candidate = Local.from_local_datetime(&candidate).single()?;
        let cand_ms = candidate.timestamp_millis();
        if cand_ms > now {
            return Some(cand_ms);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn once_in_future_then_none_after() {
        let now = 1_000_000;
        assert_eq!(
            next_run(&Schedule::Once { at_ms: 2_000_000 }, now),
            Some(2_000_000)
        );
        assert_eq!(next_run(&Schedule::Once { at_ms: 500_000 }, now), None);
    }

    #[test]
    fn interval_without_start_is_now_plus_every() {
        let now = 1_000;
        let s = Schedule::Interval {
            every_ms: 5_000,
            start_at_ms: None,
        };
        assert_eq!(next_run(&s, now), Some(6_000));
    }

    #[test]
    fn interval_with_future_start() {
        let now = 1_000;
        let s = Schedule::Interval {
            every_ms: 5_000,
            start_at_ms: Some(10_000),
        };
        assert_eq!(next_run(&s, now), Some(10_000));
    }

    #[test]
    fn interval_after_start_snaps_to_next_boundary() {
        // start=0, every=1000; now=2500 → next boundary 3000.
        let s = Schedule::Interval {
            every_ms: 1_000,
            start_at_ms: Some(0),
        };
        assert_eq!(next_run(&s, 2_500), Some(3_000));
        // exactly on a boundary → next one.
        assert_eq!(next_run(&s, 3_000), Some(4_000));
    }

    #[test]
    fn weekly_returns_future_time() {
        let now = now_ms();
        let s = Schedule::Weekly {
            days: vec![Weekday::Mon, Weekday::Wed, Weekday::Fri],
            hour: 9,
            minute: 0,
        };
        let n = next_run(&s, now).expect("weekly should find a next slot");
        assert!(n > now);
        // Within the next 8 days.
        assert!(n < now + 8 * 24 * 3600 * 1000);
    }

    #[test]
    fn weekly_empty_days_is_none() {
        let s = Schedule::Weekly {
            days: vec![],
            hour: 9,
            minute: 0,
        };
        assert_eq!(next_run(&s, now_ms()), None);
    }
}
