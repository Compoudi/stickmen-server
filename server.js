// === 🧠 Serveur Node.js avec moteur physique et rooms ===
import { WebSocketServer } from "ws";
import Matter from "matter-js";

const wss = new WebSocketServer({ port: 3000 });
console.log("✅ Serveur Stickmen avec physique lancé sur ws://localhost:3000");

// --- Gestion des rooms ---
let rooms = {}; // { roomId: { players: [], engine, world, closed } }

function createRoom() {
  const id = "room-" + Math.random().toString(36).substr(2, 6);
  const engine = Matter.Engine.create();
  const world = engine.world;
  world.gravity.y = 1; // gravité
  rooms[id] = { id, players: [], engine, world, closed: false };
  return id;
}

function findAvailableRoom() {
  for (const id in rooms) {
    const room = rooms[id];
    if (!room.closed && room.players.length < 2) return id;
  }
  return createRoom();
}

// --- Création du stickman ---
function createStickman(x, y, color) {
  const size = 10;
  return {
    color,
    hp: 100,
    parts: {
      head: { x, y },
      chest: { x, y + 30 },
      pelvis: { x, y + 60 },
      armL: { x: x - 20, y: y + 30 },
      armR: { x: x + 20, y: y + 30 },
      handL: { x: x - 40, y: y + 30 },
      handR: { x: x + 40, y: y + 30 },
      legL: { x: x - 10, y: y + 80 },
      legR: { x: x + 10, y: y + 80 },
      footL: { x: x - 20, y: y + 100 },
      footR: { x: x + 20, y: y + 100 },
    },
    velocity: { x: 0, y: 0 },
  };
}

// --- Simulation simple ---
function updatePhysics(room) {
  const { players } = room;
  for (const p of players) {
    if (!p.stickman) continue;
    const s = p.stickman;

    // Gravité et mouvement basique
    s.velocity.y += 0.5;
    s.parts.head.y += s.velocity.y;
    s.parts.chest.y += s.velocity.y;
    s.parts.pelvis.y += s.velocity.y;

    // Sol
    if (s.parts.pelvis.y > 500) {
      s.parts.pelvis.y = 500;
      s.velocity.y = 0;
    }

    // Légère oscillation du corps (pour vie visuelle)
    s.parts.head.x += Math.sin(Date.now() / 500) * 0.5;
  }
}

// --- Envoi d'état à tous les joueurs ---
function broadcastState(room) {
  const payload = JSON.stringify({
    type: "state",
    players: Object.fromEntries(
      room.players.map((p) => [p.id, p.stickman])
    ),
  });
  room.players.forEach((p) => {
    if (p.ws.readyState === 1) p.ws.send(payload);
  });
}

// --- Simulation par frame ---
setInterval(() => {
  for (const id in rooms) {
    const room = rooms[id];
    if (room.closed) continue;
    updatePhysics(room);
    broadcastState(room);
  }
}, 60);

// --- Connexion WebSocket ---
wss.on("connection", (ws) => {
  const roomId = findAvailableRoom();
  const room = rooms[roomId];
  const id = Math.random().toString(36).substr(2, 9);
  const color = room.players.length === 0 ? "black" : "red";

  const player = { id, ws, stickman: createStickman(400 + room.players.length * 100, 300, color) };
  room.players.push(player);
  ws.roomId = roomId;

  console.log(`👤 Joueur ${id} rejoint ${roomId} (${color})`);

  // Envoi d’initialisation
  ws.send(JSON.stringify({ type: "init", id, color }));

  // Messages entrants
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    const room = rooms[ws.roomId];
    if (!room || room.closed) return;

    if (data.type === "pointerMove") {
      const p = room.players.find((pl) => pl.ws === ws);
      if (p && p.stickman) {
        // Influence légère du pointeur sur la tête
        p.stickman.parts.head.x += (data.pointer.x - p.stickman.parts.head.x) * 0.1;
        p.stickman.parts.head.y += (data.pointer.y - p.stickman.parts.head.y) * 0.1;
      }
    }

    if (data.type === "exitGame") {
      console.log(`🚪 Fermeture de ${room.id}`);
      room.closed = true;
      room.players.forEach((pl) => {
        if (pl.ws.readyState === 1)
          pl.ws.send(JSON.stringify({ type: "goToMenu" }));
      });
    }
  });

  ws.on("close", () => {
    cons
