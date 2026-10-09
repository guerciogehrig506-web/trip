/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0a0a0f',
          800: '#111118',
          700: '#1a1a24',
          600: '#262633',
        },
        accent: {
          DEFAULT: '#38bdf8',
          glow: '#7dd3fc',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
