/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // We are extending the theme to include specific Cyberpunk colors
      // referenced in the React components
      colors: {
        neon: {
          green: '#39ff14',
          blue: '#00f3ff',
          yellow: '#ffff00',
        },
        slate: {
          850: '#151f32', // Custom dark shade between 800 and 900
          950: '#020617',
        }
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}