const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");
const Matter = require("matter-js");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.static("public"));

// Chaque partie = un monde physique indépendant
const games = []; // [{ id, players: { ws, id, color }, engine, world, interval }]

// Trouve ou crée une partie disponible
function findOrCreateGame() {
  const openGame = games.find((g) => Object.keys(g.players).length < 2);
  if (openGame) return openGame;

  const engine = Matter.Engine.create();
  const world = engine.world;
  world.gravity.y = 1;
  Matter.World.add(world, Matter.Bodies.rectangle(400, 590, 800, 20, { isStatic: true }));

  const game = {
    id: Date.now(),
    players: {},
    engine,
    world,
    interval: null
  };
  games.push(game);
  return game;
}

function createStickman(world, x, y) {
  const group = Matter.Body.nextGroup(true);
  const parts = {
    head: Matter.Bodies.circle(x, y, 15, { collisionFilter: { group } }),
    chest: Matter.Bodies.rectangle(x, y + 40, 25, 40, { collisionFilter: { group } }),
    pelvis: Matter.Bodies.rectangle(x, y + 90, 25, 20, { collisionFilter: { group } }),
    armL: Matter.Bodies.rectangle(x - 25, y + 40, 30, 8, { collisionFilter: { group } }),
    armR: Matter.Bodies.rectangle(x + 25, y + 40, 30, 8, { collisionFilter: { group } }),
    legL: Matter.Bodies.rectangle(x - 10, y + 130, 10, 35, { collisionFilter: { group } }),
    legR: Matter.Bodies.rectangle(x + 10, y + 130, 10, 35, { collisionFilter: { group } })
  };

  const c = Matter.Constraint.create;
  const constraints = [
    c({ bodyA: parts.head, bodyB: parts.chest, length: 25, stiffness: 0.9 }),
    c({ bodyA: parts.chest, bodyB: parts.pelvis, length: 40, stiffness: 0.9 }),
    c({ bodyA: parts.chest, bodyB: parts.armL, length: 30, stiffness: 0.6 }),
    c({ bodyA: parts.chest, bodyB: parts.armR, length: 30, stiffness: 0.6 }),
    c({ bodyA: parts.pelvis, bodyB: parts.legL, length: 25, stiffness: 0.6 }),
    c({ bodyA: parts.pelvis, bodyB: parts.legR, length: 25, stiffness: 0.6 })
  ];

  Matter.World.add(world, [...Object.values(parts), ...constraints]);
  return { stickmanParts: parts, head: parts.head };
}

// Gestion WebSocket
wss.on("connection", (ws) => {
  // Trouver ou créer une partie libre
  const game = findOrCreateGame();
  const id = Date.now().toString();
  const color = Object.keys(game.players).length === 0 ? "black" : "red";

  // Crée le stickman du joueur
  const stickman = createStickman(game.world, 400 + Math.random() * 100 - 50, 200);
  game.players[id] = { ws, color, ...stickman, pointer: { x: 400, y: 200 } };

  ws.send(JSON.stringify({ type: "init", id, color }));

  // Lance la simulation si c’est le 1er joueur
  if (!game.interval) {
    game.interval = setInterval(() => updateGame(game), 1000 / 60);
  }

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    if (data.type === "pointerMove") {
      game.players[id].pointer = data.pointer;
    }
  });

  ws.on("close", () => {
    removePlayer(game, id);
  });
});

function updateGame(game) {
  const { engine, players } = game;
  Matter.Engine.update(engine, 1000 / 60);

  // Déplacer les têtes selon la souris
  for (const [id, p] of Object.entries(players)) {
    const dx = p.pointer.x - p.head.position.x;
    const dy = p.pointer.y - p.head.position.y;
    Matter.Body.setVelocity(p.head, { x: dx * 0.05, y: dy * 0.05 });
  }

  // Snapshot des positions
  const snapshot = {};
  for (const [id, p] of Object.entries(players)) {
    snapshot[id] = { color: p.color, parts: {} };
    for (const [name, body] of Object.entries(p.stickmanParts))
      snapshot[id].parts[name] = { x: body.position.x, y: body.position.y };
  }

  // Broadcast aux joueurs de cette partie seulement
  const payload = JSON.stringify({ type: "state", players: snapshot });
  for (const p of Object.values(players)) {
    try {
      if (p.ws.readyState === 1) p.ws.send(payload);
    } catch {}
  }
}

function removePlayer(game, id) {
  const p = game.players[id];
  if (!p) return;
  for (const b of Object.values(p.stickmanParts)) Matter.World.remove(game.world, b);
  delete game.players[id];

  // Si plus personne → stoppe le moteur et supprime la partie
  if (Object.keys(game.players).length === 0) {
    clearInterval(game.interval);
    const index = games.indexOf(game);
    if (index >= 0) games.splice(index, 1);
  }
}

const PORT = 3000;
server.listen(PORT, () => console.log(`🧩 Serveur multi-parties sur http://localhost:${PORT}`));
