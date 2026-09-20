import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import http from 'node:http'
import https from 'node:https'

function cameraProxyPlugin() {
  return {
    name: 'camera-proxy',
    configureServer(server) {
      server.middlewares.use('/camera-proxy', (req, res) => {
        const urlObj = new URL(req.url, 'http://localhost');
        const target = urlObj.searchParams.get('url');
        if (!target) {
          res.statusCode = 400;
          return res.end('Missing url query parameter');
        }
        try {
          const client = target.startsWith('https') ? https : http;
          const proxyReq = client.get(target, (proxyRes) => {
            const headers = { ...proxyRes.headers };
            headers['access-control-allow-origin'] = '*';
            headers['access-control-allow-methods'] = 'GET, OPTIONS';
            res.writeHead(proxyRes.statusCode || 200, headers);
            proxyRes.pipe(res);
          });
          proxyReq.on('error', (err) => {
            res.statusCode = 502;
            res.end(`Camera proxy error: ${err.message}`);
          });
        } catch (e) {
          res.statusCode = 500;
          res.end(`Proxy exception: ${e.message}`);
        }
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    cameraProxyPlugin()
  ],
})
