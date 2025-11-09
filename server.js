import { WebSocketServer } from "ws";
import Matter from "matter-js";

const wss = new WebSocketServer({ port: 3000 });
console.log("✅ Serveur Stickmen Physique lancé sur ws://localhost:3000");

let rooms = {};

// === Création d'une nouvelle room ===
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

  const room = { id, engine, world, players: [], closed: false };
  rooms[id] = room;

  // 💥 Événement de collision pour les dégâts
  Matter.Events.on(engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;
      const aOwner = bodyA.plugin?.ownerId;
      const bOwner = bodyB.plugin?.ownerId;
      if (!aOwner || !bOwner || aOwner === bOwner) continue; // éviter self-hit

      const room = Object.values(rooms).find(r =>
        r.players.some(p => p.id === aOwner || p.id === bOwner)
      );
      if (!room || room.closed) continue;

      const players = room.players;
      const attacker = players.find(p => p.id === aOwner);
      const target = players.find(p => p.id === bOwner);

      if (!attacker || !target || !target.stickman) continue;

      const hitParts = [bodyA.label, bodyB.label];
      const isHeadHit = hitParts.includes("head");
      const isStrike =
        hitParts.some(l => ["handL", "handR", "footL", "footR", "legL", "legR"].includes(l));

      if (isHeadHit && isStrike) {
        const vA = Matter.Vector.magnitude(bodyA.velocity);
        const vB = Matter.Vector.magnitude(bodyB.velocity);
        const impact = (vA + vB) / 2;
        const dmg = Math.min(impact * 10, 20);

        if (dmg > 1 && target.stickman.hp > 0) {
          target.stickman.hp = Math.max(target.stickman.hp - dmg, 0);
          console.log(`💥 ${attacker.id} frappe ${target.id} (-${dmg.toFixed(1)} HP)`);

          // Fin de match : si un joueur tombe à 0 HP
          if (target.stickman.hp <= 0 && !room.closed) {
            console.log(`🏁 ${target.id} est K.O. — fermeture de ${room.id}`);
            room.closed = true;
            for (const pl of room.players)
              if (pl.ws.readyState === 1)
                pl.ws.send(JSON.stringify({ type: "goToMenu" }));

            setTimeout(() => {
              delete rooms[room.id];
              console.log(`🗑️ Room ${room.id} supprimée`);
            }, 5000);
          }
        }
      }
    }
  });

  return id;
}

// === Recherche d'une room libre ===
function findAvailableRoom() {
  for (const id in rooms) {
    const r = rooms[id];
    if (r.closed) {
      delete rooms[id];
      continue;
    }
    if (r.players.length < 2 && !r.closed) return id;
  }
  return createRoom();
}

// === Création du stickman ===
function createStickman(x, y, color, world, ownerId) {
  const add = (b, label) => {
    b.label = label;
    b.plugin = { ownerId };
    return b;
  };

  const head = add(Matter.Bodies.circle(x, y, 10, { restitution: 0.4 }), "head");
  const chest = add(Matter.Bodies.rectangle(x, y + 30, 15, 25), "chest");
  const pelvis = add(Matter.Bodies.rectangle(x, y + 60, 15, 20), "pelvis");

  const armL = add(Matter.Bodies.rectangle(x - 20, y + 30, 20, 5), "armL");
  const handL = add(Matter.Bodies.circle(x - 40, y + 30, 4), "handL");
  const armR = add(Matter.Bodies.rectangle(x + 20, y + 30, 20, 5), "armR");
  const handR = add(Matter.Bodies.circle(x + 40, y + 30, 4), "handR");

  const legL = add(Matter.Bodies.rectangle(x - 10, y + 80, 5, 25), "legL");
  const footL = add(Matter.Bodies.circle(x - 10, y + 100, 5), "footL");
  const legR = add(Matter.Bodies.rectangle(x + 10, y + 80, 5, 25), "legR");
  const footR = add(Matter.Bodies.circle(x + 10, y + 100, 5), "footR");

  const parts = [head, chest, pelvis, armL, handL, armR, handR, legL, legR, footL, footR];
  Matter.World.add(world, parts);

  const c = (a, b, len = 25) =>
    Matter.Constraint.create({ bodyA: a, bodyB: b, length: len, stiffness: 0.5 });
  Matter.World.add(world, [
    c(head, chest, 30),
    c(chest, pelvis, 30),
    c(chest, armL, 25),
    c(armL, handL, 15),
    c(chest, armR, 25),
    c(armR, handR, 15),
    c(pelvis, legL, 25),
    c(legL, footL, 10),
    c(pelvis, legR, 25),
    c(legR, footR, 10),
  ]);

  return {
    color,
    hp: 100,
    bodies: { head, chest, pelvis, armL, handL, armR, handR, legL, legR, footL, footR },
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
      const dist = Math.sqrt(dx * dx + dy * dy);
      const f = Math.min(dist * 0.000002, 0.00007);
      Matter.Body.applyForce(head, head.position, { x: dx * f, y: dy * f });
    }

    // Envoi des états
    const state = {};
    for (const p of room.players)
      state[p.id] = {
        color: p.stickman.color,
        hp: p.stickman.hp,
        parts: Object.fromEntries(Object.entries(p.stickman.bodies).map(([k, v]) => [k, v.position])),
      };

    const payload = JSON.stringify({ type: "state", players: state });
    for (const p of room.players)
      if (p.ws.readyState === 1) p.ws.send(payload);
  }
}, 1000 / 30);

// === WebSocket principal ===
wss.on("connection", (ws) => {
  const roomId = findAvailableRoom();
  const room = rooms[roomId];

  if (!room || room.closed) {
    ws.send(JSON.stringify({ type: "roomClosed" }));
    ws.close(1000, "Room closed");
    console.warn("⛔ Tentative de connexion à une room fermée");
    return;
  }

  const id = Math.random().toString(36).substr(2, 9);
  const color = room.players.length === 0 ? "black" : "red";
  const stickman = createStickman(300 + room.players.length * 200, 100, color, room.world, id);
  const player = { id, ws, stickman, pointer: { x: 400, y: 300 } };
  room.players.push(player);
  ws.roomId = roomId;

  console.log(`👤 Joueur ${id} connecté (${color}) dans ${roomId}`);
  ws.send(JSON.stringify({ type: "init", id, color }));

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    const r = rooms[ws.roomId];
    if (!r || r.closed) return;

    const player = r.players.find((p) => p.ws === ws);
    if (!player) return;

    if (data.type === "pointerMove") player.pointer = data.pointer;

    if (data.type === "exitGame") {
      console.log(`🚪 Room ${r.id} fermée manuellement`);
      r.closed = true;
      for (const pl of r.players)
        if (pl.ws.readyState === 1)
          pl.ws.send(JSON.stringify({ type: "goToMenu" }));
      setTimeout(() => {
        delete rooms[r.id];
        console.log(`🗑️ Room ${r.id} supprimée`);
      }, 5000);
    }
  });

  ws.on("close", () => {
    const r = rooms[ws.roomId];
    if (!r) return;
    r.players = r.players.filter((p) => p.ws !== ws);
    if (r.players.length === 0) {
      r.closed = true;
      console.log(`🏁 Room ${r.id} fermée (déconnexion)`);
    }
  });
});

