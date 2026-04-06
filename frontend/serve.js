/**
 * AlphaFinder — Dev Server + CORS Proxy  (frontend/serve.js)
 *
 * Serves the static frontend files AND proxies /api/* requests to the
 * ElizaOS backend on :3000, eliminating any browser CORS issues in dev.
 *
 * Usage:  node frontend/serve.js
 * UI:     http://localhost:5500
 */

import http      from 'http';
import path      from 'path';
import fs        from 'fs';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const UI_PORT    = 5500;
const AGENT_HOST = 'localhost';
const AGENT_PORT = 3000;

// ── MIME types ────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff2':'font/woff2',
};

// ── Helpers ───────────────────────────────────────────────
const corHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

// ── CORS Proxy (for /api/* routes) ───────────────────────
function proxyToAgent(clientReq, clientRes) {
  // Preflight
  if (clientReq.method === 'OPTIONS') {
    clientRes.writeHead(204, corHeaders);
    clientRes.end();
    return;
  }

  const options = {
    hostname: AGENT_HOST,
    port:     AGENT_PORT,
    path:     clientReq.url,
    method:   clientReq.method,
    headers: {
      ...clientReq.headers,
      host: `${AGENT_HOST}:${AGENT_PORT}`,
    },
  };

  const proxyReq = http.request(options, proxyRes => {
    const status  = proxyRes.statusCode || 502;
    const headers = { ...proxyRes.headers, ...corHeaders };
    clientRes.writeHead(status, headers);
    proxyRes.pipe(clientRes, { end: true });
  });

  proxyReq.on('error', err => {
    console.warn(`[proxy] Agent unreachable: ${err.message}`);
    clientRes.writeHead(502, { 'Content-Type': 'application/json', ...corHeaders });
    clientRes.end(JSON.stringify({
      error: 'Agent offline',
      message: 'ElizaOS agent is not running on :3000. Start it with: npm run dev',
    }));
  });

  clientReq.pipe(proxyReq, { end: true });
}

// ── Static File Server ────────────────────────────────────
function serveStatic(req, res) {
  // Map / → index.html
  let relPath = req.url === '/' ? '/index.html' : req.url;

  // Strip query strings
  relPath = relPath.split('?')[0];

  let filePath = path.join(__dirname, relPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end('403 Forbidden'); return;
  }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback to index.html for client-side routing (SPA support)
      fs.readFile(path.join(__dirname, 'index.html'), (err2, fallback) => {
        if (err2) { res.writeHead(404); res.end('404 Not Found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallback);
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type':  mime,
      'Cache-Control': 'no-cache, no-store',
    });
    res.end(data);
  });
}

// ── Main Server ───────────────────────────────────────────
const server = http.createServer((req, res) => {
  // All /api/* requests → proxy to ElizaOS
  if (req.url?.startsWith('/api/')) {
    proxyToAgent(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(UI_PORT, () => {
  console.log('\n  ╔═══════════════════════════════════════╗');
  console.log('  ║   ✦  AlphaFinder Dev Server           ║');
  console.log(`  ║                                       ║`);
  console.log(`  ║   UI    →  http://localhost:${UI_PORT}      ║`);
  console.log(`  ║   API   →  proxied to :${AGENT_PORT}           ║`);
  console.log('  ╚═══════════════════════════════════════╝\n');
  console.log('  Tip: start the agent with  npm run dev\n');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`  ✗ Port ${UI_PORT} is already in use. Kill the process or change UI_PORT.`);
  } else {
    console.error('  Server error:', err.message);
  }
  process.exit(1);
});
