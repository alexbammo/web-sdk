// HTTP static host for the built client + WebSocket game server.
// Usage: npm run build && npm start   (PORT env var, default 8080)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const PORT = +process.env.PORT || 8080;
const TYPES = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.png': 'image/png',
	'.glb': 'model/gltf-binary',
	'.json': 'application/json',
	'.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://x');
	let file = path.join(root, decodeURIComponent(url.pathname));
	if (!file.startsWith(root)) return res.writeHead(403).end();
	if (url.pathname === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
	fs.readFile(file, (err, buf) => {
		if (err) return res.writeHead(404).end('Build the client first: npm run build');
		res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
		res.end(buf);
	});
});

const rooms = new Map();
function getRoom(code) {
	code = (code || 'MAIN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'MAIN';
	let room = rooms.get(code);
	if (!room) {
		room = new Room(code, (msg) => {
			const s = JSON.stringify(msg);
			for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(s);
		});
		room.timer = setInterval(() => room.tick(), 50);
		rooms.set(code, room);
	}
	return room;
}

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
	const url = new URL(req.url, 'http://x');
	const room = getRoom(url.searchParams.get('room'));
	let player = null;
	ws.on('message', (data) => {
		let m;
		try {
			m = JSON.parse(data);
		} catch {
			return;
		}
		if (m.t === 'hello' && !player) {
			player = room.join(ws, m.name, m.bot);
			if (!player) {
				ws.send(JSON.stringify({ t: 'full' }));
				return ws.close();
			}
			ws.send(JSON.stringify({ t: 'welcome', id: player.id, room: room.code, slot: player.slot }));
			return;
		}
		if (player) room.onMessage(player, m);
	});
	ws.on('close', () => {
		if (player) room.leave(player);
		if (!room.players.size) {
			clearInterval(room.timer);
			rooms.delete(room.code);
		}
	});
});

server.listen(PORT, () => console.log(`Closing Time server on http://localhost:${PORT}`));
