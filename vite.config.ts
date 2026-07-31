import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const watchOptions = {
    ignored: ['**/data/**'],
  };
  const hmrEnabled = process.env.ENABLE_HMR === 'true' && process.env.DISABLE_HMR !== 'true';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Tách vendor lớn khỏi bundle app: trình duyệt cache các chunk vendor
          // (ít đổi) lâu dài, mỗi lần deploy chỉ tải lại phần code app → PWA trên
          // iPhone mở nhanh hơn sau cập nhật.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react';
            if (id.includes('motion')) return 'vendor-motion';
            if (id.includes('lucide')) return 'vendor-icons';
            return undefined; // phần còn lại theo mặc định (react-markdown/heic2any đã lazy)
          },
        },
      },
    },
    server: {
      // HMR opens a separate websocket port (24678 in this environment). When the
      // app is served through family.hsd.ezc.me that port is not exposed, so keep
      // HMR off by default and enable it explicitly only for local dev.
      hmr: hmrEnabled,
      watch: hmrEnabled ? watchOptions : null,
    },
  };
});
