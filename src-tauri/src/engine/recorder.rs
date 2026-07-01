//! Live input capture → timeline (SPEC §F2). The global listener feeds raw
//! events here while recording. Hotkey presses are never recorded; motion is
//! sampled; keyboard/motion capture are toggleable.

use std::sync::Mutex;
use std::time::Instant;

use crate::input::listener::RawInput;
use crate::model::{CaptureMode, Event, EventKind, Macro, Monitor, RecordOpts, Source};

#[derive(Default)]
struct State {
    active: bool,
    opts: RecordOpts,
    start: Option<Instant>,
    last_move_t: u64,
    have_move: bool,
    events: Vec<Event>,
}

#[derive(Default)]
pub struct Recorder {
    st: Mutex<State>,
}

impl Recorder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_active(&self) -> bool {
        self.st.lock().unwrap().active
    }

    pub fn count(&self) -> usize {
        self.st.lock().unwrap().events.len()
    }

    pub fn start(&self, opts: RecordOpts) {
        let mut st = self.st.lock().unwrap();
        st.active = true;
        st.opts = opts;
        st.start = Some(Instant::now());
        st.last_move_t = 0;
        st.have_move = false;
        st.events.clear();
    }

    /// Feed one raw event. Returns the recorded `Event` if it was captured.
    /// `cursor` is the current pointer position (button/key events carry none).
    /// `hotkey_codes` are skipped so a hotkey never lands in the macro.
    pub fn feed(
        &self,
        raw: &RawInput,
        cursor: (i32, i32),
        hotkey_codes: &[String],
    ) -> Option<Event> {
        let t = {
            let st = self.st.lock().unwrap();
            if !st.active {
                return None;
            }
            st.start
                .map(|s| s.elapsed().as_millis() as u64)
                .unwrap_or(0)
        };
        self.feed_at(raw, cursor, hotkey_codes, t)
    }

    /// Timing-injectable core for tests.
    fn feed_at(
        &self,
        raw: &RawInput,
        cursor: (i32, i32),
        hotkey_codes: &[String],
        t: u64,
    ) -> Option<Event> {
        let mut st = self.st.lock().unwrap();
        if !st.active {
            return None;
        }

        let kind = match raw {
            RawInput::Move { x, y } => {
                if st.opts.capture_mode != CaptureMode::FullMotion {
                    return None;
                }
                if st.have_move && t.saturating_sub(st.last_move_t) < st.opts.motion_sample_ms {
                    return None;
                }
                st.last_move_t = t;
                st.have_move = true;
                EventKind::Move { x: *x, y: *y }
            }
            RawInput::Button { button, action } => match action {
                crate::model::KeyAction::Press => EventKind::Down {
                    button: *button,
                    x: cursor.0,
                    y: cursor.1,
                },
                crate::model::KeyAction::Release => EventKind::Up {
                    button: *button,
                    x: cursor.0,
                    y: cursor.1,
                },
            },
            RawInput::Key { code, action } => {
                if !st.opts.capture_keyboard {
                    return None;
                }
                if hotkey_codes.iter().any(|h| h == code) {
                    return None;
                }
                EventKind::Key {
                    code: code.clone(),
                    action: *action,
                }
            }
            RawInput::Wheel { dx, dy } => EventKind::Scroll {
                x: cursor.0,
                y: cursor.1,
                dx: *dx as i32,
                dy: *dy as i32,
            },
        };

        let ev = Event { t, kind };
        st.events.push(ev.clone());
        Some(ev)
    }

    /// Stop and produce the macro, stamping the current monitor layout (SPEC §7).
    pub fn stop(&self, name: impl Into<String>, monitors: Vec<Monitor>) -> Macro {
        let mut st = self.st.lock().unwrap();
        st.active = false;
        let mut m = Macro::empty(name, Source::Recorded);
        m.monitors = monitors;
        m.events = std::mem::take(&mut st.events);
        m
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{KeyAction, MouseButton};

    fn rec(mode: CaptureMode, kb: bool, sample: u64) -> Recorder {
        let r = Recorder::new();
        r.start(RecordOpts {
            capture_mode: mode,
            motion_sample_ms: sample,
            capture_keyboard: kb,
        });
        r
    }

    #[test]
    fn clicks_only_ignores_motion() {
        let r = rec(CaptureMode::ClicksOnly, true, 15);
        assert!(r
            .feed_at(&RawInput::Move { x: 1, y: 2 }, (0, 0), &[], 0)
            .is_none());
        let down = r.feed_at(
            &RawInput::Button {
                button: MouseButton::Left,
                action: KeyAction::Press,
            },
            (10, 20),
            &[],
            5,
        );
        assert!(matches!(
            down.unwrap().kind,
            EventKind::Down { x: 10, y: 20, .. }
        ));
    }

    #[test]
    fn full_motion_samples_by_interval() {
        let r = rec(CaptureMode::FullMotion, true, 15);
        assert!(r
            .feed_at(&RawInput::Move { x: 0, y: 0 }, (0, 0), &[], 0)
            .is_some());
        // 10ms later: below sample interval → dropped.
        assert!(r
            .feed_at(&RawInput::Move { x: 1, y: 1 }, (0, 0), &[], 10)
            .is_none());
        // 20ms: >= interval → kept.
        assert!(r
            .feed_at(&RawInput::Move { x: 2, y: 2 }, (0, 0), &[], 20)
            .is_some());
    }

    #[test]
    fn keyboard_toggle_and_hotkey_skip() {
        let r = rec(CaptureMode::FullMotion, false, 15);
        // keyboard capture off → key dropped.
        assert!(r
            .feed_at(
                &RawInput::Key {
                    code: "KeyA".into(),
                    action: KeyAction::Press
                },
                (0, 0),
                &[],
                0
            )
            .is_none());

        let r2 = rec(CaptureMode::FullMotion, true, 15);
        // hotkey code skipped even with keyboard capture on.
        assert!(r2
            .feed_at(
                &RawInput::Key {
                    code: "F8".into(),
                    action: KeyAction::Press
                },
                (0, 0),
                &["F8".to_string()],
                0
            )
            .is_none());
        // normal key captured.
        assert!(r2
            .feed_at(
                &RawInput::Key {
                    code: "KeyE".into(),
                    action: KeyAction::Press
                },
                (0, 0),
                &["F8".to_string()],
                1
            )
            .is_some());
    }

    #[test]
    fn stop_is_safe_to_call_again() {
        let r = rec(CaptureMode::FullMotion, true, 15);
        r.feed_at(&RawInput::Move { x: 5, y: 5 }, (0, 0), &[], 0);
        let first = r.stop("a", vec![]);
        assert_eq!(first.events.len(), 1);
        // Second stop while inactive: empty, no panic, still inactive.
        let second = r.stop("b", vec![]);
        assert_eq!(second.events.len(), 0);
        assert!(!r.is_active());
    }

    #[test]
    fn stop_produces_recorded_macro() {
        let r = rec(CaptureMode::FullMotion, true, 15);
        r.feed_at(&RawInput::Move { x: 5, y: 5 }, (0, 0), &[], 0);
        let m = r.stop("t", vec![]);
        assert_eq!(m.source, Source::Recorded);
        assert_eq!(m.events.len(), 1);
        assert!(!r.is_active());
    }
}
