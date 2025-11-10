// === 🧠 Serveur Stickmen Physique — version corrigée ===
import { WebSocketServer } from "ws";
import Matter from "matter-js";

const wss = new WebSocketServer({ port: 3000 });
console.log("✅ Serveur Stickmen lancé sur ws://localhost:3000");

let rooms = {}; // Dictionnaire des rooms actives

// === Création d’une room ===
function createRoom() {
  const id = "room-" + Math.random().toString(36).substr(2, 6);
  const engine = Matter.Engine.create();
  const world = engine.world;
  world.gravity.y = 1.2;

  const ground = Matter.Bodies.rectangle(400, 580, 800, 40, {
    isStatic: true,
    label: "ground",
  });
  Matter.World.add(world, ground);

  const room = { id, engine, world, players: [], closed: false };
  rooms[id] = room;

  console.log(`🆕 Room créée: ${id}`);
  return id;
}

// === Création du stickman ===
function createStickman(x, y, color, world, ownerId) {
  const add = (b) => { b.plugin = { ownerId }; return b; };
  const head = add(Matter.Bodies.circle(x, y, 10, { restitution: 0.4, label: "head" }));
  const chest = add(Matter.Bodies.rectangle(x, y + 30, 15, 25, { label: "chest" }));
  const pelvis = add(Matter.Bodies.rectangle(x, y + 60, 15, 20, { label: "pelvis" }));
  const armL = add(Matter.Bodies.rectangle(x - 20, y + 30, 20, 5, { label: "armL" }));
  const handL = add(Matter.Bodies.circle(x - 40, y + 30, 4, { label: "handL" }));
  const armR = add(Matter.Bodies.rectangle(x + 20, y + 30, 20, 5, { label: "armR" }));
  const handR = add(Matter.Bodies.circle(x + 40, y + 30, 4, { label: "handR" }));
  const legL = add(Matter.Bodies.rectangle(x - 10, y + 80, 5, 25, { label: "legL" }));
  const footL = add(Matter.Bodies.circle(x - 10, y + 100, 5, { label: "footL" }));
  const legR = add(Matter.Bodies.rectangle(x + 10, y + 80, 5, 25, { label: "legR" }));
  const footR = add(Matter.Bodies.circle(x + 10, y + 100, 5, { label: "footR" }));

  const parts = [head, chest, pelvis, armL, handL, armR, handR, legL, legR, footL, footR];
  Matter.World.add(world, parts);
  const c = (a, b, len = 25) => Matter.Constraint.create({ bodyA: a, bodyB: b, length: len, stiffness: 0.5 });
  Matter.World.add(world, [
    c(head, chest, 30), c(chest, pelvis, 30),
    c(chest, armL, 25), c(armL, handL, 15),
    c(chest, armR, 25), c(armR, handR, 15),
    c(pelvis, legL, 25), c(legL, footL, 10),
    c(pelvis, legR, 25), c(legR, footR, 10)
  ]);
  return { color, hp: 100, bodies: { head, chest, pelvis, armL, handL, armR, handR, legL, legR, footL, footR } };
}

function serializeStickman(s) {
  const b = s.bodies;
  return {
    color: s.color,
    hp: s.hp,
    parts: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.position]))
  };
}

// === Simulation physique ===
setInterval(() => {
  for (const id in rooms) {
    const room = rooms[id];
    if (!room || room.closed) continue;
    Matter.Engine.update(room.engine, 1000 / 60);

    for (const p of room.players) {
      const head = p.stickman.bodies.head;
      const dx = p.pointer.x - head.position.x;
      const dy = p.pointer.y - head.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const f = Math.min(d * 0.000002, 0.00007);
      Matter.Body.applyForce(head, head.position, { x: dx * f, y: dy * f });
    }

    const state = {};
    for (const p of room.players) state[p.id] = serializeStickman(p.stickman);
    const payload = JSON.stringify({ type: "state", players: state });
    for (const p of room.players)
      if (p.ws.readyState === 1) p.ws.send(payload);
  }
}, 1000 / 30);

// === Chaque connexion crée UNE NOUVELLE ROOM ===
wss.on("connection", (ws) => {
  // 💥 ne pas réutiliser de room
  const roomId = createRoom();
  const room = rooms[roomId];
  const id = Math.random().toString(36).substr(2, 9);
  const color = "black"; // toujours black (premier joueur de sa room)

  const stickman = createStickman(400, 100, color, room.world, id);
  const player = { id, ws, stickman, pointer: { x: 400, y: 300 } };
  room.players.push(player);
  ws.roomId = roomId;

  console.log(`👤 Joueur ${id} connecté (${color}) dans ${roomId}`);
  ws.send(JSON.stringify({ type: "init", id, color }));

  // === Réception messages client ===
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    const player = room.players.find(p => p.ws === ws);
    if (!player) return;

    if (data.type === "pointerMove") player.pointer = data.pointer;

    if (data.type === "exitGame") {
      console.log(`🚪 ${player.id} quitte ${roomId}`);
      closeRoom(roomId);
    }
  });

  ws.on("close", () => {
    console.log(`🔌 Fermeture WS pour ${roomId}`);
    closeRoom(roomId);
  });
});

// === Fermer et supprimer proprement une room ===
function closeRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.closed = true;

  for (const pl of room.players) {
    if (pl.ws.readyState === 1)
      pl.ws.send(JSON.stringify({ type: "goToMenu" }));
    try { pl.ws.close(); } catch {}
  }

  delete rooms[roomId];
  console.log(`❌ Room ${roomId} supprimée définitivement.`);
}

