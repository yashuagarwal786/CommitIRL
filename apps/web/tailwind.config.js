/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B1220",
        panel: "#121A2B",
        line: "#243049",
        mist: "#C9D4E8",
        accent: "#2DD4BF",
        warn: "#F5B942",
        danger: "#F07167",
      },
      fontFamily: {
        sans: ["Source Sans 3", "Segoe UI", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
