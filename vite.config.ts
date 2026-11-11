import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: they only change when dependencies change, so browsers keep them cached
        manualChunks(id) {
          if (id.includes('node_modules/@firebase/firestore') || id.includes('node_modules/firebase/firestore')) return 'firebase-firestore';
          if (id.includes('node_modules/@firebase/auth') || id.includes('node_modules/firebase/auth')) return 'firebase-auth';
          if (id.includes('node_modules/@firebase') || id.includes('node_modules/firebase')) return 'firebase-core';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          return undefined;
        },
      },
    },
  },
});
