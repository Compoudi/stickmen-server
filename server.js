// server.js
import { WebSocketServer } from "ws";
import Matter from "matter-js";
import express from "express";
import http from "http";

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

const wss = new WebSocketServer({ server });
server.listen(port, () => console.log(`✅ Serveur Stickmen lancé sur port ${port}`));

app.get("/", (req, res) => res.send("✅ Serveur Stickmen Physique Multijoueur en ligne"));

const rooms = {};

function createRoom() {
  const id = "room-" + Math.random().toString(36).substr(2, 6);
  const engine = Matter.Engine.create();
  const world = engine.world;
  world.gravity.y = 1.1;
  const ground = Matter.Bodies.rectangle(400, 580, 800, 40, { isStatic: true });
  Matter.World.add(world, ground);
  rooms[id] = { id, engine, world, players: [], closed: false };
  return id;
}

function findAvailableRoom() {
  for (const id in rooms) {
    const r = rooms[id];
    if (!r.closed && r.players.length < 2) return id;
  }
  return createRoom();
}

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
  ];
  Matter.World.add(world, c);
  return { color, hp: 100, bodies: b };
}

function serialize(s) {
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

setInterval(() => {
  for (const id in rooms) {
    const r = rooms[id];
    if (r.closed) continue;
    Matter.Engine.update(r.engine, 1000 / 60);
    const state = {};
    for (const p of r.players) state[p.id] = serialize(p.stickman);
    const payload = JSON.stringify({ type: "state", players: state });
    for (const p of r.players)
      if (p.ws.readyState === 1) p.ws.send(payload);
  }
}, 1000 / 30);

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
    }
  });

  ws.on("close", () => {
    const r = rooms[ws.roomId];
    if (!r) return;
    r.players = r.players.filter((pl) => pl.ws !== ws);
    if (r.players.length === 0) r.closed = true;
  });
});

