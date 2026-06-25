/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        nite: {
          bg:      "#0a0a0a",
          surface: "#141414",
          border:  "#222222",
          accent:  "#c8f135",   // electric lime — the one bold choice
          seeker:  "#ff4444",
          hider:   "#4488ff",
          warn:    "#ff9900",
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "sans-serif"],
        mono:    ['"JetBrains Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
