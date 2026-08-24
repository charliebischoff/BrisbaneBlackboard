/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        court: {
          hardwood: '#b8763f',
          hardwoodDark: '#9c5f2e',
          line: '#f5efe0',
        },
        team: {
          offense: '#3b82f6',
          defense: '#dc2626',
        },
        ink: {
          900: '#0a0e17',
          800: '#131826',
          700: '#1c2333',
        },
        accent: '#e0a458',
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
