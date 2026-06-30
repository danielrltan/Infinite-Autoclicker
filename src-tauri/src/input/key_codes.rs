//! Bidirectional mapping between `rdev::Key` and our platform-neutral string
//! codes. Variant names are used verbatim as codes ("KeyE", "Return", "F8", …)
//! so recorded macros round-trip losslessly.

use rdev::Key;

macro_rules! key_codes {
    ($($variant:ident),* $(,)?) => {
        /// rdev key → string code.
        pub fn key_to_code(k: &Key) -> String {
            match k {
                $(Key::$variant => stringify!($variant).to_string(),)*
                Key::Unknown(n) => format!("Unknown({})", n),
            }
        }

        /// string code → rdev key (None if unrecognized).
        pub fn code_to_key(code: &str) -> Option<Key> {
            match code {
                $(stringify!($variant) => Some(Key::$variant),)*
                other => parse_unknown(other),
            }
        }

        #[cfg(test)]
        fn all_named_keys() -> Vec<Key> {
            vec![$(Key::$variant),*]
        }
    };
}

fn parse_unknown(code: &str) -> Option<Key> {
    let inner = code.strip_prefix("Unknown(")?.strip_suffix(')')?;
    inner.parse::<u32>().ok().map(Key::Unknown)
}

key_codes!(
    Alt,
    AltGr,
    Backspace,
    CapsLock,
    ControlLeft,
    ControlRight,
    Delete,
    DownArrow,
    End,
    Escape,
    F1,
    F2,
    F3,
    F4,
    F5,
    F6,
    F7,
    F8,
    F9,
    F10,
    F11,
    F12,
    Home,
    LeftArrow,
    MetaLeft,
    MetaRight,
    PageDown,
    PageUp,
    Return,
    RightArrow,
    ShiftLeft,
    ShiftRight,
    Space,
    Tab,
    UpArrow,
    PrintScreen,
    ScrollLock,
    Pause,
    NumLock,
    BackQuote,
    Num1,
    Num2,
    Num3,
    Num4,
    Num5,
    Num6,
    Num7,
    Num8,
    Num9,
    Num0,
    Minus,
    Equal,
    KeyQ,
    KeyW,
    KeyE,
    KeyR,
    KeyT,
    KeyY,
    KeyU,
    KeyI,
    KeyO,
    KeyP,
    LeftBracket,
    RightBracket,
    KeyA,
    KeyS,
    KeyD,
    KeyF,
    KeyG,
    KeyH,
    KeyJ,
    KeyK,
    KeyL,
    SemiColon,
    Quote,
    BackSlash,
    IntlBackslash,
    KeyZ,
    KeyX,
    KeyC,
    KeyV,
    KeyB,
    KeyN,
    KeyM,
    Comma,
    Dot,
    Slash,
    Insert,
    KpReturn,
    KpMinus,
    KpPlus,
    KpMultiply,
    KpDivide,
    Kp0,
    Kp1,
    Kp2,
    Kp3,
    Kp4,
    Kp5,
    Kp6,
    Kp7,
    Kp8,
    Kp9,
    KpDelete,
    Function,
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn named_keys_roundtrip() {
        for k in all_named_keys() {
            let code = key_to_code(&k);
            assert_eq!(code_to_key(&code), Some(k), "roundtrip failed for {code}");
        }
    }

    #[test]
    fn unknown_roundtrips() {
        let k = rdev::Key::Unknown(4242);
        assert_eq!(key_to_code(&k), "Unknown(4242)");
        assert_eq!(code_to_key("Unknown(4242)"), Some(k));
    }

    #[test]
    fn common_codes_are_stable() {
        assert_eq!(key_to_code(&Key::KeyE), "KeyE");
        assert_eq!(key_to_code(&Key::Return), "Return");
        assert_eq!(key_to_code(&Key::F8), "F8");
        assert_eq!(code_to_key("Space"), Some(Key::Space));
    }

    #[test]
    fn garbage_code_is_none() {
        assert_eq!(code_to_key("NotARealKey"), None);
    }
}
