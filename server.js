<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Stickman Physique</title>
  <style>
    body { margin: 0; overflow: hidden; background: #f0f0f0; }
    canvas { display: block; background: #fff; }
  </style>
</head>
<body>
  <canvas id="game"></canvas>

  <script>
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    canvas.width = 800;
    canvas.height = 600;

    const ws = new WebSocket("ws://localhost:3000");
    let playerId = null;
    let color = "black";
    let players = {};
    let pointer = { x: 400, y: 300 };

    // === Connexion WebSocket ===
    ws.onopen = () => console.log("✅ Connecté au serveur Stickman");

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);

      if (data.type === "init") {
        playerId = data.id;
        color = data.color;
        console.log(`🎮 Joueur initialisé : ${playerId} (${color})`);
      }

      if (data.type === "state") {
        players = data.players;
      }

      if (data.type === "goToMenu") {
        alert("Partie terminée !");
        location.reload();
      }
    };

    // === Gestion du pointeur ===
    window.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    });

    // ✅ Envoi constant du pointeur (même sans mouvement)
    setInterval(() => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "pointerMove", pointer }));
      }
    }, 33); // ~30 FPS

    // === Rendu graphique ===
    function drawStickman(s) {
      const p = s.parts;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(p.head.x, p.head.y);
      ctx.lineTo(p.chest.x, p.chest.y);
      ctx.lineTo(p.pelvis.x, p.pelvis.y);
      ctx.moveTo(p.chest.x, p.chest.y);
      ctx.lineTo(p.armL.x, p.armL.y);
      ctx.moveTo(p.chest.x, p.chest.y);
      ctx.lineTo(p.armR.x, p.armR.y);
      ctx.moveTo(p.pelvis.x, p.pelvis.y);
      ctx.lineTo(p.legL.x, p.legL.y);
      ctx.moveTo(p.pelvis.x, p.pelvis.y);
      ctx.lineTo(p.legR.x, p.legR.y);
      ctx.stroke();

      // tête
      ctx.beginPath();
      ctx.arc(p.head.x, p.head.y, 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const id in players) {
        drawStickman(players[id]);
      }

      requestAnimationFrame(loop);
    }

    loop();

    // === Sortie de jeu ===
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        ws.send(JSON.stringify({ type: "exitGame" }));
      }
    });
  </script>
</body>
</html>
