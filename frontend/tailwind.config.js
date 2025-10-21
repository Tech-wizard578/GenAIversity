export default {
  darkMode: 'class', // Enable dark mode using the 'class' strategy
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'bounce': 'bounce 1s infinite',
      },
    },
  },
  plugins: [],
}
