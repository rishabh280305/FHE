import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#fff6df",
        ink: "#111111",
        cyanpop: "#26f0ff",
        pinkpop: "#ff4bb8",
        limepop: "#b8ff3d",
        orangepop: "#ff9b39",
        purplepop: "#8f5cff"
      },
      boxShadow: {
        brutal: "5px 5px 0 rgba(17,17,17,0.88)",
        brutalSm: "3px 3px 0 rgba(17,17,17,0.8)",
        glass: "0 24px 80px rgba(17, 17, 17, 0.10), inset 0 1px 0 rgba(255,255,255,0.72)",
        soft: "0 14px 36px rgba(17, 17, 17, 0.12)",
        glow: "0 0 32px rgba(38, 240, 255, 0.24)",
        glowCyan: "0 0 28px rgba(38, 240, 255, 0.28)"
      },
      fontFamily: {
        sans: ["var(--font-space-grotesk)", "ui-sans-serif", "system-ui"]
      }
    }
  },
  plugins: []
};

export default config;
