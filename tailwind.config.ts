import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "lumi-bg": "#0F0E0C",
        "lumi-surface": "#1A1815",
        "lumi-surface-hover": "#221F1B",
        "lumi-border": "#2A2723",
        "lumi-text": "#F4EFE6",
        "lumi-muted": "#8F8A80",
        "lumi-subtle": "#5E5A52",
        "lumi-accent": "#E8A04E",
        "lumi-accent-hover": "#F0B068",
        "lumi-blue": "#6B9FD9",
        "lumi-rose": "#D97777",
        "lumi-green": "#7FB069",
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
