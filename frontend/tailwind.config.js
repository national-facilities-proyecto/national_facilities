/** @type {import('tailwindcss').Config} */
export default {
  safelist: ['nf-button--primary', 'nf-button--secondary', 'nf-button--danger'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#e7f3f6', 700: '#087492', 800: '#075c78', 900: '#064f68', 950: '#043c50' },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 2px 8px rgb(20 44 57 / 0.06)' },
      borderRadius: { lg: '8px', xl: '12px', '2xl': '16px' },
    },
  },
  plugins: [],
}
