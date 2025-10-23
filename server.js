// 🧩 Stickmen Multiplayer Server — Version proportionnée
const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");
const Matter = require("matter-js");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.static("public"));

const games = [];

// 🧠 Trouver ou créer une partie
function findOrCreateGame() {
  const openGame = games.find((g) => Object.keys(g.players).length < 2);
  if (openGame) return openGame;

  const engine = Matter.Engine.create();
  const world = engine.world;
  world.gravity.y = 1;
  Matter.World.add(world, Matter.Bodies.rectangle(400, 590, 800, 20, { isStatic: true }));

  const game = { id: Date.now(), players: {}, engine, world, interval: null };
  games.push(game);
  return game;
}

// 🧍‍♂️ Crée un stickman avec bras longs + petites mains/pieds ronds
function createStickman(world, x, y) {
  const group = Matter.Body.nextGroup(true);

  const parts = {
    head: Matter.Bodies.circle(x, y, 15, { collisionFilter: { group } }),
    chest: Matter.Bodies.rectangle(x, y + 40, 25, 40, { collisionFilter: { group } }),
    pelvis: Matter.Bodies.rectangle(x, y + 110, 25, 25, { collisionFilter: { group } }),

    // 🦾 Bras plus longs
    armL: Matter.Bodies.rectangle(x - 45, y + 45, 50, 8, { collisionFilter: { group } }),
    armR: Matter.Bodies.rectangle(x + 45, y + 45, 50, 8, { collisionFilter: { group } }),

    // 🖐️ Mains : petites boules
    handL: Matter.Bodies.circle(x - 75, y + 45, 6, { collisionFilter: { group } }),
    handR: Matter.Bodies.circle(x + 75, y + 45, 6, { collisionFilter: { group } }),

    // 🦵 Jambes plus longues
    legL: Matter.Bodies.rectangle(x - 10, y + 180, 12, 70, { collisionFilter: { group } }),
    legR: Matter.Bodies.rectangle(x + 10, y + 180, 12, 70, { collisionFilter: { group } }),

    // 👣 Petits pieds ronds
    footL: Matter.Bodies.circle(x - 15, y + 230, 7, { collisionFilter: { group } }),
    footR: Matter.Bodies.circle(x + 15, y + 230, 7, { collisionFilter: { group } })
  };

  const c = Matter.Constraint.create;
  const constraints = [
    // Corps principal
    c({ bodyA: parts.head, bodyB: parts.chest, length: 25, stiffness: 0.9 }),
    c({ bodyA: parts.chest, bodyB: parts.pelvis, length: 55, stiffness: 0.9 }),

    // Bras + mains
    c({ bodyA: parts.chest, bodyB: parts.armL, length: 40, stiffness: 0.6 }),
    c({ bodyA: parts.chest, bodyB: parts.armR, length: 40, stiffness: 0.6 }),
    c({ bodyA: parts.armL, bodyB: parts.handL, length: 25, stiffness: 0.9 }),
    c({ bodyA: parts.armR, bodyB: parts.handR, length: 25, stiffness: 0.9 }),

    // Jambes + pieds
    c({ bodyA: parts.pelvis, bodyB: parts.legL, length: 50, stiffness: 0.8 }),
    c({ bodyA: parts.pelvis, bodyB: parts.legR, length: 50, stiffness: 0.8 }),
    c({ bodyA: parts.legL, bodyB: parts.footL, length: 30, stiffness: 0.9 }),
    c({ bodyA: parts.legR, bodyB: parts.footR, length: 30, stiffness: 0.9 })
  ];

  Matter.World.add(world, [...Object.values(parts), ...constraints]);
  return { stickmanParts: parts, head: parts.head };
}

// 🌐 WebSocket
wss.on("connection", (ws) => {
  const game = findOrCreateGame();
  const id = Date.now().toString();
  const color = Object.keys(game.players).length === 0 ? "black" : "red";

  const stickman = createStickman(game.world, 400 + Math.random() * 100 - 50, 200);
  game.players[id] = { ws, color, ...stickman, pointer: { x: 400, y: 200 } };

  ws.send(JSON.stringify({ type: "init", id, color }));

  if (!game.interval) game.interval = setInterval(() => updateGame(game), 1000 / 60);

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === "pointerMove") game.players[id].pointer = data.pointer;
    } catch (e) {
      console.error("Invalid message:", e);
    }
  });

  ws.on("close", () => removePlayer(game, id));
});

// 🔄 Boucle physique
function updateGame(game) {
  Matter.Engine.update(game.engine, 1000 / 60);

  for (const p of Object.values(game.players)) {
    const dx = p.pointer.x - p.head.position.x;
    const dy = p.pointer.y - p.head.position.y;
    Matter.Body.setVelocity(p.head, { x: dx * 0.05, y: dy * 0.05 });
  }

  const snapshot = {};
  for (const [id, p] of Object.entries(game.players)) {
    snapshot[id] = { color: p.color, parts: {} };
    for (const [name, body] of Object.entries(p.stickmanParts))
      snapshot[id].parts[name] = { x: body.position.x, y: body.position.y };
  }

  const payload = JSON.stringify({ type: "state", players: snapshot });
  for (const p of Object.values(game.players))
    if (p.ws.readyState === 1) p.ws.send(payload);
}

// 🧹 Nettoyage
function removePlayer(game, id) {
  const p = game.players[id];
  if (!p) return;
  for (const b of Object.values(p.stickmanParts)) Matter.World.remove(game.world, b);
  delete game.players[id];

  if (Object.keys(game.players).length === 0) {
    clearInterval(game.interval);
    const i = games.indexOf(game);
    if (i >= 0) games.splice(i, 1);
  }
}

// 🚀 Lancement
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🧍 Serveur Stickmen réaliste sur http://localhost:${PORT}`));

