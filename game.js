// ============================================================
// 戦国ランナー 〜走れ！金の豹〜
// Sengoku Pixel Art Runner Game
// ============================================================

(function () {
  "use strict";

  // --- Canvas Setup ---
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width; // 800
  const H = canvas.height; // 400

  // --- Color Palette (和風) ---
  const COLOR = {
    beni: "#CB4042",
    kin: "#C9A94E",
    ai: "#264348",
    sumi: "#1C1C1C",
    sakura: "#FEDFE1",
    matcha: "#7B8D42",
    murasaki: "#884898",
    sora: "#5B8FA8",
    kumo: "#D4C9B0",
    yama: "#3A5F3A",
    shiro: "#F5F0E6",
  };

  // --- Game State ---
  let state = "title"; // title | playing | gameover
  let score = 0;
  let hiScore = parseInt(localStorage.getItem("sengokuHiScore") || "0", 10);
  let gameSpeed = 4;
  let frameCount = 0;
  let difficultyTimer = 0;

  // --- Sprite Loading (white background removal) ---
  const spriteFrames = []; // will hold processed canvases
  let spritesLoaded = 0;
  const totalSprites = 9;

  function removeWhiteBackground(img) {
    try {
      const offCanvas = document.createElement("canvas");
      offCanvas.width = img.width;
      offCanvas.height = img.height;
      const offCtx = offCanvas.getContext("2d");
      offCtx.drawImage(img, 0, 0);
      const imageData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // Treat near-white pixels as transparent
        if (r > 230 && g > 230 && b > 230) {
          data[i + 3] = 0;
        }
        // Soften light gray edges for smoother blending
        else if (r > 200 && g > 200 && b > 200) {
          data[i + 3] = Math.floor(255 * (1 - (r + g + b - 600) / (693 - 600)));
        }
      }
      offCtx.putImageData(imageData, 0, 0);
      return offCanvas;
    } catch (e) {
      // CORS/tainted canvas fallback: return original image as-is
      return img;
    }
  }

  for (let row = 1; row <= 3; row++) {
    for (let col = 1; col <= 3; col++) {
      const img = new Image();
      const idx = spriteFrames.length;
      spriteFrames.push(null); // placeholder
      // Set crossOrigin only when served via HTTP (not file://)
      if (location.protocol !== "file:") {
        img.crossOrigin = "anonymous";
      }
      img.src = `runner/split_${row}_${col}.png`;
      img.onload = () => {
        spriteFrames[idx] = removeWhiteBackground(img);
        spritesLoaded++;
      };
      img.onerror = () => {
        // If image fails to load, still count it so game doesn't hang
        spriteFrames[idx] = img;
        spritesLoaded++;
      };
    }
  }

  // --- Player ---
  const player = {
    x: 80,
    y: 0,
    w: 100,
    h: 80,
    vy: 0,
    grounded: true,
    frame: 0,
    frameTimer: 0,
    frameInterval: 6,
    groundY: 0,
  };

  // --- Ground ---
  const GROUND_Y = H - 60;

  // --- Parallax Backgrounds ---
  const layers = [
    { speed: 0.3, offset: 0 }, // far mountains
    { speed: 0.6, offset: 0 }, // mid (castle, trees)
    { speed: 1.0, offset: 0 }, // near ground
  ];

  // --- Obstacles ---
  let obstacles = [];
  let obstacleTimer = 0;
  let obstacleInterval = 90;

  // --- Particles (cherry blossoms) ---
  let petals = [];
  const MAX_PETALS = 25;

  // --- Clouds ---
  let clouds = [];

  // ============================================================
  // Pixel Art Drawing Helpers
  // ============================================================

  function drawPixelRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
  }

  // Draw a simple pixel art mountain
  function drawMountain(x, baseY, height, width, color, snowColor) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x + width / 2, baseY - height);
    ctx.lineTo(x + width, baseY);
    ctx.closePath();
    ctx.fill();
    // Snow cap
    if (snowColor) {
      ctx.fillStyle = snowColor;
      ctx.beginPath();
      const capH = height * 0.25;
      const capW = width * 0.25;
      ctx.moveTo(x + width / 2 - capW / 2, baseY - height + capH);
      ctx.lineTo(x + width / 2, baseY - height);
      ctx.lineTo(x + width / 2 + capW / 2, baseY - height + capH);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Draw pixel art castle (tenshu)
  function drawCastle(x, baseY, scale) {
    const s = scale || 1;
    const cx = Math.floor(x);
    const cy = Math.floor(baseY);

    // Base wall
    drawPixelRect(cx, cy - 40 * s, 60 * s, 40 * s, "#8B7355");
    drawPixelRect(cx + 5 * s, cy - 38 * s, 50 * s, 36 * s, COLOR.shiro);

    // Second floor
    drawPixelRect(cx + 10 * s, cy - 65 * s, 40 * s, 28 * s, "#8B7355");
    drawPixelRect(cx + 14 * s, cy - 63 * s, 32 * s, 24 * s, COLOR.shiro);

    // Roof 1
    drawPixelRect(cx - 5 * s, cy - 42 * s, 70 * s, 4 * s, COLOR.ai);
    // Roof 2
    drawPixelRect(cx + 5 * s, cy - 68 * s, 50 * s, 4 * s, COLOR.ai);

    // Top roof (triangular approximation)
    drawPixelRect(cx + 15 * s, cy - 80 * s, 30 * s, 4 * s, COLOR.ai);
    drawPixelRect(cx + 20 * s, cy - 84 * s, 20 * s, 4 * s, COLOR.ai);
    drawPixelRect(cx + 25 * s, cy - 88 * s, 10 * s, 4 * s, COLOR.ai);

    // Shachihoko (golden fish ornament)
    drawPixelRect(cx + 28 * s, cy - 92 * s, 4 * s, 4 * s, COLOR.kin);
    drawPixelRect(cx + 26 * s, cy - 96 * s, 3 * s, 4 * s, COLOR.kin);
    drawPixelRect(cx + 31 * s, cy - 96 * s, 3 * s, 4 * s, COLOR.kin);

    // Windows
    for (let i = 0; i < 3; i++) {
      drawPixelRect(cx + 12 * s + i * 16 * s, cy - 32 * s, 6 * s, 10 * s, COLOR.ai);
    }
    for (let i = 0; i < 2; i++) {
      drawPixelRect(cx + 18 * s + i * 16 * s, cy - 58 * s, 5 * s, 8 * s, COLOR.ai);
    }
  }

  // Draw pixel art torii gate
  function drawTorii(x, baseY, scale) {
    const s = scale || 1;
    const cx = Math.floor(x);
    const cy = Math.floor(baseY);

    // Pillars
    drawPixelRect(cx, cy - 50 * s, 6 * s, 50 * s, COLOR.beni);
    drawPixelRect(cx + 34 * s, cy - 50 * s, 6 * s, 50 * s, COLOR.beni);

    // Top beam (kasagi)
    drawPixelRect(cx - 6 * s, cy - 52 * s, 52 * s, 6 * s, COLOR.beni);

    // Second beam (nuki)
    drawPixelRect(cx + 2 * s, cy - 40 * s, 36 * s, 4 * s, COLOR.beni);

    // Gakuzuka (tablet)
    drawPixelRect(cx + 14 * s, cy - 48 * s, 12 * s, 8 * s, COLOR.kin);
  }

  // Draw cherry blossom tree
  function drawSakuraTree(x, baseY, scale) {
    const s = scale || 1;
    const cx = Math.floor(x);
    const cy = Math.floor(baseY);

    // Trunk
    drawPixelRect(cx + 8 * s, cy - 40 * s, 6 * s, 40 * s, "#6B4226");
    drawPixelRect(cx + 4 * s, cy - 50 * s, 4 * s, 15 * s, "#6B4226");
    drawPixelRect(cx + 14 * s, cy - 45 * s, 4 * s, 12 * s, "#6B4226");

    // Blossom clusters
    const blossomColor = COLOR.sakura;
    const blossomDark = "#F0C0C8";
    const positions = [
      [-2, -55, 18, 14],
      [8, -65, 16, 12],
      [-6, -48, 12, 10],
      [14, -52, 14, 10],
      [4, -60, 10, 8],
    ];
    for (const [bx, by, bw, bh] of positions) {
      drawPixelRect(cx + bx * s, cy + by * s, bw * s, bh * s, blossomDark);
      drawPixelRect(cx + (bx + 1) * s, cy + (by + 1) * s, (bw - 2) * s, (bh - 2) * s, blossomColor);
    }
  }

  // Draw pixel art sun (hinomaru style)
  function drawSun(x, y, r) {
    ctx.fillStyle = COLOR.beni;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ============================================================
  // Obstacle Types (Sengoku Weapons)
  // ============================================================

  function drawKatana(x, y) {
    // Blade
    drawPixelRect(x + 4, y, 4, 40, "#C0C0C0");
    drawPixelRect(x + 3, y, 1, 38, "#E0E0E0");
    // Tsuba (guard)
    drawPixelRect(x, y + 38, 12, 4, COLOR.kin);
    // Handle
    drawPixelRect(x + 3, y + 42, 6, 16, "#4A2800");
    drawPixelRect(x + 4, y + 44, 4, 2, COLOR.beni);
    drawPixelRect(x + 4, y + 48, 4, 2, COLOR.beni);
    drawPixelRect(x + 4, y + 52, 4, 2, COLOR.beni);
  }

  function drawShuriken(x, y, angle) {
    ctx.save();
    ctx.translate(x + 14, y + 14);
    ctx.rotate(angle);
    ctx.fillStyle = "#A0A0A0";
    // 4-pointed star
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((Math.PI / 2) * i);
      ctx.fillRect(-2, -14, 4, 14);
      ctx.fillStyle = "#C0C0C0";
      ctx.fillRect(-3, -14, 6, 4);
      ctx.fillStyle = "#A0A0A0";
      ctx.restore();
    }
    // Center
    ctx.fillStyle = COLOR.sumi;
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  function drawYari(x, y) {
    // Spear shaft
    drawPixelRect(x + 3, y, 4, 55, "#6B4226");
    // Spear head
    drawPixelRect(x + 2, y - 2, 6, 4, "#C0C0C0");
    drawPixelRect(x + 3, y - 6, 4, 4, "#C0C0C0");
    drawPixelRect(x + 4, y - 10, 2, 4, "#E0E0E0");
    // Tassel
    drawPixelRect(x + 1, y + 8, 8, 3, COLOR.beni);
  }

  function drawArrow(x, y) {
    // Shaft
    drawPixelRect(x, y + 3, 40, 3, "#6B4226");
    // Arrowhead
    ctx.fillStyle = "#C0C0C0";
    ctx.beginPath();
    ctx.moveTo(x, y + 4.5);
    ctx.lineTo(x - 8, y);
    ctx.lineTo(x - 8, y + 9);
    ctx.closePath();
    ctx.fill();
    // Fletching
    drawPixelRect(x + 34, y, 6, 3, COLOR.beni);
    drawPixelRect(x + 34, y + 6, 6, 3, COLOR.beni);
  }

  // ============================================================
  // Obstacle Spawning
  // ============================================================

  const OBSTACLE_TYPES = ["katana", "shuriken", "yari", "arrow"];

  function spawnObstacle() {
    const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    let ob;

    switch (type) {
      case "katana":
        ob = { type, x: W + 20, y: GROUND_Y - 58, w: 12, h: 58, hitW: 10, hitH: 50 };
        break;
      case "shuriken":
        const shY = GROUND_Y - 28 - Math.random() * 60;
        ob = { type, x: W + 20, y: shY, w: 28, h: 28, hitW: 22, hitH: 22, angle: 0 };
        break;
      case "yari":
        ob = { type, x: W + 20, y: GROUND_Y - 55, w: 10, h: 55, hitW: 8, hitH: 50 };
        break;
      case "arrow":
        const arY = GROUND_Y - 20 - Math.random() * 40;
        ob = { type, x: W + 20, y: arY, w: 48, h: 9, hitW: 44, hitH: 7 };
        break;
    }
    obstacles.push(ob);
  }

  // ============================================================
  // Cherry Blossom Petals
  // ============================================================

  function spawnPetal() {
    petals.push({
      x: Math.random() * W + W * 0.2,
      y: -10,
      size: 2 + Math.random() * 3,
      speedX: -1 - Math.random() * 2,
      speedY: 0.5 + Math.random() * 1.5,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.03,
      alpha: 0.5 + Math.random() * 0.5,
    });
  }

  // ============================================================
  // Cloud System
  // ============================================================

  function initClouds() {
    clouds = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({
        x: Math.random() * W,
        y: 30 + Math.random() * 80,
        w: 40 + Math.random() * 60,
        h: 15 + Math.random() * 10,
        speed: 0.2 + Math.random() * 0.4,
      });
    }
  }

  // ============================================================
  // Background Rendering
  // ============================================================

  // Pre-computed background elements positions
  const bgElements = {
    mountains: [
      { x: 0, h: 120, w: 250, color: "#2A4A2A" },
      { x: 200, h: 160, w: 300, color: "#1E3E1E" },
      { x: 450, h: 100, w: 200, color: "#2A4A2A" },
      { x: 600, h: 140, w: 280, color: "#1E3E1E" },
      { x: 800, h: 110, w: 220, color: "#2A4A2A" },
    ],
    castles: [{ x: 350, scale: 0.7 }, { x: 850, scale: 0.5 }],
    toriis: [{ x: 150, scale: 0.6 }, { x: 650, scale: 0.5 }],
    trees: [
      { x: 50, scale: 0.6 },
      { x: 250, scale: 0.8 },
      { x: 500, scale: 0.5 },
      { x: 720, scale: 0.7 },
      { x: 900, scale: 0.6 },
    ],
  };

  function drawBackground() {
    // Sky gradient (pixelated bands)
    const skyColors = ["#1A3050", "#264060", "#335878", "#4A7898", COLOR.sora];
    const bandH = Math.ceil((GROUND_Y - 40) / skyColors.length);
    for (let i = 0; i < skyColors.length; i++) {
      drawPixelRect(0, i * bandH, W, bandH + 1, skyColors[i]);
    }

    // Sun
    drawSun(650, 70, 50);

    // Clouds
    ctx.globalAlpha = 0.5;
    for (const c of clouds) {
      drawPixelRect(c.x, c.y, c.w, c.h, COLOR.kumo);
      drawPixelRect(c.x + c.w * 0.15, c.y - c.h * 0.4, c.w * 0.5, c.h * 0.5, COLOR.kumo);
      drawPixelRect(c.x + c.w * 0.4, c.y - c.h * 0.2, c.w * 0.4, c.h * 0.4, COLOR.kumo);
    }
    ctx.globalAlpha = 1;

    // Far layer: Mountains
    const farOff = layers[0].offset;
    for (const m of bgElements.mountains) {
      const mx = ((m.x - farOff) % (W + 300)) - 150;
      drawMountain(mx, GROUND_Y, m.h, m.w, m.color, COLOR.shiro);
    }

    // Mid layer: Castles, Torii, Trees
    const midOff = layers[1].offset;

    for (const t of bgElements.toriis) {
      const tx = ((t.x - midOff) % (W + 200)) - 100;
      drawTorii(tx, GROUND_Y - 5, t.scale);
    }

    for (const c of bgElements.castles) {
      const cx = ((c.x - midOff) % (W + 400)) - 100;
      drawCastle(cx, GROUND_Y - 5, c.scale);
    }

    for (const t of bgElements.trees) {
      const tx = ((t.x - midOff) % (W + 200)) - 50;
      drawSakuraTree(tx, GROUND_Y, t.scale);
    }
  }

  function drawGround() {
    const nearOff = layers[2].offset;

    // Main ground
    drawPixelRect(0, GROUND_Y, W, H - GROUND_Y, "#3A2A18");

    // Ground top edge - stone path
    drawPixelRect(0, GROUND_Y, W, 4, "#706050");
    drawPixelRect(0, GROUND_Y + 4, W, 2, "#5A4A38");

    // Ground texture (pixel stones)
    for (let i = 0; i < 20; i++) {
      const gx = ((i * 45 - nearOff * 0.5) % W + W) % W;
      const gy = GROUND_Y + 10 + (i % 3) * 12;
      const gw = 8 + (i % 4) * 4;
      drawPixelRect(gx, gy, gw, 4, "#4A3828");
    }

    // Grass tufts on ground edge
    for (let i = 0; i < 30; i++) {
      const gx = ((i * 28 - nearOff) % W + W) % W;
      drawPixelRect(gx, GROUND_Y - 4, 3, 4, COLOR.matcha);
      drawPixelRect(gx + 4, GROUND_Y - 6, 2, 6, "#5A7A32");
    }
  }

  // ============================================================
  // UI Drawing
  // ============================================================

  function drawScore() {
    // Score box
    drawPixelRect(10, 10, 180, 36, "rgba(28,28,28,0.7)");
    drawPixelRect(10, 10, 180, 2, COLOR.kin);
    drawPixelRect(10, 44, 180, 2, COLOR.kin);
    drawPixelRect(10, 10, 2, 36, COLOR.kin);
    drawPixelRect(188, 10, 2, 36, COLOR.kin);

    ctx.font = "16px 'DotGothic16', monospace";
    ctx.fillStyle = COLOR.kin;
    ctx.textAlign = "left";
    ctx.fillText("戦功: " + score, 22, 34);

    // Hi-Score
    drawPixelRect(W - 190, 10, 180, 36, "rgba(28,28,28,0.7)");
    drawPixelRect(W - 190, 10, 180, 2, COLOR.beni);
    drawPixelRect(W - 190, 44, 180, 2, COLOR.beni);
    drawPixelRect(W - 190, 10, 2, 36, COLOR.beni);
    drawPixelRect(W - 12, 10, 2, 36, COLOR.beni);

    ctx.fillStyle = COLOR.beni;
    ctx.textAlign = "left";
    ctx.fillText("最高戦功: " + hiScore, W - 178, 34);
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(28,28,28,0.75)";
    ctx.fillRect(0, 0, W, H);

    // Game over banner
    drawPixelRect(W / 2 - 160, H / 2 - 70, 320, 140, "rgba(28,28,28,0.9)");

    // Border
    const bx = W / 2 - 160, by = H / 2 - 70, bw = 320, bh = 140;
    drawPixelRect(bx, by, bw, 3, COLOR.kin);
    drawPixelRect(bx, by + bh - 3, bw, 3, COLOR.kin);
    drawPixelRect(bx, by, 3, bh, COLOR.kin);
    drawPixelRect(bx + bw - 3, by, 3, bh, COLOR.kin);

    // Corner decorations
    drawPixelRect(bx + 6, by + 6, 8, 8, COLOR.beni);
    drawPixelRect(bx + bw - 14, by + 6, 8, 8, COLOR.beni);
    drawPixelRect(bx + 6, by + bh - 14, 8, 8, COLOR.beni);
    drawPixelRect(bx + bw - 14, by + bh - 14, 8, 8, COLOR.beni);

    ctx.font = "28px 'DotGothic16', monospace";
    ctx.fillStyle = COLOR.beni;
    ctx.textAlign = "center";
    ctx.fillText("討死", W / 2, H / 2 - 28);

    ctx.font = "16px 'DotGothic16', monospace";
    ctx.fillStyle = COLOR.kin;
    ctx.fillText("戦功: " + score, W / 2, H / 2 + 5);

    if (score >= hiScore) {
      ctx.fillStyle = COLOR.sakura;
      ctx.fillText("★ 新記録！ ★", W / 2, H / 2 + 28);
    }

    ctx.fillStyle = COLOR.matcha;
    ctx.font = "14px 'DotGothic16', monospace";
    ctx.fillText("スペース / タップ で再出陣", W / 2, H / 2 + 52);
  }

  // ============================================================
  // Player Drawing & Animation
  // ============================================================

  function drawPlayer() {
    const p = player;
    if (spritesLoaded >= totalSprites && spriteFrames[p.frame]) {
      // Draw the processed (white-removed) sprite canvas
      ctx.drawImage(spriteFrames[p.frame], p.x - 10, p.y - 5, p.w + 20, p.h + 10);
    } else {
      // Fallback pixel art leopard
      drawPixelRect(p.x + 10, p.y + 15, 60, 32, COLOR.kin);
      drawPixelRect(p.x + 65, p.y + 8, 22, 24, COLOR.kin);
      drawPixelRect(p.x + 82, p.y + 12, 6, 4, COLOR.sumi);
      // Legs
      const legOffset = Math.sin(frameCount * 0.3) * 6;
      drawPixelRect(p.x + 18, p.y + 45, 6, 18 + legOffset, COLOR.kin);
      drawPixelRect(p.x + 34, p.y + 45, 6, 18 - legOffset, COLOR.kin);
      drawPixelRect(p.x + 50, p.y + 45, 6, 18 + legOffset, COLOR.kin);
      drawPixelRect(p.x + 62, p.y + 45, 6, 18 - legOffset, COLOR.kin);
    }

    // Draw dust particles when running on ground
    if (p.grounded && state === "playing") {
      for (let i = 0; i < 3; i++) {
        const dx = p.x - 5 - Math.random() * 15;
        const dy = GROUND_Y - 4 + Math.random() * 4;
        const ds = 2 + Math.random() * 3;
        ctx.globalAlpha = 0.3 - i * 0.08;
        drawPixelRect(dx, dy, ds, ds, COLOR.kumo);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ============================================================
  // Collision Detection
  // ============================================================

  function checkCollision(ob) {
    const p = player;
    const px = p.x + 16;
    const py = p.y + 12;
    const pw = p.w - 32;
    const ph = p.h - 18;

    const ox = ob.x + (ob.w - ob.hitW) / 2;
    const oy = ob.y + (ob.h - ob.hitH) / 2;

    return px < ox + ob.hitW && px + pw > ox && py < oy + ob.hitH && py + ph > oy;
  }

  // ============================================================
  // Game Init / Reset
  // ============================================================

  function resetGame() {
    score = 0;
    gameSpeed = 4;
    frameCount = 0;
    difficultyTimer = 0;
    obstacles = [];
    obstacleTimer = 0;
    obstacleInterval = 90;
    petals = [];

    player.y = GROUND_Y - player.h;
    player.vy = 0;
    player.grounded = true;
    player.frame = 0;
    player.groundY = GROUND_Y - player.h;

    layers.forEach((l) => (l.offset = 0));
    initClouds();
  }

  // ============================================================
  // Update
  // ============================================================

  function update() {
    if (state !== "playing") return;

    frameCount++;
    difficultyTimer++;

    // Increase difficulty over time
    if (difficultyTimer % 300 === 0) {
      gameSpeed = Math.min(gameSpeed + 0.3, 12);
      obstacleInterval = Math.max(obstacleInterval - 4, 35);
    }

    // Score
    if (frameCount % 6 === 0) {
      score++;
    }

    // Update parallax
    for (const l of layers) {
      l.offset += gameSpeed * l.speed;
    }

    // Update clouds
    for (const c of clouds) {
      c.x -= c.speed + gameSpeed * 0.1;
      if (c.x + c.w < 0) {
        c.x = W + Math.random() * 100;
        c.y = 30 + Math.random() * 80;
      }
    }

    // Player gravity & animation
    if (!player.grounded) {
      player.vy += 0.65;
      player.y += player.vy;
      if (player.y >= player.groundY) {
        player.y = player.groundY;
        player.vy = 0;
        player.grounded = true;
      }
    }

    // Player animation
    player.frameTimer++;
    if (player.frameTimer >= player.frameInterval) {
      player.frameTimer = 0;
      player.frame = (player.frame + 1) % totalSprites;
    }

    // Obstacles
    obstacleTimer++;
    if (obstacleTimer >= obstacleInterval) {
      obstacleTimer = 0;
      spawnObstacle();
      // Randomize next interval
      obstacleInterval = 50 + Math.floor(Math.random() * 50) - Math.floor(gameSpeed * 2);
      obstacleInterval = Math.max(obstacleInterval, 30);
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const ob = obstacles[i];
      ob.x -= gameSpeed;

      if (ob.type === "shuriken") {
        ob.angle = (ob.angle || 0) + 0.15;
      }

      // Remove off-screen
      if (ob.x + ob.w < -20) {
        obstacles.splice(i, 1);
        continue;
      }

      // Collision
      if (checkCollision(ob)) {
        gameOver();
        return;
      }
    }

    // Cherry blossom petals
    if (petals.length < MAX_PETALS && Math.random() < 0.1) {
      spawnPetal();
    }

    for (let i = petals.length - 1; i >= 0; i--) {
      const pt = petals[i];
      pt.x += pt.speedX - gameSpeed * 0.3;
      pt.y += pt.speedY;
      pt.wobble += pt.wobbleSpeed;
      pt.x += Math.sin(pt.wobble) * 0.5;

      if (pt.y > H || pt.x < -20) {
        petals.splice(i, 1);
      }
    }
  }

  // ============================================================
  // Render
  // ============================================================

  function render() {
    ctx.clearRect(0, 0, W, H);

    drawBackground();
    drawGround();

    // Cherry blossom petals (behind player)
    for (const pt of petals) {
      ctx.globalAlpha = pt.alpha;
      drawPixelRect(pt.x, pt.y, pt.size, pt.size, COLOR.sakura);
      drawPixelRect(pt.x + pt.size * 0.3, pt.y - pt.size * 0.3, pt.size * 0.6, pt.size * 0.6, "#FFD0D8");
      ctx.globalAlpha = 1;
    }

    // Draw obstacles
    for (const ob of obstacles) {
      switch (ob.type) {
        case "katana":
          drawKatana(ob.x, ob.y);
          break;
        case "shuriken":
          drawShuriken(ob.x, ob.y, ob.angle);
          break;
        case "yari":
          drawYari(ob.x, ob.y);
          break;
        case "arrow":
          drawArrow(ob.x, ob.y);
          break;
      }
    }

    // Draw player
    drawPlayer();

    // UI
    drawScore();

    // Game Over screen
    if (state === "gameover") {
      drawGameOver();
    }
  }

  // ============================================================
  // Game Over
  // ============================================================

  function gameOver() {
    state = "gameover";
    if (score > hiScore) {
      hiScore = score;
      localStorage.setItem("sengokuHiScore", hiScore.toString());
    }
  }

  // ============================================================
  // Input
  // ============================================================

  function jump() {
    if (state === "playing" && player.grounded) {
      player.vy = -13;
      player.grounded = false;
    } else if (state === "gameover") {
      resetGame();
      state = "playing";
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      jump();
    }
  });

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    jump();
  });

  canvas.addEventListener("mousedown", (e) => {
    if (state === "playing" || state === "gameover") {
      jump();
    }
  });

  // Start button
  const startBtn = document.getElementById("startBtn");
  const overlay = document.getElementById("overlay");

  startBtn.addEventListener("click", () => {
    overlay.classList.add("hidden");
    resetGame();
    state = "playing";
  });

  // Also allow space to start from title
  document.addEventListener("keydown", function startHandler(e) {
    if (state === "title" && (e.code === "Space" || e.code === "Enter")) {
      e.preventDefault();
      overlay.classList.add("hidden");
      resetGame();
      state = "playing";
      document.removeEventListener("keydown", startHandler);
    }
  });

  // ============================================================
  // Game Loop
  // ============================================================

  function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
  }

  // Initialize
  player.groundY = GROUND_Y - player.h;
  player.y = player.groundY;
  initClouds();
  gameLoop();
})();
