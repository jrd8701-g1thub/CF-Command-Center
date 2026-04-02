import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        border: "var(--border)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        cyan: "var(--cyan)",
        // New dashboard accents
        charcoal: {
          900: "#090A0F",
          800: "#13161F",
          700: "#1C212E",
          600: "#2B3245",
        },
        brand: {
          orange: "#FF4500",
          teal: "#00E5FF",
          blue: "#3A86FF",
          red: "#FF003C",
          green: "#00E676"
        }
      },
    },
  },
  plugins: [],
};
export default config;
