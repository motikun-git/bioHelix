import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // During development the React app calls /api on the same origin; Vite forwards it to Express
    proxy: { '/api': 'http://localhost:5000' },
  },
});
