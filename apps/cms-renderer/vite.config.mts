import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';
export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  environments: {
    server: { define: { 'process.env.NODE_ENV': JSON.stringify('production') } },
  },
  plugins: [voidPlugin(), tanstackStart(), react()],
});
