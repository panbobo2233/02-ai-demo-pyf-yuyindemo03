import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'xfyun-auth',
        configureServer(server) {
          server.middlewares.use('/api/xfyun-auth', (_req, res) => {
            const host = 'iat-api.xfyun.cn';
            const apiPath = '/v2/iat';
            const date = new Date().toUTCString();
            const secret = env.XF_API_SECRET || process.env.XF_API_SECRET || 'ZGU1Zjg1YjlmMGI4MGE5MTJmN2QyYjgy';
            const key = env.XF_API_KEY || process.env.XF_API_KEY || '0a5185249a162c22def9acde30a55001';

            const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${apiPath} HTTP/1.1`;
            const hmac = crypto.createHmac('sha256', secret);
            hmac.update(signatureOrigin);
            const signature = hmac.digest('base64');

            const authOrigin = `api_key="${key}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
            const authorization = Buffer.from(authOrigin).toString('base64');

            const url = `wss://${host}${apiPath}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`;

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({url, appid: 'fb756a4d'}));
          });
        },
      },
    ],
    define: {
      'process.env.DEEPSEEK_API_KEY': JSON.stringify(env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || ''),
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
