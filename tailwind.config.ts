import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Direction D: white paper, ink, one electric accent, a highlighter.
        "lumi-bg": "#FFFFFF",
        "lumi-surface": "#F6F5F2",
        "lumi-surface-hover": "#EFEDE8",
        "lumi-border": "#E6E4DF",
        "lumi-text": "#111111",
        "lumi-muted": "#6B6B6B",
        "lumi-subtle": "#9A9890",
        "lumi-accent": "#2B4BFF",
        "lumi-accent-hover": "#1F3AD6",
        "lumi-mark": "#F5E663",
        "lumi-blue": "#2B4BFF",
        "lumi-rose": "#9A2E2E",
        "lumi-green": "#2E7D32",
      },
      fontFamily: {
        sans: ["Bricolage Grotesque", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Fraunces", "ui-serif", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        mark: {
          "0%": { transform: "rotate(-1.2deg) scaleX(0)" },
          "100%": { transform: "rotate(-1.2deg) scaleX(1)" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        rise: "rise 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
        mark: "mark 600ms cubic-bezier(0.2, 0.7, 0.2, 1) 550ms both",
        "spin-slow": "spin-slow 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
