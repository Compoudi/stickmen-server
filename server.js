// === 🧠 Serveur Stickmen multijoueur avec physique stable ===
import { WebSocketServer } from "ws";
import Matter from "matter-js";

const wss = new WebSocketServer({ port: 3000 });
console.log("✅ Serveur Stickmen Physique lancé sur ws://localhost:3000");

let rooms = {}; // { roomId: { engine, world, players, closed } }

function createRoom() {
  const id = "room-" + Math.random().toString(36).substr(2, 6);
  const engine = Matter.Engine.create();
  const world = engine.world;
  world.gravity.y = 0.5; // gravité douce et réaliste
  engine.enableSleeping = false; // 🚫 désactive totalement le mode sommeil

  // Sol
  const ground = Matter.Bodies.rectangle(400, 580, 800, 40, {
    isStatic: true,
    label: "ground",
  });
  Matter.World.add(world, ground);

  rooms[id] = { id, engine, world, players: [], closed: false };
  console.log(`🏗️ Nouvelle room créée : ${id}`);
  return id;
}

function findAvailableRoom() {
  for (const id in rooms) {
    const room = rooms[id];
    if (!room.closed && room.players.length < 2) return id;
  }
  return createRoom();
}

// === Création du stickman physique ===
function createStickman(x, y, color, world) {
  const head = Matter.Bodies.circle(x, y, 10, { restitution: 0.4, friction: 0.2 });
  const chest = Matter.Bodies.rectangle(x, y + 30, 15, 25, { restitution: 0.3, friction: 0.3 });
  const pelvis = Matter.Bodies.rectangle(x, y + 60, 15, 20, { restitution: 0.3, friction: 0.3 });
  const armL = Matter.Bodies.rectangle(x - 20, y + 30, 20, 5, { restitution: 0.3, friction: 0.3 });
  const armR = Matter.Bodies.rectangle(x + 20, y + 30, 20, 5, { restitution: 0.3, friction: 0.3 });
  const legL = Matter.Bodies.rectangle(x - 10, y + 80, 5, 25, { restitution: 0.3, friction: 0.3 });
  const legR = Matter.Bodies.rectangle(x + 10, y + 80, 5, 25, { restitution: 0.3, friction: 0.3 });

  const bodies = [head, chest, pelvis, armL, armR, legL, legR];
  Matter.World.add(world, bodies);

  // 🧠 Solution #2 : empêcher le "sleep" et le mode statique
  for (const body of bodies) {
    body.isSleeping = false;
    body.isStatic = false;
  }
  if (world.engine) world.engine.enableSleeping = false;

  // Contraintes souples (liaisons physiques)
  const constraints = [
    Matter.Constraint.create({ bodyA: head, bodyB: chest, length: 30, stiffness: 0.6 }),
    Matter.Constraint.create({ bodyA: chest, bodyB: pelvis, length: 30, stiffness: 0.6 }),
    Matter.Constraint.create({ bodyA: chest, bodyB: armL, length: 25, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: chest, bodyB: armR, length: 25, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: pelvis, bodyB: legL, length: 25, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: pelvis, bodyB: legR, length: 25, stiffness: 0.5 }),
  ];
  Matter.World.add(world, constraints);

  return {
    color,
    hp: 100,
    bodies: { head, chest, pelvis, armL, armR, legL, legR },
  };
}

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
      footL: { x: b.legL.position.x, y: b.legL.position.y + 15 },
      footR: { x: b.legR.position.x, y: b.legR.position.y + 15 },
    },
  };
}

// === Boucle de simulation ===
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

// === WebSocket (connexion des joueurs) ===
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

  // Envoi initial de l'état des deux joueurs
  const state = {};
  for (const p of room.players) state[p.id] = serializeStickman(p.stickman);
  const syncPayload = JSON.stringify({ type: "state", players: state });
  for (const p of room.players)
    if (p.ws.readyState === 1) p.ws.send(syncPayload);

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    const room = rooms[ws.roomId];
    if (!room || room.closed) return;
    const player = room.players.find((p) => p.ws === ws);
    if (!player) return;

    if (data.type === "pointerMove" && player.stickman) {
      const head = player.stickman.bodies.head;
      const dx = data.pointer.x - head.position.x;
      const dy = data.pointer.y - head.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const factor = Math.min(0.000001 * (distance / 150), 0.000004);
      const fx = dx * factor;
      const fy = dy * factor;

      Matter.Body.applyForce(head, head.position, { x: fx, y: fy });
    }

    if (data.type === "exitGame") {
      console.log(`🚪 Fermeture de ${room.id}`);
      room.closed = true;
      for (const pl of room.players)
        if (pl.ws.readyState === 1)
          pl.ws.send(JSON.stringify({ type: "goToMenu" }));
    }
  });

  ws.on("close", () => {
    const room = rooms[ws.roomId];
    if (!room) return;
    room.players = room.players.filter((p) => p.ws !== ws);
    console.log(`❌ Joueur ${id} déconnecté de ${roomId}`);
    if (room.players.length === 0) {
      // ✅ Solution 1 aussi (delay avant fermeture)
      setTimeout(() => {
        const r = rooms[roomId];
        if (r && r.players.length === 0) {
          r.closed = true;
          console.log(`🛑 Room ${roomId} fermée (vide après délai).`);
        }
      }, 2000);
    }
  });
});



