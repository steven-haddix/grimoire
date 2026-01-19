import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        parchment: "#f5f1e8",
        ink: "#2a211b",
        ember: "#d3542f"
      },
      boxShadow: {
        glow: "0 0 40px rgba(211, 84, 47, 0.25)"
      }
    }
  },
  plugins: [tailwindcssAnimate, typography]
};

export default config;
