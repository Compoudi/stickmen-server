// === 🧠 Serveur Stickmen avec physique Matter.js complète ===
import { WebSocketServer } from "ws";
import Matter from "matter-js";
import express from "express";
import http from "http";

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;
const wss = new WebSocketServer({ port: 3000 });
console.log("✅ Serveur Stickmen Physique lancé sur ws://localhost:3000");

const wss = new WebSocketServer({ server });
server.listen(port, () => console.log(`✅ Serveur Stickmen lancé sur port ${port}`));

app.get("/", (req, res) => res.send("✅ Serveur Stickmen Physique Multijoueur en ligne"));

const rooms = {};
// === Gestion des rooms ===
let rooms = {}; // { roomId: { engine, world, players, closed } }

function createRoom() {
  const id = "room-" + Math.random().toString(36).substr(2, 6);
  const engine = Matter.Engine.create();
  const world = engine.world;
  world.gravity.y = 1.1;
  const ground = Matter.Bodies.rectangle(400, 580, 800, 40, { isStatic: true });

  world.gravity.y = 1.2;

  // Sol
  const ground = Matter.Bodies.rectangle(400, 580, 800, 40, {
    isStatic: true,
    label: "ground",
  });
  Matter.World.add(world, ground);

  rooms[id] = { id, engine, world, players: [], closed: false };
  return id;
}

function findAvailableRoom() {
  for (const id in rooms) {
    const r = rooms[id];
    if (!r.closed && r.players.length < 2) return id;
    const room = rooms[id];
    if (!room.closed && room.players.length < 2) return id;
  }
  return createRoom();
}

// === Création du stickman physique ===
function createStickman(x, y, color, world) {
  const group = Matter.Body.nextGroup(true);
  const opt = { collisionFilter: { group }, restitution: 0.3, friction: 0.8 };
  const b = {
    head: Matter.Bodies.circle(x, y, 15, opt),
    chest: Matter.Bodies.rectangle(x, y + 40, 25, 35, opt),
    pelvis: Matter.Bodies.rectangle(x, y + 90, 25, 25, opt),
    armL: Matter.Bodies.rectangle(x - 35, y + 40, 35, 8, opt),
    armR: Matter.Bodies.rectangle(x + 35, y + 40, 35, 8, opt),
    legL: Matter.Bodies.rectangle(x - 10, y + 140, 10, 35, opt),
    legR: Matter.Bodies.rectangle(x + 10, y + 140, 10, 35, opt),
  };
  Matter.World.add(world, Object.values(b));
  const c = [
    Matter.Constraint.create({ bodyA: b.head, bodyB: b.chest, length: 30, stiffness: 0.7 }),
    Matter.Constraint.create({ bodyA: b.chest, bodyB: b.pelvis, length: 50, stiffness: 0.7 }),
    Matter.Constraint.create({ bodyA: b.chest, bodyB: b.armL, length: 30, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: b.chest, bodyB: b.armR, length: 30, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: b.pelvis, bodyB: b.legL, length: 40, stiffness: 0.6 }),
    Matter.Constraint.create({ bodyA: b.pelvis, bodyB: b.legR, length: 40, stiffness: 0.6 }),
  const head = Matter.Bodies.circle(x, y, 10, { density: 0.001, restitution: 0.4 });
  const chest = Matter.Bodies.rectangle(x, y + 30, 15, 25, { density: 0.002 });
  const pelvis = Matter.Bodies.rectangle(x, y + 60, 15, 20, { density: 0.002 });
  const armL = Matter.Bodies.rectangle(x - 20, y + 30, 20, 5, { density: 0.001 });
  const armR = Matter.Bodies.rectangle(x + 20, y + 30, 20, 5, { density: 0.001 });
  const legL = Matter.Bodies.rectangle(x - 10, y + 80, 5, 25, { density: 0.002 });
  const legR = Matter.Bodies.rectangle(x + 10, y + 80, 5, 25, { density: 0.002 });

  const parts = [head, chest, pelvis, armL, armR, legL, legR];
  Matter.World.add(world, parts);

  // Contraintes (liaisons)
  const constraints = [
    Matter.Constraint.create({ bodyA: head, bodyB: chest, length: 30, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: chest, bodyB: pelvis, length: 30, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: chest, bodyB: armL, length: 25, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: chest, bodyB: armR, length: 25, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: pelvis, bodyB: legL, length: 25, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: pelvis, bodyB: legR, length: 25, stiffness: 0.5 }),
  ];
  Matter.World.add(world, c);
  return { color, hp: 100, bodies: b };

  Matter.World.add(world, constraints);

  return {
    color,
    hp: 100,
    bodies: { head, chest, pelvis, armL, armR, legL, legR },
  };
}

function serialize(s) {
// === Extraction des positions physiques ===
function serializeStickman(s) {
  const b = s.bodies;
  return {
    color: s.color,
@@ -72,28 +80,40 @@ function serialize(s) {
      armR: b.armR.position,
      legL: b.legL.position,
      legR: b.legR.position,
      footL: { x: b.legL.position.x, y: b.legL.position.y + 15 },
      footR: { x: b.legR.position.x, y: b.legR.position.y + 15 },
    },
  };
}

// === Simulation ===
setInterval(() => {
  for (const id in rooms) {
    const r = rooms[id];
    if (r.closed) continue;
    Matter.Engine.update(r.engine, 1000 / 60);
    const room = rooms[id];
    if (room.closed) continue;
    Matter.Engine.update(room.engine, 1000 / 60);

    // Envoi de l'état
    const state = {};
    for (const p of r.players) state[p.id] = serialize(p.stickman);
    for (const p of room.players) {
      if (!p.stickman) continue;
      state[p.id] = serializeStickman(p.stickman);
    }

    const payload = JSON.stringify({ type: "state", players: state });
    for (const p of r.players)
    for (const p of room.players) {
      if (p.ws.readyState === 1) p.ws.send(payload);
    }
  }
}, 1000 / 30);

// === WebSocket ===
wss.on("connection", (ws) => {
  const roomId = findAvailableRoom();
  const room = rooms[roomId];
  const id = Math.random().toString(36).substr(2, 9);
  const color = room.players.length === 0 ? "black" : "red";

  const stickman = createStickman(300 + room.players.length * 200, 100, color, room.world);
  const player = { id, ws, stickman };
  room.players.push(player);
@@ -102,28 +122,40 @@ wss.on("connection", (ws) => {
  console.log(`👤 Joueur ${id} connecté dans ${roomId} (${color})`);
  ws.send(JSON.stringify({ type: "init", id, color }));

  // --- Réception des messages ---
  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }
    const r = rooms[ws.roomId];
    if (!r || r.closed) return;
    const p = r.players.find((pl) => pl.ws === ws);
    if (!p) return;

    if (data.type === "pointerMove") {
      const b = p.stickman.bodies;
      const dx = data.pointer.x - b.head.position.x;
      const dy = data.pointer.y - b.head.position.y;
      const f = 0.001;
      Matter.Body.applyForce(b.head, b.head.position, { x: dx * f, y: dy * f });
    const data = JSON.parse(msg);
    const room = rooms[ws.roomId];
    if (!room || room.closed) return;
    const player = room.players.find((p) => p.ws === ws);
    if (!player) return;

    if (data.type === "pointerMove" && player.stickman) {
      // Attraction légère vers le pointeur
      const head = player.stickman.bodies.head;
      const dx = data.pointer.x - head.position.x;
      const dy = data.pointer.y - head.position.y;
      const force = { x: dx * 0.00005, y: dy * 0.00005 };
      Matter.Body.applyForce(head, head.position, force);
    }

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
    const r = rooms[ws.roomId];
    if (!r) return;
    r.players = r.players.filter((pl) => pl.ws !== ws);
    if (r.players.length === 0) r.closed = true;
    const room = rooms[ws.roomId];
    if (!room) return;
    room.players = room.players.filter((p) => p.ws !== ws);
    console.log(`❌ Joueur ${id} déconnecté de ${roomId}`);
    if (room.players.length === 0) room.closed = true;
  });
});


