import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 你之前已经在 3001 跑起来了（3000 被占用），这里固定成 3001，避免每次变端口
    port: 3001,
    open: true,
    // Dev-only CORS workaround:
    // 浏览器直连 HF Inference 会被 CORS 拦截 + 旧 api-inference 域名已下线
    // 用 Vite proxy 让浏览器只请求同源 /hf/*，再由本地 dev server 转发到 HF
    proxy: {
      '/hf': {
        // ✅ 新推理路由域名
        target: 'https://router.huggingface.co',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/hf/, ''),
      },
    },
  }
})
