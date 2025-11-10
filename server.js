window.addEventListener("load", () => {
  if (window.CrazyGames) {
    const crazySDK = window.CrazyGames.CrazySDK.getInstance();
    crazySDK.init();
    crazySDK.gameplayStart();
    console.log("CrazyGames SDK initialisé ✅");
  } else {
    console.log("⚠️ CrazyGames SDK non détecté (test local).");
  }
});

let ws = null;
let wsConnected = false;
let id, color;
let players = {};
let pointer = { x: 400, y: 300 };
let currentScene = null;
let gameEnded = false;

// === 🔗 Initialisation WebSocket ===
function initWebSocket(scene) {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try { if (ws) ws.close(); } catch (e) {}
  ws = new WebSocket("wss://stickmen-server.onrender.com");
  wsConnected = true;

  ws.onopen = () => console.log("🌐 WebSocket connecté");
  ws.onclose = () => {
    console.log("🔌 WebSocket fermé");
    wsConnected = false;
  };
  ws.onerror = (e) => console.error("⚠️ Erreur WebSocket:", e);

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (!scene) return;

    if (data.type === "init") {
      id = data.id;
      color = data.color;
      console.log("👤 Joueur initialisé:", id, color);
    }

    if (data.type === "state") {
      players = data.players;
      const me = players[id];
      const anyoneKO = Object.values(players).some(p => p.hp <= 0);

      if (anyoneKO && !scene.exitButtonShown && !gameEnded) {
        console.log("🏁 Fin du match — affichage du bouton Exit");
        scene.exitButtonShown = true;
        scene.showExitButton();
      }
    }

    if (data.type === "goToMenu" || data.type === "roomClosed") {
      console.log("📩 Retour au menu principal reçu !");
      const btn = document.getElementById("exit-btn");
      if (btn) btn.remove();
      endGameAndReturn(scene);
    }

    if (data.type === "playerLeft") {
      console.log("👋 Joueur quitté:", data.id);
      delete players[data.id];
    }
  };
}

// === Retour au menu ===
function endGameAndReturn(scene) {
  gameEnded = true;
  try { if (ws) ws.close(); } catch (e) {}
  ws = null;
  wsConnected = false;
  players = {};
  id = null;
  color = null;
  pointer = { x: 400, y: 300 };

  const btn = document.getElementById("exit-btn");
  if (btn) btn.remove();

  if (scene.scene.isActive("StickmenScene")) {
    scene.scene.stop("StickmenScene");
    scene.scene.start("MenuScene");
  }
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
      console.log("🎮 Nouvelle partie lancée...");
      // Réinitialisation complète
      gameEnded = false;
      players = {};
      id = null;
      color = null;
      pointer = { x: 400, y: 300 };
      this.scene.start("StickmenScene");
    });
  }
}

// === ⚔️ SCÈNE COMBAT ===
class StickmenScene extends Phaser.Scene {
  constructor() { super({ key: "StickmenScene" }); }

  create() {
    currentScene = this;
    gameEnded = false;
    players = {};
    this.exitButtonShown = false;

    this.graphics = this.add.graphics();
    this.hpTexts = {};

    initWebSocket(this);

    this.input.on("pointermove", (p) => {
      pointer = { x: p.x, y: p.y };
      const me = players[id];
      if (!me || me.hp <= 0) return;
      if (ws && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "pointerMove", pointer }));
    });
  }

  update() {
    this.graphics.clear();
    for (const pid in players) {
      const player = players[pid];
      if (!player.parts || !player.parts.head) continue;
      const col = player.color === "black" ? 0x000000 : 0xff0000;
      this.drawStickman(player, col);
    }
  }

  // === Bouton Exit ===
  showExitButton() {
    if (document.getElementById("exit-btn")) return;

    const btn = document.createElement("button");
    btn.id = "exit-btn";
    btn.innerText = "🚪 Quitter";

    Object.assign(btn.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      padding: "15px 40px",
      fontSize: "22px",
      fontWeight: "bold",
      border: "none",
      borderRadius: "12px",
      background: "#d9534f",
      color: "#fff",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      zIndex: "10000",
    });

    btn.onclick = () => {
      console.log("🚪 Exit → retour au menu principal");
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "exitGame" }));
        ws.close(1000, "Exit to menu");
      }
      endGameAndReturn(this);
    };

    document.body.appendChild(btn);
    console.log("✅ Bouton Exit ajouté");
  }

  // === Dessin du stickman ===
  drawStickman(player, color) {
    const b = player.parts;
    const g = this.graphics;
    g.lineStyle(3, color);

    const L = (a, b) => { if (a && b) { g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); } };

    g.beginPath();
    L(b.head, b.chest);
    L(b.chest, b.pelvis);
    L(b.chest, b.armL); L(b.chest, b.armR);
    L(b.armL, b.handL); L(b.armR, b.handR);
    L(b.pelvis, b.legL); L(b.pelvis, b.legR);
    L(b.legL, b.footL); L(b.legR, b.footR);
    g.strokePath();

    if (b.head) g.strokeCircle(b.head.x, b.head.y, 10);
    if (b.handL) g.strokeCircle(b.handL.x, b.handL.y, 4);
    if (b.handR) g.strokeCircle(b.handR.x, b.handR.y, 4);
    if (b.footL) g.strokeCircle(b.footL.x, b.footL.y, 5);
    if (b.footR) g.strokeCircle(b.footR.x, b.footR.y, 5);

    const hp = player.hp ?? 100;
    const ratio = Phaser.Math.Clamp(hp / 100, 0, 1);
    let barColor = 0x00ff00;
    if (ratio < 0.5) barColor = 0xffff00;
    if (ratio < 0.25) barColor = 0xff0000;

    if (b.head) {
      const barWidth = 40, barHeight = 6;
      const x = b.head.x - barWidth / 2;
      const y = b.head.y - 30;

      g.fillStyle(0xaaaaaa);
      g.fillRect(x, y, barWidth, barHeight);
      g.fillStyle(barColor);
      g.fillRect(x, y, barWidth * ratio, barHeight);
      g.lineStyle(1, 0x000000);
      g.strokeRect(x, y, barWidth, barHeight);
    }
  }
}

// === Initialisation Phaser ===
new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#ffffff",
  scene: [MenuScene, StickmenScene],
});

