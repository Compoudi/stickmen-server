// === 🎮 Client Stickmen (version locale stable) ===

let ws = null;
let wsConnected = false;
let id = null;
let color = null;
let players = {};
let pointer = { x: 400, y: 300 };
let currentScene = null;
let gameEnded = false;

// === 🔗 Initialisation WebSocket ===
function initWebSocket(scene) {
  if (gameEnded) {
    console.warn("🚫 Partie terminée — création d’une nouvelle partie requise.");
    alert("Cette partie est terminée. Relancez une nouvelle partie depuis le menu.");
    return;
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    console.warn("⚠️ WebSocket déjà connecté.");
    return;
  }

  try {
    ws = new WebSocket("ws://localhost:3000"); // 👈 connexion locale
  } catch (err) {
    console.error("❌ Impossible de créer la WebSocket :", err);
    return;
  }

  ws.onopen = () => {
    wsConnected = true;
    console.log("🌐 WebSocket connecté ✅");
  };

  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data);
      if (!scene) return;

      if (data.type === "init") {
        id = data.id;
        color = data.color;
        console.log("👤 Joueur initialisé:", id, color);
      }

      if (data.type === "state" && data.players) {
        players = data.players;
      }

      if (data.type === "goToMenu") {
        console.log("📩 Retour au menu principal !");
        gameEnded = true;
        if (scene.scene.isActive("StickmenScene")) {
          scene.scene.stop("StickmenScene");
          scene.scene.start("MenuScene");
        }
      }

      if (data.type === "roomClosed") {
        alert("⚠️ La partie est terminée.");
        gameEnded = true;
        if (scene.scene.isActive("StickmenScene")) {
          scene.scene.stop("StickmenScene");
          scene.scene.start("MenuScene");
        }
      }
    } catch (err) {
      console.error("Erreur parsing message serveur:", err);
    }
  };

  ws.onclose = () => {
    console.log("🔌 WebSocket fermé — tentative de reconnexion dans 2s...");
    wsConnected = false;
    setTimeout(() => initWebSocket(scene), 2000);
  };

  ws.onerror = (e) => console.warn("⚠️ Erreur WebSocket:", e);
}

// === 🏠 SCÈNE MENU ===
class MenuScene extends Phaser.Scene {
  constructor() { super({ key: "MenuScene" }); }

  create() {
    this.add.text(400, 200, "🏠 Menu Principal", {
      font: "40px Arial",
      color: "#000",
    }).setOrigin(0.5);

    this.add.text(400, 320, "Appuyez sur ESPACE pour démarrer", {
      font: "20px Arial",
      color: "#333",
    }).setOrigin(0.5);

    this.input.keyboard.on("keydown-SPACE", () => {
      if (gameEnded) {
        alert("Rechargez la page pour recommencer !");
        return;
      }
      console.log("🎮 Nouvelle partie lancée...");
      this.scene.start("StickmenScene");
    });
  }
}

// === ⚔️ SCÈNE DE COMBAT ===
class StickmenScene extends Phaser.Scene {
  constructor() { super({ key: "StickmenScene" }); }

  create() {
    currentScene = this;
    this.graphics = this.add.graphics();
    this.exitButtonShown = false;

    initWebSocket(this);

    this.input.on("pointermove", (p) => {
      pointer = { x: p.x, y: p.y };
      if (ws && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "pointerMove", pointer }));
    });
  }

  update() {
    this.graphics.clear();

    // Affichage des stickmen
    for (const pid in players) {
      const player = players[pid];
      if (!player?.parts?.head) continue;
      const col = player.color === "black" ? 0x000000 : 0xff0000;
      this.drawStickman(player, col);
    }
  }

  drawStickman(player, color) {
    const b = player.parts;
    const g = this.graphics;

    g.lineStyle(3, color);

    const line = (a, b) => {
      if (a && b) {
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
      }
    };

    g.beginPath();
    line(b.head, b.chest);
    line(b.chest, b.pelvis);
    line(b.chest, b.armL);
    line(b.chest, b.armR);
    line(b.pelvis, b.legL);
    line(b.pelvis, b.legR);
    g.strokePath();

    if (b.head) g.strokeCircle(b.head.x, b.head.y, 10);
    if (b.legL) g.strokeCircle(b.legL.x, b.legL.y, 5);
    if (b.legR) g.strokeCircle(b.legR.x, b.legR.y, 5);
  }
}

// === 🎯 CONFIG PHASER ===
new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#ffffff",
  scene: [MenuScene, StickmenScene],
});


