import { defineConfig } from 'vite';
import { filterCheck } from 'decoy-duck/vite';

export default defineConfig({
  plugins: [filterCheck()],
});
