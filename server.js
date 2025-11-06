const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 3000 });

let rooms = {}; // roomId -> { players: [], closed: false }

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

wss.on("connection", (ws) => {
  const roomId = findAvailableRoom();
  const room = rooms[roomId];
  room.players.push(ws);
  ws.roomId = roomId;
  ws.hp = 100;

  console.log(`👥 Joueur connecté dans ${roomId}`);

  // Envoyer au joueur ses infos initiales
  ws.send(JSON.stringify({
    type: "init",
    id: Math.random().toString(36).substr(2, 9),
    color: room.players.length === 1 ? "black" : "red",
  }));

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    const room = rooms[ws.roomId];
    if (!room || room.closed) {
      ws.send(JSON.stringify({ type: "roomClosed" }));
      return;
    }

    if (data.type === "pointerMove") {
      room.players.forEach((p) => {
        if (p !== ws && p.readyState === WebSocket.OPEN)
          p.send(JSON.stringify({ type: "pointerMove", pointer: data.pointer }));
      });
    }

    if (data.type === "exitGame") {
      console.log(`🚪 Joueur a quitté la partie — fermeture de ${ws.roomId}`);
      room.closed = true;
      room.players.forEach((p) => {
        if (p.readyState === WebSocket.OPEN)
          p.send(JSON.stringify({ type: "goToMenu" }));
      });
    }
  });

  ws.on("close", () => {
    const room = rooms[ws.roomId];
    if (!room) return;
    room.players = room.players.filter((p) => p !== ws);
    if (room.players.length === 0) {
      room.closed = true;
      console.log(`💀 Room ${ws.roomId} fermée (plus de joueurs)`);
    }
  });
});

console.log("✅ Serveur WebSocket Stickmen lancé sur le port 3000");
