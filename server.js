// === 🧠 Serveur Stickmen avec physique Matter.js complète ===
import { WebSocketServer } from "ws";
import Matter from "matter-js";

const wss = new WebSocketServer({ port: 3000 });
console.log("✅ Serveur Stickmen Physique lancé sur ws://localhost:3000");

let rooms = {}; // { roomId: { engine, world, players, closed } }

function createRoom() {
  const id = "room-" + Math.random().toString(36).substr(2, 6);
  const engine = Matter.Engine.create();
  const world = engine.world;

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
    const room = rooms[id];
    if (!room.closed && room.players.length < 2) return id;
  }
  return createRoom();
}

// === Création du stickman physique ===
function createStickman(x, y, color, world) {
  const head = Matter.Bodies.circle(x, y, 10, { density: 0.0025, restitution: 0.4, label: "head" });
  const chest = Matter.Bodies.rectangle(x, y + 30, 15, 25, { density: 0.004, label: "chest" });
  const pelvis = Matter.Bodies.rectangle(x, y + 60, 15, 20, { density: 0.004, label: "pelvis" });

  // Bras
  const upperArmL = Matter.Bodies.rectangle(x - 20, y + 30, 20, 5, { density: 0.002, label: "upperArmL" });
  const foreArmL  = Matter.Bodies.rectangle(x - 40, y + 30, 20, 5, { density: 0.002, label: "foreArmL" });
  const handL     = Matter.Bodies.circle(x - 50, y + 30, 4, { density: 0.001, label: "handL" });

  const upperArmR = Matter.Bodies.rectangle(x + 20, y + 30, 20, 5, { density: 0.002, label: "upperArmR" });
  const foreArmR  = Matter.Bodies.rectangle(x + 40, y + 30, 20, 5, { density: 0.002, label: "foreArmR" });
  const handR     = Matter.Bodies.circle(x + 50, y + 30, 4, { density: 0.001, label: "handR" });

  // Jambes
  const legL = Matter.Bodies.rectangle(x - 10, y + 80, 5, 25, { density: 0.004, label: "legL" });
  const legR = Matter.Bodies.rectangle(x + 10, y + 80, 5, 25, { density: 0.004, label: "legR" });

  const parts = [
    head, chest, pelvis,
    upperArmL, foreArmL, handL,
    upperArmR, foreArmR, handR,
    legL, legR
  ];
  Matter.World.add(world, parts);

  const constraints = [
    Matter.Constraint.create({ bodyA: head, bodyB: chest, length: 30, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: chest, bodyB: pelvis, length: 30, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: chest, bodyB: upperArmL, length: 25, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: upperArmL, bodyB: foreArmL, length: 20, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: foreArmL, bodyB: handL, length: 10, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: chest, bodyB: upperArmR, length: 25, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: upperArmR, bodyB: foreArmR, length: 20, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: foreArmR, bodyB: handR, length: 10, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: pelvis, bodyB: legL, length: 25, stiffness: 0.5 }),
    Matter.Constraint.create({ bodyA: pelvis, bodyB: legR, length: 25, stiffness: 0.5 }),
  ];
  Matter.World.add(world, constraints);

  return {
    color,
    hp: 100,
    bodies: {
      head, chest, pelvis,
      armL: upperArmL, foreArmL, handL,
      armR: upperArmR, foreArmR, handR,
      legL, legR
    },
  };
}

// === Extraction des positions physiques ===
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
      foreArmL: b.foreArmL.position,
      handL: b.handL.position,
      armR: b.armR.position,
      foreArmR: b.foreArmR.position,
      handR: b.handR.position,
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
    const room = rooms[id];
    if (room.closed) continue;
    Matter.Engine.update(room.engine, 1000 / 60);

    // 💫 Attraction vers pointeur
    for (const p of room.players) {
      if (!p.stickman || !p.pointer) continue;
      const head = p.stickman.bodies.head;
      const dx = p.pointer.x - head.position.x;
      const dy = p.pointer.y - head.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const base = 0.0000015;
      const f = Math.min(dist * base, 0.00006);
      Matter.Body.applyForce(head, head.position, { x: dx * f, y: dy * f });
    }

    // Envoi de l'état
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

// === WebSocket ===
wss.on("connection", (ws) => {
  const roomId = findAvailableRoom();
  const room = rooms[roomId];
  const id = Math.random().toString(36).substr(2, 9);
  const color = room.players.length === 0 ? "black" : "red";

  const stickman = createStickman(300 + room.players.length * 200, 100, color, room.world);

  const player = { id, ws, stickman, pointer: { x: 400, y: 300 } };
  room.players.push(player);
  ws.roomId = roomId;

  console.log(`👤 Joueur ${id} connecté dans ${roomId} (${color})`);
  ws.send(JSON.stringify({ type: "init", id, color }));

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    const room = rooms[ws.roomId];
    if (!room || room.closed) return;
    const player = room.players.find((p) => p.ws === ws);
    if (!player) return;

    if (data.type === "pointerMove" && player.stickman)
      player.pointer = data.pointer;

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
    if (room.players.length === 0) room.closed = true;
  });

  // 💥 Gestion des collisions (dégâts)
  Matter.Events.on(room.engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;

      // Vérifie si c'est une main/pied qui touche une tête adverse
      const isStrike =
        ((bodyA.label.includes("hand") || bodyA.label.includes("leg")) && bodyB.label === "head") ||
        ((bodyB.label.includes("hand") || bodyB.label.includes("leg")) && bodyA.label === "head");

      if (!isStrike) continue;

      const hitter = room.players.find(p =>
        Object.values(p.stickman.bodies).includes(bodyA) ||
        Object.values(p.stickman.bodies).includes(bodyB)
      );
      const target = room.players.find(p =>
        p !== hitter && (
          Object.values(p.stickman.bodies).includes(bodyA) ||
          Object.values(p.stickman.bodies).includes(bodyB)
        )
      );

      if (hitter && target && target.stickman.hp > 0) {
        const vA = Matter.Vector.magnitude(bodyA.velocity);
        const vB = Matter.Vector.magnitude(bodyB.velocity);
        const impact = (vA + vB) / 2;
        const dmg = Math.min(impact * 10, 15); // dégâts limités à 15 max
        target.stickman.hp = Math.max(target.stickman.hp - dmg, 0);
      }
    }
  });
});

