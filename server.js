import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
await mkdir(dataDir, { recursive: true });
const file = path.join(dataDir, 'state.json');
let state;
try { state = JSON.parse(await readFile(file, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  state = { rooms: [
    { id: 'general', name: 'geral', kind: 'group', members: [] },
    { id: 'design', name: 'design', kind: 'group', members: [] },
  ], messages: [] };
}
let signingKey;
try { signingKey = await readFile(path.join(dataDir, 'session.key')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  signingKey = randomBytes(32);
  await writeFile(path.join(dataDir, 'session.key'), signingKey, { mode: 0o600, flag: 'wx' });
}
const clients = new Map(), sharing = new Map();
const sign = value => createHmac('sha256', signingKey).update(value).digest('hex');
const identity = (token, tab) => sign(token + ':' + tab);
let saving = Promise.resolve();
function save() {
  const content = JSON.stringify(state);
  saving = saving.catch(() => {}).then(async () => {
    await writeFile(file + '.tmp', content);
    const { rename } = await import('node:fs/promises');
    await rename(file + '.tmp', file);
  });
  return saving;
}
const visible = (room, id) => room.kind === 'group' || room.members.includes(id);
const users = () => [...clients.values()].map(({ id, name, call, mic, camera }) => ({ id, name, call, mic, camera }));
function send(client, event, data) {
  client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function broadcast(event, data, filter = () => true) {
  for (const client of clients.values()) if (filter(client)) send(client, event, data);
}
function announceSharing(room) {
  broadcast('sharing', { room, owner: sharing.get(room) || null }, c => c.call === room);
}
function leave(client) {
  if (!client.call) return;
  const room = client.call;
  if (sharing.get(room) === client.id) { sharing.delete(room); announceSharing(room); }
  client.call = null; client.mic = false; client.camera = false;
  broadcast('left', { id: client.id });
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 32768) throw Object.assign(new Error('Mensagem muito grande.'), { status: 413 });
  }
  return JSON.parse(text);
}
function session(req) {
  const token = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('workcall='))?.slice(9);
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^[a-f0-9]{64}$/.test(parts[2])) return null;
  const expected = sign(parts[0] + '.' + parts[1]);
  if (!timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected)) || Number(parts[1]) < Date.now()) return null;
  return { token };
}
const iceServers = [{ urls: process.env.STUN_URL || 'stun:stun.l.google.com:19302' }];
if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
  iceServers.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      const allowedHost = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).host : req.headers.host;
      if (origin && new URL(origin).host !== allowedHost) return json(res, 403, { error: 'Origem não autorizada.' });
    }
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok', app: 'WorkCall' });
    if (req.method === 'POST' && url.pathname === '/session') {
      const data = await body(req);
      const name = String(data.name || '').trim().slice(0, 32);
      if (!name) return json(res, 400, { error: 'Informe seu nome.' });
      const previous = session(req);
      const value = randomBytes(24).toString('hex') + '.' + (Date.now() + 86400000);
      const token = previous?.token || value + '.' + sign(value);
      if (!/^[a-zA-Z0-9-]{1,80}$/.test(data.tab || '')) return json(res, 400, { error: 'Sessão inválida.' });
      res.setHeader('Set-Cookie', `workcall=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
      return json(res, 200, { name, id: identity(token, data.tab) });
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      const auth = session(req);
      const tab = url.searchParams.get('tab'), name = url.searchParams.get('name')?.trim().slice(0, 32);
      const id = auth && tab ? identity(auth.token, tab) : null;
      if (!auth) return json(res, 401, { error: 'Entre novamente.' });
      if (!id || !name || !/^[a-zA-Z0-9-]{1,80}$/.test(tab)) return json(res, 400, { error: 'Sessão inválida.' });
      const previous = clients.get(id);
      if (previous && previous.session !== auth.token) return json(res, 409, { error: 'Sessão já utilizada.' });
      if (previous) { leave(previous); previous.res.end(); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      const client = { id, name, res, session: auth.token, call: null, mic: false, camera: false };
      clients.set(id, client);
      send(client, 'ready', { rooms: state.rooms.filter(r => visible(r, id)), messages: state.messages.filter(m => state.rooms.some(r => r.id === m.room && visible(r, id))), users: users(), iceServers });
      broadcast('users', users());
      const timer = setInterval(() => res.write(': heartbeat\n\n'), 20000);
      res.on('close', () => {
        clearInterval(timer);
        if (clients.get(id) === client) { leave(client); clients.delete(id); broadcast('users', users()); }
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api') {
      const auth = session(req), data = await body(req), client = clients.get(data.id);
      if (!auth || !client || client.session !== auth.token) return json(res, 401, { error: 'Sua sessão expirou. Entre novamente.' });
      if (data.action === 'room' || data.action === 'create-meeting') {
        const members = [...new Set([client.id, ...(Array.isArray(data.members) ? data.members.filter(x => typeof x === 'string').slice(0, 50) : [])])];
        const kind = data.action === 'create-meeting' ? 'meeting' : data.kind === 'dm' ? 'dm' : 'group';
        let room = kind === 'dm' && state.rooms.find(r => r.kind === 'dm' && r.members.length === members.length && members.every(id => r.members.includes(id)));
        if (!room) {
          room = { id: randomUUID(), name: String(data.name || (kind === 'meeting' ? 'Reunião da equipe' : 'Novo grupo')).trim().slice(0, 60), kind, members };
          if (kind === 'meeting') {
            do { room.code = randomBytes(5).toString('hex').toUpperCase(); } while (state.rooms.some(r => r.code === room.code));
          }
          state.rooms.push(room); await save();
          broadcast('room', room, c => visible(room, c.id));
        }
        return json(res, 200, room);
      }
      if (data.action === 'find-meeting') {
        const code = String(data.code || '').trim();
        const room = state.rooms.find(r => r.kind === 'meeting' && (r.code === code.toUpperCase() || r.id === code));
        if (!room) return json(res, 404, { error: 'Reunião não encontrada. Confira o código do convite.' });
        if (!room.members.includes(client.id)) { room.members.push(client.id); await save(); }
        send(client, 'room', room);
        return json(res, 200, { room, messages: state.messages.filter(m => m.room === room.id) });
      }
      const room = state.rooms.find(r => r.id === data.room && visible(r, client.id));
      if (!room) return json(res, 403, { error: 'Você não tem acesso a esta conversa.' });
      if (data.action === 'message') {
        const text = String(data.text || '').trim().slice(0, 4000);
        if (!text) return json(res, 400, { error: 'Digite uma mensagem.' });
        const message = { id: randomUUID(), room: room.id, user: client.id, name: client.name, text, time: Date.now() };
        state.messages.push(message); state.messages = state.messages.slice(-5000); await save();
        broadcast('message', message, c => visible(room, c.id));
      } else if (data.action === 'join') {
        leave(client); client.call = room.id; client.mic = !!data.mic; client.camera = !!data.camera;
        broadcast('users', users()); announceSharing(room.id);
        return json(res, 200, { owner: sharing.get(room.id) || null });
      } else if (data.action === 'leave') {
        leave(client); broadcast('users', users());
      } else {
        if (client.call !== room.id) return json(res, 403, { error: 'Entre na chamada primeiro.' });
        if (data.action === 'share-start') {
          const owner = sharing.get(room.id);
          if (owner && owner !== client.id) return json(res, 409, { error: 'Outra pessoa já está compartilhando a tela. Aguarde ela encerrar.' });
          sharing.set(room.id, client.id); announceSharing(room.id);
        } else if (data.action === 'share-stop') {
          if (sharing.get(room.id) === client.id) { sharing.delete(room.id); announceSharing(room.id); }
        } else if (data.action === 'media') {
          client.mic = !!data.mic; client.camera = !!data.camera; broadcast('users', users());
        } else if (data.action === 'signal') {
          const target = clients.get(data.to);
          if (!target || target.call !== room.id) return json(res, 403, { error: 'Participante não está nesta chamada.' });
          send(target, 'signal', { from: client.id, signal: data.signal });
        } else return json(res, 400, { error: 'Ação inválida.' });
      }
      return json(res, 200, {});
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Método não permitido.' });
    const assets = { '/': 'public/index.html', '/app.js': 'public/app.js', '/style.css': 'public/style.css', '/workcall.html': 'workcall.html', '/orbit.html': 'workcall.html' };
    const asset = assets[url.pathname];
    if (!asset) return json(res, 404, { error: 'Página não encontrada.' });
    const content = await readFile(path.join(root, asset));
    res.writeHead(200, { 'Content-Type': (asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html') + '; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    console.error(error.message);
    if (!res.headersSent) json(res, error.status || 400, { error: 'Não foi possível processar a solicitação.' });
    else res.end();
  }
});
const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
server.listen(port, '0.0.0.0', () => console.log('WorkCall running on port ' + server.address().port));
