// Flashlight Hide and Seek - online server.
// Serves the game page and relays live game messages between players in a room.
// No dependencies: uses only Node's built-in modules (WebSocket handled by hand, RFC 6455).
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PAGE = process.env.PAGE || path.join(__dirname, 'public', 'index.html');
const MAX_PLAYERS = 8;

// ---------- web page ----------
function sendPage(res) {
  fs.readFile(PAGE, 'utf8', (err, html) => {
    if (err) { res.writeHead(500); return res.end('Game page missing'); }
    // tell the page it is running on the real server, so online play is offered
    html = html.replace('<head>', '<head><script>window.FHS_SERVER=1</script>');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(html);
  });
}
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); return res.end('ok'); }
  if (req.url === '/' || req.url.startsWith('/?') || req.url === '/index.html') return sendPage(res);
  res.writeHead(404); res.end('Not found');
});

// ---------- minimal WebSocket ----------
function frame(text) {
  const data = Buffer.from(text);
  let head;
  if (data.length < 126) head = Buffer.from([0x81, data.length]);
  else if (data.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(data.length, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(data.length), 2); }
  return Buffer.concat([head, data]);
}
function control(op, payload = Buffer.alloc(0)) { return Buffer.concat([Buffer.from([0x80 | op, payload.length]), payload]); }

class Conn {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.alive = true; this.open = true;
    socket.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    socket.on('close', () => this.closed());
    socket.on('error', () => this.closed());
  }
  parse() {
    while (this.buf.length >= 2) {
      const op = this.buf[0] & 0x0f, masked = this.buf[1] & 0x80;
      let len = this.buf[1] & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) return this.close();              // refuse anything over 1 MB
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;
      let payload = this.buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const m = this.buf.subarray(off, off + 4); payload = Buffer.from(payload.map((b, i) => b ^ m[i & 3])); }
      this.buf = this.buf.subarray(need);
      if (op === 0x1) { try { this.onmessage && this.onmessage(JSON.parse(payload.toString())); } catch (e) { /* ignore bad message */ } }
      else if (op === 0x8) return this.close();
      else if (op === 0x9) this.socket.write(control(0xA, payload));
      else if (op === 0xA) this.alive = true;
    }
  }
  send(obj) { if (this.open) try { this.socket.write(frame(JSON.stringify(obj))); } catch (e) {} }
  close() { if (this.open) { try { this.socket.write(control(0x8)); } catch (e) {} this.socket.end(); } this.closed(); }
  closed() { if (!this.open) return; this.open = false; this.onclose && this.onclose(); }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.url !== '/ws' && !req.url.startsWith('/ws?'))) return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  join(new Conn(socket));
});

// ---------- rooms ----------
// room = { code, host, players: Map(id -> {id, name, conn}), lobby: {...host's settings and roles}, playing }
const rooms = new Map();
let nextId = 1;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/I)
function newCode() {
  let c; do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (rooms.has(c));
  return c;
}
const cleanName = n => String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 16) || 'Player';
function roomState(room) {
  return { t: 'room', code: room.code, host: room.host, playing: room.playing, lobby: room.lobby,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name })) };
}
function broadcast(room, msg, except) { for (const p of room.players.values()) if (p.id !== except) p.conn.send(msg); }

function join(conn) {
  const me = { id: 'p' + (nextId++), name: 'Player', conn, room: null };
  conn.onmessage = msg => {
    if (!msg || typeof msg.t !== 'string') return;
    const room = me.room;
    switch (msg.t) {
      case 'create': {
        if (room) return;
        const code = newCode();
        const r = { code, host: me.id, players: new Map(), lobby: {}, playing: false };
        rooms.set(code, r); me.name = cleanName(msg.name); me.room = r; r.players.set(me.id, me);
        conn.send({ t: 'welcome', id: me.id, code });
        broadcast(r, roomState(r));
        break;
      }
      case 'join': {
        if (room) return;
        const r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) return conn.send({ t: 'error', msg: 'No game with that code. Check the code and try again.' });
        if (r.players.size >= MAX_PLAYERS) return conn.send({ t: 'error', msg: 'That game is full (' + MAX_PLAYERS + ' players max).' });
        if (r.playing) return conn.send({ t: 'error', msg: 'That game has already started. Ask the host to go back to the lobby, then join.' });
        me.name = cleanName(msg.name); me.room = r; r.players.set(me.id, me);
        conn.send({ t: 'welcome', id: me.id, code: r.code });
        broadcast(r, roomState(r));
        break;
      }
      case 'lobby': // host updates roles/settings shown to everyone
        if (room && room.host === me.id && msg.lobby && typeof msg.lobby === 'object') { room.lobby = msg.lobby; broadcast(room, roomState(room)); }
        break;
      case 'start':
        if (room && room.host === me.id) { room.playing = true; broadcast(room, { ...msg, from: me.id }); broadcast(room, roomState(room)); }
        break;
      case 'toLobby':
        if (room && room.host === me.id) { room.playing = false; broadcast(room, { t: 'toLobby', from: me.id }); broadcast(room, roomState(room)); }
        break;
      case 'me': case 'snap': case 'ev':
        // live game traffic: pass it on to everyone else in the room
        if (room) broadcast(room, { ...msg, from: me.id }, me.id);
        break;
      case 'ping': conn.send({ t: 'pong', at: msg.at }); break;
    }
  };
  conn.onclose = () => {
    const r = me.room; if (!r) return;
    r.players.delete(me.id); me.room = null;
    if (!r.players.size) { rooms.delete(r.code); return; }
    if (r.host === me.id) {
      // hand the room to the next player; a game in progress can't continue without its host
      r.host = r.players.keys().next().value;
      if (r.playing) { r.playing = false; broadcast(r, { t: 'toLobby', reason: 'The host left, so the game went back to the lobby.' }); }
    }
    broadcast(r, { t: 'left', id: me.id, name: me.name });
    broadcast(r, roomState(r));
  };
}

// keep connections alive (hosting platforms close quiet connections) and drop dead ones
setInterval(() => {
  for (const r of rooms.values()) for (const p of r.players.values()) {
    if (!p.conn.alive) { p.conn.close(); continue; }
    p.conn.alive = false; try { p.conn.socket.write(control(0x9)); } catch (e) {}
  }
}, 25000);

server.listen(PORT, () => console.log('Flashlight Hide and Seek running on port ' + PORT));
