// Initialisation CrazyGames SDK après chargement
window.addEventListener("load", () => {
  if (window.CrazyGames) {
    const crazySDK = window.CrazyGames.CrazySDK.getInstance();
    crazySDK.init();
    crazySDK.gameplayStart();
    console.log("CrazyGames SDK initialisé ✅");
  }
});



const ws = new WebSocket("wss://ton-serveur-en-ligne.onrender.com");

let id, color;
let players = {};
let pointer = { x: 400, y: 300 };

class StickmenScene extends Phaser.Scene {
  constructor() { super(); }

  create() {
    this.graphics = this.add.graphics();
    this.input.on("pointermove", (p) => {
      pointer = { x: p.x, y: p.y };
      ws.send(JSON.stringify({ type: "pointerMove", pointer }));
    });

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === "init") { id = data.id; color = data.color; }
      else if (data.type === "state") players = data.players;
    };
  }

  update() {
    this.graphics.clear();
    for (const pid in players) {
      const p = players[pid];
      if (!p.parts || !p.parts.head) continue;
      const col = p.color === "black" ? 0x000000 : 0xff0000;
      this.drawStickman(p.parts, col);
    }
  }

  drawStickman(b, color) {
    const g = this.graphics;
    g.lineStyle(3, color);
    const L = (a, b) => { g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); };
    g.beginPath();
    L(b.head, b.chest);
    L(b.chest, b.pelvis);
    L(b.chest, b.armL);
    L(b.chest, b.armR);
    L(b.pelvis, b.legL);
    L(b.pelvis, b.legR);
    g.strokePath();
    g.strokeCircle(b.head.x, b.head.y, 10);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#ffffff",
  scene: StickmenScene
});
