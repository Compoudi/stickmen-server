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
    // Corps
    L(b.head, b.chest);
    L(b.chest, b.pelvis);
    // Bras
    L(b.chest, b.armL);
    L(b.chest, b.armR);
    if (b.armL && b.handL) L(b.armL, b.handL);
    if (b.armR && b.handR) L(b.armR, b.handR);
    // Jambes
    L(b.pelvis, b.legL);
    L(b.pelvis, b.legR);
    if (b.legL && b.footL) L(b.legL, b.footL);
    if (b.legR && b.footR) L(b.legR, b.footR);

    g.strokePath();

    // Cercles des articulations
    g.strokeCircle(b.head.x, b.head.y, 10); // tête
    if (b.handL) g.strokeCircle(b.handL.x, b.handL.y, 5);
    if (b.handR) g.strokeCircle(b.handR.x, b.handR.y, 5);
    if (b.footL) g.strokeCircle(b.footL.x, b.footL.y, 6);
    if (b.footR) g.strokeCircle(b.footR.x, b.footR.y, 6);
  }


new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#ffffff",
  scene: StickmenScene
});
