const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 3000 });

let rooms = {}; // roomId -> { players: [], closed: false }

// === Création et gestion de rooms ===
function createRoom() {
  const id = "room-" + Math.random().toString(36).substr(2, 6);
  rooms[id] = { players: [], closed: false };
  return id;
}

function findAvailableRoom() {
  for (const id in rooms) {
    const room = rooms[id];
    if (!room.closed && room.players.length < 2) return id;
  }
  return createRoom();
}

// === Broadcast helper ===
function broadcastState(roomId) {
  const room = rooms[roomId];
  if (!room || room.closed) return;

  const playersState = {};
  room.players.forEach((p, index) => {
    playersState[index] = {
      color: p.color,
      hp: p.hp,
      parts: p.parts,
    };
  });

  const stateMessage = JSON.stringify({
    type: "state",
    players: playersState,
  });

  room.players.forEach(p => {
    if (p.readyState === WebSocket.OPEN) p.send(stateMessage);
  });
}

// === Lancement du serveur WebSocket ===
wss.on("connection", (ws) => {
  const roomId = findAvailableRoom();
  const room = rooms[roomId];
  room.players.push(ws);
  ws.roomId = roomId;
  ws.hp = 100;
  ws.parts = generateDummyStickman(); // pour test d'affichage

  const playerColor = room.players.length === 1 ? "black" : "red";
  ws.color = playerColor;

  console.log(`👥 Joueur connecté dans ${roomId} (${playerColor})`);

  // Envoyer infos initiales
  ws.send(JSON.stringify({
    type: "init",
    id: Math.random().toString(36).substr(2, 9),
    color: playerColor,
  }));

  // Réception des messages du joueur
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    const room = rooms[ws.roomId];
    if (!room || room.closed) {
      ws.send(JSON.stringify({ type: "roomClosed" }));
      return;
    }

    if (data.type === "pointerMove") {
      ws.parts.head.x = data.pointer.x;
      ws.parts.head.y = data.pointer.y;
    }

    if (data.type === "exitGame") {
      console.log(`🚪 Fermeture de ${ws.roomId}`);
      room.closed = true;
      room.players.forEach((p) => {
        if (p.readyState === WebSocket.OPEN)
          p.send(JSON.stringify({ type: "goToMenu" }));
      });
    }
  });

  // Fermeture
  ws.on("close", () => {
    const room = rooms[ws.roomId];
    if (!room) return;
    room.players = room.players.filter(p => p !== ws);
    if (room.players.length === 0) {
      room.closed = true;
      console.log(`💀 Room ${ws.roomId} supprimée (vide)`);
    }
  });
});

// === Simulation / Broadcast régulier (60 FPS ≈ 16 ms) ===
setInterval(() => {
  for (const roomId in rooms) {
    broadcastState(roomId);
  }
}, 100); // toutes les 100 ms

// === Génération basique d’un stickman (position de test) ===
function generateDummyStickman() {
  return {
    head: { x: 400, y: 300 },
    chest: { x: 400, y: 330 },
    pelvis: { x: 400, y: 360 },
    armL: { x: 370, y: 330 },
    armR: { x: 430, y: 330 },
    handL: { x: 350, y: 330 },
    handR: { x: 450, y: 330 },
    legL: { x: 380, y: 390 },
    legR: { x: 420, y: 390 },
    footL: { x: 370, y: 400 },
    footR: { x: 430, y: 400 },
  };
}

console.log("✅ Serveur Stickmen prêt sur ws://localhost:3000");

