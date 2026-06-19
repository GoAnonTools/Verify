#!/usr/bin/env node
/**
 * goanon Yivi relay — dependency-free Node.js requestor backend.
 * Requires Node.js 18+ for the built-in fetch API.
 */
import http from 'node:http';

const DEFAULT_ATTRIBUTE = 'pbdf.gemeente.personalData.dateofbirth';
const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = (process.env.YIVI_IRMA_SERVER || 'http://127.0.0.1:8088').replace(/\/$/, '');
const AUTHORIZATION = process.env.YIVI_REQUESTOR_AUTHORIZATION || process.env.YIVI_REQUESTOR_TOKEN || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ATTRIBUTE = process.env.YIVI_ATTRIBUTE || DEFAULT_ATTRIBUTE;
const SESSION_TTL_MS = parseDuration(process.env.SESSION_TTL || '10m');
const TOKEN_RE = /^[A-Za-z0-9_-]{10,128}$/;
const sessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [token, expires] of sessions) if (expires <= now) sessions.delete(token);
}, 60_000).unref();

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return end(res, 204);

  try {
    if (req.url === '/healthz' && req.method === 'GET') {
      return json(res, 200, { ok: true });
    }
    if (req.url === '/session' && req.method === 'POST') {
      return await startSession(req, res);
    }
    if (req.url?.startsWith('/session/result/') && req.method === 'GET') {
      return await getResult(req, res);
    }
    return json(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: 'internal relay error' });
  }
});

server.listen(PORT, () => {
  console.log(`goanon Yivi relay listening on :${PORT} → ${UPSTREAM}`);
});

async function startSession(req, res) {
  let body;
  try {
    body = await readSessionRequest(req, ATTRIBUTE);
  } catch (err) {
    return json(res, 400, { error: err.message });
  }

  const upstream = await fetch(`${UPSTREAM}/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(AUTHORIZATION ? { Authorization: AUTHORIZATION } : {}),
    },
    body,
  }).catch(() => null);

  if (!upstream) return json(res, 502, { error: 'Yivi server unreachable' });
  const text = await upstream.text();
  if (!upstream.ok) return rawJson(res, upstream.status, text);

  let pkg;
  try { pkg = JSON.parse(text); } catch { return json(res, 502, { error: 'invalid Yivi session package' }); }
  if (!TOKEN_RE.test(pkg.token || '')) return json(res, 502, { error: 'Yivi server returned invalid token' });
  sessions.set(pkg.token, Date.now() + SESSION_TTL_MS);
  return rawJson(res, 200, text);
}

async function getResult(req, res) {
  const token = decodeURIComponent(req.url.slice('/session/result/'.length));
  if (!TOKEN_RE.test(token) || !known(token)) {
    return json(res, 404, { status: 'UNKNOWN', error: 'unknown or expired session' });
  }

  const upstream = await fetch(`${UPSTREAM}/session/${encodeURIComponent(token)}/result`, {
    headers: AUTHORIZATION ? { Authorization: AUTHORIZATION } : {},
  }).catch(() => null);
  if (!upstream) return json(res, 502, { error: 'Yivi server unreachable' });
  return rawJson(res, upstream.status, await upstream.text());
}

async function readSessionRequest(req, attribute) {
  const raw = await readBody(req, 1 << 20);
  if (!raw.trim()) return JSON.stringify(defaultDisclosure(attribute));

  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('invalid JSON'); }
  if (parsed['@context'] !== 'https://irma.app/ld/request/disclosure/v2') {
    throw new Error('only Yivi disclosure/v2 requests are allowed');
  }
  if (!onlyAttribute(parsed.disclose, attribute)) {
    throw new Error(`only disclosure of ${attribute} is allowed`);
  }
  return raw;
}

function defaultDisclosure(attribute) {
  return {
    '@context': 'https://irma.app/ld/request/disclosure/v2',
    disclose: [[[attribute]]],
  };
}

function onlyAttribute(value, attribute) {
  if (typeof value === 'string') return value === attribute;
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(item => onlyAttribute(item, attribute));
}

function known(token) {
  const expires = sessions.get(token);
  if (!expires) return false;
  if (expires <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function cors(req, res) {
  const origin = req.headers.origin || '*';
  if (CORS_ORIGIN === '*' || origin === CORS_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN === '*' ? origin : CORS_ORIGIN);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, value) {
  return rawJson(res, status, JSON.stringify(value));
}

function rawJson(res, status, body = '') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body || JSON.stringify({ status }));
}

function end(res, status) {
  res.statusCode = status;
  res.end();
}

function parseDuration(input) {
  const match = String(input).match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) return 10 * 60_000;
  const n = Number(match[1]);
  return n * ({ ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[match[2] || 'ms']);
}
