import { defineConfig } from 'astro/config';

import tailwind from "@astrojs/tailwind";

// Import the Vercel adapter
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: "http://localhost:4321/",
  integrations: [tailwind()],
  output: 'server',
  adapter: vercel(),
  redirects: {
    '/chat': '/app/chat',
    '/pricing': '/',
    '/services': '/',
  },
  vite: {
    ssr: {
      // Keep heavy server-only packages external so Vite doesn't bundle them
      external: ['mammoth', '@pinecone-database/pinecone', '@google/genai'],
    },
  },
});