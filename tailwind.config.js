/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        lg: "1200px",
      },
    },
    extend: {
      colors: {
        pine: {
          DEFAULT: "#1B4332",
          light: "#2D6A4F",
        },
        amber: {
          DEFAULT: "#D4A017",
        },
        cream: {
          DEFAULT: "#FAF8F5",
        },
        sand: {
          DEFAULT: "#E8E4DF",
        },
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', 'serif'],
        sans: ['"Noto Sans SC"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
