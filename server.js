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

const ws = new WebSocket("wss://stickmen-server.onrender.com");
// const ws = new WebSocket("ws://localhost:3000");

let id, color;
let players = {};
let pointer = { x: 400, y: 300 };

class StickmenScene extends Phaser.Scene {
  constructor() {
    super();
  }

  create() {
    this.graphics = this.add.graphics();
    this.hpTexts = {};
    this.replayButtonShown = false;

    // Mouvement du pointeur
    this.input.on("pointermove", (p) => {
      pointer = { x: p.x, y: p.y };
      const me = players[id];
      if (!me || me.hp <= 0) return;
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "pointerMove", pointer }));
    });

    // Messages WebSocket
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);

      // Initialisation
      if (data.type === "init") {
        id = data.id;
        color = data.color;
        console.log("👤 Joueur initialisé:", id, color);
      }

      // Synchronisation des états
      else if (data.type === "state") {
        players = data.players;

        // 🩸 Détection KO depuis le serveur
        const me = players[id];
        if (me && typeof me.hp === "number" && me.hp <= 0 && !this.replayButtonShown) {
          console.log("💀 KO détecté via WebSocket — affichage du bouton Replay");
          this.replayButtonShown = true;
          this.showReplayButton();
        }
      }
    };
  }

  update() {
    this.graphics.clear();

    // Dessine tous les joueurs
    for (const pid in players) {
      const player = players[pid];
      if (!player.parts || !player.parts.head) continue;
      const col = player.color === "black" ? 0x000000 : 0xff0000;
      this.drawStickman(player, col);
    }
  }

  // === 🆕 Bouton Replay ===
  showReplayButton() {
    if (document.getElementById("replay-btn")) return; // déjà affiché

    const btn = document.createElement("button");
    btn.id = "replay-btn";
    btn.innerText = "🔁 Rejouer";

    Object.assign(btn.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      padding: "15px 35px",
      fontSize: "24px",
      fontWeight: "bold",
      border: "none",
      borderRadius: "12px",
      background: "#28a745",
      color: "#fff",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      zIndex: "99999",
      transition: "all 0.2s ease",
    });

    btn.onmouseenter = () => {
      btn.style.background = "#34d058";
      btn.style.transform = "translate(-50%, -50%) scale(1.05)";
    };
    btn.onmouseleave = () => {
      btn.style.background = "#28a745";
      btn.style.transform = "translate(-50%, -50%) scale(1)";
    };

    btn.onclick = () => {
      console.log("🔁 Rechargement du jeu...");
      btn.remove();
      location.reload();
    };

    document.body.appendChild(btn);
    console.log("✅ Bouton Replay ajouté au DOM");
  }

  // === 🎨 Dessin du stickman ===
  drawStickman(player, color) {
    const b = player.parts;
    const g = this.graphics;
    g.lineStyle(3, color);

    const L = (a, b) => {
      if (a && b) {
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
      }
    };

    g.beginPath();
    L(b.head, b.chest);
    L(b.chest, b.pelvis);
    L(b.chest, b.armL);
    L(b.chest, b.armR);
    L(b.armL, b.handL);
    L(b.armR, b.handR);
    L(b.pelvis, b.legL);
    L(b.pelvis, b.legR);
    L(b.legL, b.footL);
    L(b.legR, b.footR);
    g.strokePath();

    // Articulations
    if (b.head) g.strokeCircle(b.head.x, b.head.y, 10);
    if (b.handL) g.strokeCircle(b.handL.x, b.handL.y, 4);
    if (b.handR) g.strokeCircle(b.handR.x, b.handR.y, 4);
    if (b.footL) g.strokeCircle(b.footL.x, b.footL.y, 5);
    if (b.footR) g.strokeCircle(b.footR.x, b.footR.y, 5);

    // ❤️ Barre de vie
    const hp = player.hp !== undefined ? player.hp : 100;
    const ratio = Phaser.Math.Clamp(hp / 100, 0, 1);
    let barColor = 0x00ff00;
    if (ratio < 0.5) barColor = 0xffff00;
    if (ratio < 0.25) barColor = 0xff0000;

    if (b.head) {
      const barWidth = 40;
      const barHeight = 6;
      const x = b.head.x - barWidth / 2;
      const y = b.head.y - 30;

      g.fillStyle(0xaaaaaa);
      g.fillRect(x, y, barWidth, barHeight);
      g.fillStyle(barColor);
      g.fillRect(x, y, barWidth * ratio, barHeight);
      g.lineStyle(1, 0x000000);
      g.strokeRect(x, y, barWidth, barHeight);

      if (!this.hpTexts[player.color]) {
        this.hpTexts[player.color] = this.add.text(0, 0, "HP: 100", {
          font: "12px Arial",
          fill: "#000",
        }).setDepth(10).setOrigin(0.5);
      }

      const hpText = this.hpTexts[player.color];
      hpText.setText(`HP: ${hp}`);
      hpText.x = b.head.x;
      hpText.y = b.head.y - 45;
      hpText.setTint(hp < 25 ? 0xff0000 : 0x000000);
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#ffffff",
  scene: StickmenScene,
});
