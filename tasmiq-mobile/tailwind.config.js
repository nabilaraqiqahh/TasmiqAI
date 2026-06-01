/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#2F6D5A",
        accent: "#D6C08D",
        background: "#F8F5F0",
        surface: "#EEF5F1",
        card: "#FFFFFF",
        text: "#2C2C2C",
        muted: "#6B6B6B",
      }
    },
  },
  plugins: [],
}
