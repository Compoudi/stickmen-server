// === 🧠 Serveur Stickmen Physique Multijoueur (Render-compatible) ===
import { WebSocketServer } from "ws";
import Matter from "matter-js";
import express from "express";
import http from "http";

// --- Création serveur HTTP/WS ---
const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;
const wss = new WebSocketServer({ server });
server.listen(port, () => console.log(`✅ Serveur Stickmen lancé sur port ${port}`));

app.get("/", (req, res) => res.send("✅ Serveur Stickmen Physique Multijoueur en ligne"));

// === Gestion des rooms ===
const rooms = {}; // { roomId: { engine, world, players: [], closed: false } }

function createRoom() {
  const id = "room-" + Math.random().toString(36).substr(2, 6);
  const engine = Matter.Engine.create();
  const world = engine.world;
  world.gravity.y = 1.1;

  // Sol
  const ground = Matter.Bodies.rectangle(400, 580, 800, 40, {
    isStatic: true,
    label: "ground"
  });
  Matter.World.add(world, ground);

  rooms[id] = { id, engine, world, players: [], closed: false };
  return id;
}

function findAvailableRoom() {
  for (const id in rooms) {
    const room = rooms[id];
    if (!room.closed && room.players.length < 2) return id;
  }
  return createRoom();
}

// === Création Stickman articulé ===
function createStickman(x, y, color, world) {
  const group = Matter.Body.nextGroup(true);
  const options = { collisionFilter: { group }, restitution: 0.3, friction: 0.8 };

  const b = {
    head: Matter.Bodies.circle(x, y, 15, options),
    chest: Matter.Bodies.rectangle(x, y + 40, 25, 35, options),
    pelvis: Matter.Bodies.rectangle(x, y + 90, 25, 25, options),
    armL: Matter.Bodies.rectangle(x - 35, y + 40, 35, 8, options),
    armR: Matter.Bodies.rectangle(x + 35, y + 40, 35, 8, options),
    legL: Matter.Bodies.rectangle(x - 10, y + 140, 10, 35, options),
    legR: Matter.Bodies.rectangle(x + 10, y + 140, 10, 35, options),
  };

  const parts = Object.values(b);
  Matter.World.add(world, parts);

  // Liaisons (articulations souples)
  const constraints = [
    Matter.Constraint.create({ bodyA: b.head, bodyB: b.chest, length: 30, stiffness: 0.7 }),
    Matter.Constraint.create({ bodyA: b.chest, bodyB: b.pelvis, length: 50, stiffness: 0.7 }),
    Matter.Constraint.create({ bodyA: b.chest, bodyB: b.armL, length: 30, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: b.chest, bodyB: b.armR, length: 30, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: b.pelvis, bodyB: b.legL, length: 40, stiffness: 0.6 }),
    Matter.Constraint.create({ bodyA: b.pelvis, bodyB: b.legR, length: 40, stiffness: 0.6 }),
  ];

  Matter.World.add(world, constraints);

  return { color, hp: 100, bodies: b };
}

// === Extraction des positions pour envoi réseau ===
function serializeStickman(s) {
  const b = s.bodies;
  return {
    color: s.color,
    hp: s.hp,
    parts: {
      head: b.head.position,
      chest: b.chest.position,
      pelvis: b.pelvis.position,
      armL: b.armL.position,
      armR: b.armR.position,
      legL: b.legL.position,
      legR: b.legR.position,
    },
  };
}

// === Simulation physique 60Hz ===
setInterval(() => {
  for (const id in rooms) {
    const room = rooms[id];
    if (room.closed) continue;

    Matter.Engine.update(room.engine, 1000 / 60);

    const state = {};
    for (const p of room.players) {
      if (!p.stickman) continue;
      state[p.id] = serializeStickman(p.stickman);
    }

    const payload = JSON.stringify({ type: "state", players: state });
    for (const p of room.players)
      if (p.ws.readyState === 1) p.ws.send(payload);
  }
}, 1000 / 30);

// === Gestion WebSocket ===
wss.on("connection", (ws) => {
  const roomId = findAvailableRoom();
  const room = rooms[roomId];
  const id = Math.random().toString(36).substr(2, 9);
  const color = room.players.length === 0 ? "black" : "red";

  const stickman = createStickman(300 + room.players.length * 200, 100, color, room.world);
  const player = { id, ws, stickman };
  room.players.push(player);
  ws.roomId = roomId;

  console.log(`👤 Joueur ${id} connecté dans ${roomId} (${color})`);
  ws.send(JSON.stringify({ type: "init", id, color }));

  // === Réception des commandes client ===
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }
    const room = rooms[ws.roomId];
    if (!room || room.closed) return;

    const player = room.players.find((p) => p.ws === ws);
    if (!player) return;

    // Déplacement via curseur → attraction de la tête
    if (data.type === "pointerMove" && player.stickman) {
      const b = player.stickman.bodies;
      const dx = data.pointer.x - b.head.position.x;
      const dy = data.pointer.y - b.head.position.y;
      const FOLLOW_FORCE = 0.001;
      const fx = dx * FOLLOW_FORCE;
      const fy = dy * FOLLOW_FORCE;
      Matter.Body.applyForce(b.head, b.head.position, { x: fx, y: fy });
    }

    // Quitter le match
    if (data.type === "exitGame") {
      console.log(`🚪 Fermeture de ${room.id}`);
      room.closed = true;
      for (const pl of room.players) {
        if (pl.ws.readyState === 1)
          pl.ws.send(JSON.stringify({ type: "goToMenu" }));
      }
    }
  });

  ws.on("close", () => {
    const room = rooms[ws.roomId];
    if (!room) return;
    room.players = room.players.filter((p) => p.ws !== ws);
    console.log(`❌ Joueur ${id} déconnecté de ${roomId}`);
    if (room.players.length === 0) room.closed = true;
  });
});

