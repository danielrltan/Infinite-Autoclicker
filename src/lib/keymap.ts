// Map a browser KeyboardEvent to our platform-neutral code (rdev variant names),
// used by the hotkey rebind UI. Mirrors src-tauri/src/input/key_codes.rs naming.

export function browserCodeToIac(e: KeyboardEvent): string | null {
  const c = e.code;
  // Ignore lone modifier presses while waiting for a real key? We allow them.
  if (/^F\d{1,2}$/.test(c)) return c; // F1..F12
  if (/^Key[A-Z]$/.test(c)) return c; // KeyA..KeyZ
  const digit = c.match(/^Digit(\d)$/);
  if (digit) return `Num${digit[1]}`;
  const numpad = c.match(/^Numpad(\d)$/);
  if (numpad) return `Kp${numpad[1]}`;

  const map: Record<string, string> = {
    Enter: "Return",
    NumpadEnter: "KpReturn",
    Space: "Space",
    Escape: "Escape",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    ArrowUp: "UpArrow",
    ArrowDown: "DownArrow",
    ArrowLeft: "LeftArrow",
    ArrowRight: "RightArrow",
    ShiftLeft: "ShiftLeft",
    ShiftRight: "ShiftRight",
    ControlLeft: "ControlLeft",
    ControlRight: "ControlRight",
    AltLeft: "Alt",
    AltRight: "AltGr",
    MetaLeft: "MetaLeft",
    MetaRight: "MetaRight",
    CapsLock: "CapsLock",
    Minus: "Minus",
    Equal: "Equal",
    Comma: "Comma",
    Period: "Dot",
    Slash: "Slash",
    Semicolon: "SemiColon",
    Quote: "Quote",
    BracketLeft: "LeftBracket",
    BracketRight: "RightBracket",
    Backslash: "BackSlash",
    Backquote: "BackQuote",
  };
  return map[c] ?? null;
}
