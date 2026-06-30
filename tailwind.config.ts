import type { Config } from "tailwindcss";

/**
 * Design tokens from SPEC §10. Colors are driven by CSS variables defined in
 * src/styles/globals.css so light/dark follow the OS (`.dark` class toggled by
 * the theme controller). Values are the literal spec hexes.
 */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--muted)",
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          fg: "var(--accent-fg)",
        },
        // Semantic state colors (SPEC §10)
        record: "var(--record)", // red — recording + destructive
        play: "var(--play)", // green — playing + success
        warn: "var(--warn)", // amber — permissions, mismatch
      },
      fontSize: {
        overline: ["11px", { lineHeight: "16px", letterSpacing: "0.04em" }],
        label: ["12px", { lineHeight: "16px" }],
        body: ["13px", { lineHeight: "18px" }],
        ui: ["14px", { lineHeight: "20px" }],
        title: ["15px", { lineHeight: "22px", letterSpacing: "-0.006em" }],
        heading: ["18px", { lineHeight: "24px", letterSpacing: "-0.01em" }],
      },
      borderRadius: {
        sm: "4px", // nested elements (select items, chips, dialog close)
        control: "6px",
        card: "8px",
        modal: "12px",
      },
      spacing: {
        // SPEC spacing scale 4 / 8 / 12 / 16 / 24 / 32 (Tailwind defaults cover these)
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      boxShadow: {
        // Flat by default; single subtle shadow only on popovers/modals.
        pop: "0 8px 28px -6px rgb(0 0 0 / 0.18), 0 2px 8px -2px rgb(0 0 0 / 0.10)",
      },
      transitionTimingFunction: {
        "ease-out-soft": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        "150": "150ms",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pulse-rec": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "pulse-rec": "pulse-rec 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
