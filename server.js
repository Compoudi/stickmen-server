const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");
const Matter = require("matter-js");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.static("public"));

const games = [];

// 🔍 Crée ou trouve une partie
function findOrCreateGame() {
  const open = games.find((g) => Object.keys(g.players).length < 2);
  if (open) return open;

  const engine = Matter.Engine.create();
  const world = engine.world;
  world.gravity.y = 1;
  Matter.World.add(world, Matter.Bodies.rectangle(400, 590, 800, 20, { isStatic: true }));

  const game = { id: Date.now(), players: {}, engine, world };
  games.push(game);

  Matter.Events.on(engine, "collisionStart", (evt) => {
    for (const pair of evt.pairs) handleCollision(pair.bodyA, pair.bodyB, game);
  });

  return game;
}

// 🧍 Crée un stickman complet
function createStickman(world, x, y) {
  const group = Matter.Body.nextGroup(false);
  const common = { collisionFilter: { group } };

  const parts = {
    head: Matter.Bodies.circle(x, y, 15, { ...common, label: "head" }),
    chest: Matter.Bodies.rectangle(x, y + 40, 25, 40, { ...common, label: "chest" }),
    pelvis: Matter.Bodies.rectangle(x, y + 110, 25, 25, { ...common, label: "pelvis" }),
    armL: Matter.Bodies.rectangle(x - 55, y + 50, 70, 8, { ...common, label: "armL" }),
    armR: Matter.Bodies.rectangle(x + 55, y + 50, 70, 8, { ...common, label: "armR" }),
    handL: Matter.Bodies.circle(x - 95, y + 50, 7, { ...common, label: "handL", density: 0.004 }),
    handR: Matter.Bodies.circle(x + 95, y + 50, 7, { ...common, label: "handR", density: 0.004 }),
    legL: Matter.Bodies.rectangle(x - 10, y + 180, 12, 70, { ...common, label: "legL" }),
    legR: Matter.Bodies.rectangle(x + 10, y + 180, 12, 70, { ...common, label: "legR" }),
    footL: Matter.Bodies.circle(x - 15, y + 230, 8, { ...common, label: "footL", density: 0.005 }),
    footR: Matter.Bodies.circle(x + 15, y + 230, 8, { ...common, label: "footR", density: 0.005 })
  };

  const c = Matter.Constraint.create;
  const constraints = [
    c({ bodyA: parts.head, bodyB: parts.chest, length: 25, stiffness: 0.9 }),
    c({ bodyA: parts.chest, bodyB: parts.pelvis, length: 55, stiffness: 0.9 }),
    c({ bodyA: parts.chest, bodyB: parts.armL, length: 45, stiffness: 0.7 }),
    c({ bodyA: parts.chest, bodyB: parts.armR, length: 45, stiffness: 0.7 }),
    c({ bodyA: parts.armL, bodyB: parts.handL, length: 35, stiffness: 0.9 }),
    c({ bodyA: parts.armR, bodyB: parts.handR, length: 35, stiffness: 0.9 }),
    c({ bodyA: parts.pelvis, bodyB: parts.legL, length: 50, stiffness: 0.8 }),
    c({ bodyA: parts.pelvis, bodyB: parts.legR, length: 50, stiffness: 0.8 }),
    c({ bodyA: parts.legL, bodyB: parts.footL, length: 30, stiffness: 0.9 }),
    c({ bodyA: parts.legR, bodyB: parts.footR, length: 30, stiffness: 0.9 })
  ];

  Matter.World.add(world, [...Object.values(parts), ...constraints]);
  return { stickmanParts: parts, head: parts.head, hp: 100 };
}

// 🎯 Détection des collisions
function handleCollision(bodyA, bodyB, game) {
  console.log("🧠 Collision détectée :", bodyA.label, "↔", bodyB.label);

  const players = Object.values(game.players);
  if (players.length < 2) return;

  const findOwner = (body) => {
    for (const p of players) {
      for (const [name, part] of Object.entries(p.stickmanParts)) {
        if (part === body) return p;
      }
    }
    return null;
  };

  const pa = findOwner(bodyA);
  const pb = findOwner(bodyB);
  if (!pa || !pb || pa === pb) return;

  const attackers = ["handL", "handR", "footL", "footR"];
  const vitals = ["head", "chest", "pelvis"];

  const aVital = vitals.includes(bodyA.label);
  const bVital = vitals.includes(bodyB.label);
  const aAttack = attackers.includes(bodyA.label);
  const bAttack = attackers.includes(bodyB.label);

  if ((aAttack && bVital) || (bAttack && aVital)) {
    const victim = aAttack ? pb : pa;
    victim.hp = Math.max(0, victim.hp - 5);
    console.log(`💥 Coup valide ! HP restant ${victim.hp}`);
  }
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
    } catch {}
  });

  ws.on("close", () => removePlayer(game, id));
});

// 🔄 Moteur de jeu
function updateGame(game) {
  Matter.Engine.update(game.engine, 1000 / 60);
  for (const p of Object.values(game.players)) {
    const dx = p.pointer.x - p.head.position.x;
    const dy = p.pointer.y - p.head.position.y;
    Matter.Body.setVelocity(p.head, { x: dx * 0.05, y: dy * 0.05 });
  }

  const snapshot = {};
  for (const [id, p] of Object.entries(game.players)) {
    snapshot[id] = { color: p.color, hp: p.hp, parts: {} };
    for (const [name, body] of Object.entries(p.stickmanParts)) {
      snapshot[id].parts[name] = { x: body.position.x, y: body.position.y };
    }
  }
  const data = JSON.stringify({ type: "state", players: snapshot });
  for (const p of Object.values(game.players))
    if (p.ws.readyState === 1) p.ws.send(data);
}

// 🧹 Nettoyage
function removePlayer(game, id) {
  const p = game.players[id];
  if (!p) return;
  for (const b of Object.values(p.stickmanParts)) Matter.World.remove(game.world, b);
  delete game.players[id];
  if (Object.keys(game.players).length === 0 && game.interval) {
    clearInterval(game.interval);
    games.splice(games.indexOf(game), 1);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`🧍 Serveur Stickmen combat prêt sur http://localhost:${PORT}`)
);


