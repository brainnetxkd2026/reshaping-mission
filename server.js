/**
 * 重塑使命 · 联机服务器（零依赖 Node.js）
 *
 * 启动：  node server.js            （默认端口 8123）
 * 部署：  Render Web Service，启动命令 node server.js，端口用环境变量 PORT
 *
 * API（全部 JSON）：
 *   POST /join    { name }              -> { id, players }
 *   POST /sync    { id, x, y, aim }     -> { ok }           （位置/朝向上报，66ms 心跳）
 *   POST /hit     { attacker, target, dmg } -> { ok }       （服务器裁决伤害/击杀/加分）
 *   POST /respawn { id }                -> { ok }           （复活回战场）
 *   POST /leave   { id }                -> { ok }
 *   GET  /state                         -> { players, ts }  （全量状态拉取）
 *
 * 状态模型：位置/朝向为客户端权威；血量/击杀/分数为服务器权威。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8123;
const DIR = __dirname;
const MAX_HP = 100;
const HEARTBEAT_TIMEOUT = 6000; // 超过 6s 无心跳视为掉线

/** id -> { id, name, x, y, aim, hp, maxHp, score, kills, alive, lastSeen } */
const players = new Map();

function uid() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 30; i++) {
    let s = '';
    for (let j = 0; j < 4; j++) s += chars[Math.floor(Math.random() * chars.length)];
    if (!players.has(s)) return s;
  }
  return 'P' + Date.now().toString(36).toUpperCase();
}

function publicState() {
  const arr = [];
  players.forEach((p) => {
    arr.push({
      id: p.id, name: p.name, x: p.x, y: p.y, aim: p.aim,
      hp: Math.max(0, Math.round(p.hp)), maxHp: p.maxHp,
      score: p.score, kills: p.kills, alive: p.alive, ts: p.lastSeen
    });
  });
  return arr;
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(DIR, path.normalize(urlPath));
  if (!file.startsWith(DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(file).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); res.end(); return; }

  const route = (req.url || '/').split('?')[0];

  if (req.method === 'GET' && route === '/state') {
    sendJSON(res, 200, { players: publicState(), ts: Date.now() });
    return;
  }
  if (route.startsWith('/') && req.method === 'GET') { serveStatic(req, res); return; }

  if (req.method !== 'POST') { sendJSON(res, 405, { ok: false, err: 'method' }); return; }

  let body;
  try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { ok: false, err: 'bad-json' }); return; }

  if (route === '/join') {
    const rawName = String(body.name || '战士').trim().slice(0, 12) || '战士';
    const id = uid();
    players.set(id, {
      id, name: rawName, x: 200 + Math.random() * 800, y: 200 + Math.random() * 500,
      aim: 0, hp: MAX_HP, maxHp: MAX_HP, score: 0, kills: 0, alive: true, lastSeen: Date.now()
    });
    sendJSON(res, 200, { id, players: publicState() });
    return;
  }

  if (route === '/sync') {
    const p = players.get(String(body.id || ''));
    if (!p) { sendJSON(res, 404, { ok: false, err: 'no-player' }); return; }
    if (typeof body.x === 'number' && isFinite(body.x)) p.x = body.x;
    if (typeof body.y === 'number' && isFinite(body.y)) p.y = body.y;
    if (typeof body.aim === 'number' && isFinite(body.aim)) p.aim = body.aim;
    p.lastSeen = Date.now();
    sendJSON(res, 200, { ok: true });
    return;
  }

  if (route === '/hit') {
    const att = players.get(String(body.attacker || ''));
    const tgt = players.get(String(body.target || ''));
    if (!att || !tgt) { sendJSON(res, 404, { ok: false, err: 'no-player' }); return; }
    if (!tgt.alive) { sendJSON(res, 200, { ok: true, ignore: true }); return; }
    const dmg = Math.max(1, Math.min(100, Math.round(Number(body.dmg) || 10)));
    tgt.hp -= dmg;
    if (tgt.hp <= 0) {
      tgt.hp = 0;
      tgt.alive = false;
      att.score += 10;
      att.kills += 1;
    }
    sendJSON(res, 200, { ok: true, targetHp: Math.max(0, Math.round(tgt.hp)), targetAlive: tgt.alive });
    return;
  }

  if (route === '/respawn') {
    const p = players.get(String(body.id || ''));
    if (!p) { sendJSON(res, 404, { ok: false, err: 'no-player' }); return; }
    p.hp = MAX_HP; p.alive = true;
    p.x = 200 + Math.random() * 800; p.y = 200 + Math.random() * 500;
    sendJSON(res, 200, { ok: true });
    return;
  }

  if (route === '/leave') {
    players.delete(String(body.id || ''));
    sendJSON(res, 200, { ok: true });
    return;
  }

  sendJSON(res, 404, { ok: false, err: 'no-route' });
});

// 掉线清理
setInterval(() => {
  const now = Date.now();
  players.forEach((p, id) => {
    if (now - p.lastSeen > HEARTBEAT_TIMEOUT) players.delete(id);
  });
}, 2000);

server.listen(PORT, () => {
  console.log('重塑使命 联机服务器已启动');
  console.log('  本机访问： http://localhost:' + PORT);
  // 打印局域网 IP，方便同一网络下其他人加入
  const os = require('os');
  const ifs = os.networkInterfaces();
  Object.keys(ifs).forEach((name) => {
    ifs[name].forEach((ifc) => {
      if (ifc.family === 'IPv4' && !ifc.internal) console.log('  局域网访问： http://' + ifc.address + ':' + PORT);
    });
  });
  console.log('  公网访问： Render 部署后使用 https://你的服务.onrender.com');
});
