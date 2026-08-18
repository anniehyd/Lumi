import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light "warm paper" palette
        "lumi-bg": "#FAF7F1",
        "lumi-surface": "#FFFFFF",
        "lumi-surface-hover": "#F4EFE6",
        "lumi-border": "#E8E2D6",
        "lumi-text": "#2B2620",
        "lumi-muted": "#6E6659",
        "lumi-subtle": "#A69D8D",
        "lumi-accent": "#D9821F",
        "lumi-accent-hover": "#C0721A",
        "lumi-blue": "#3D74B3",
        "lumi-rose": "#C05252",
        "lumi-green": "#4E8A3C",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Instrument Serif", "ui-serif", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
