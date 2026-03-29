// ============================================================
// Running Animal - HTML5 Canvas Endless Runner
// ============================================================

(function () {
  'use strict';

  // --- Constants ---
  const LOGICAL_W = 800;
  const LOGICAL_H = 300;
  const GROUND_H = 40;
  const GROUND_Y = LOGICAL_H - GROUND_H;

  const GRAVITY = 2500;
  const JUMP_VEL = -720;
  const BASE_SPEED = 300;
  const MAX_SPEED = 700;
  const SPEED_ACCEL = 0.4; // px/s per second

  const TIGER_W = 110;
  const TIGER_H = 110;
  const TIGER_X = 100;

  const GOLD = '#D4A843';
  const GOLD_DARK = '#8B6914';
  const BG_TOP = '#0a0a0a';
  const BG_BOT = '#1a1a2e';

  const FRAME_FILES = [
    'runner/split_1_1.png', 'runner/split_1_2.png', 'runner/split_1_3.png',
    'runner/split_2_1.png', 'runner/split_2_2.png', 'runner/split_2_3.png',
    'runner/split_3_1.png', 'runner/split_3_2.png', 'runner/split_3_3.png',
  ];

  // --- State ---
  const State = { LOADING: 0, TITLE: 1, PLAYING: 2, GAME_OVER: 3 };

  // --- Canvas setup ---
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  let scale = 1;

  function resize() {
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const aspect = LOGICAL_W / LOGICAL_H;
    let w, h;
    if (ww / wh > aspect) {
      h = wh;
      w = h * aspect;
    } else {
      w = ww;
      h = w / aspect;
    }
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = LOGICAL_W;
    canvas.height = LOGICAL_H;
    scale = w / LOGICAL_W;
  }
  window.addEventListener('resize', resize);
  resize();

  // --- Image loading & background removal ---
  const cleanFrames = [];
  let loadProgress = 0;

  function removeBackground(img) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    const id = cx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const diff = Math.max(r, g, b) - Math.min(r, g, b);
      if (lum < 35) {
        d[i + 3] = 0;
      } else if (lum < 55 && diff < 15) {
        d[i + 3] = Math.floor(((lum - 35) / 20) * 255);
      }
      if (lum > 240 && diff < 15) {
        d[i + 3] = 0;
      }
    }
    cx.putImageData(id, 0, 0);
    return c;
  }

  function loadImages() {
    return new Promise((resolve) => {
      let loaded = 0;
      FRAME_FILES.forEach((src, idx) => {
        const img = new Image();
        img.onload = () => {
          cleanFrames[idx] = removeBackground(img);
          loaded++;
          loadProgress = loaded / FRAME_FILES.length;
          if (loaded === FRAME_FILES.length) resolve();
        };
        img.onerror = () => {
          // Fallback: orange rectangle
          const c = document.createElement('canvas');
          c.width = 341; c.height = 341;
          const cx = c.getContext('2d');
          cx.fillStyle = GOLD;
          cx.fillRect(50, 50, 241, 241);
          cleanFrames[idx] = c;
          loaded++;
          loadProgress = loaded / FRAME_FILES.length;
          if (loaded === FRAME_FILES.length) resolve();
        };
        img.src = src;
      });
    });
  }

  // --- Game variables ---
  let state = State.LOADING;
  let gameSpeed = BASE_SPEED;
  let score = 0;
  let highScore = parseInt(localStorage.getItem('runningAnimalHigh') || '0', 10);
  let scoreTimer = 0;
  let blinkTimer = 0;

  // Tiger
  let tigerY = 0;
  let tigerVelY = 0;
  let isOnGround = true;
  let animFrame = 0;
  let animTimer = 0;

  // Obstacles
  let obstacles = [];
  let spawnTimer = 0;
  let nextSpawnTime = 2;

  // Particles
  let dustParticles = [];
  let deathParticles = [];

  // Screen shake
  let shakeTimer = 0;
  let shakeX = 0;
  let shakeY = 0;

  // Parallax
  let bgScroll1 = 0;
  let bgScroll2 = 0;
  let groundScroll = 0;

  // --- Obstacle types ---
  function createObstacle() {
    const types = [
      { w: 30, h: 45, type: 'rock' },
      { w: 20, h: 70, type: 'wall' },
      { w: 55, h: 40, type: 'double' },
    ];
    // Weight: rock more common early, wall/double later
    const speedRatio = (gameSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    let roll = Math.random();
    let t;
    if (roll < 0.5 - speedRatio * 0.15) {
      t = types[0]; // rock
    } else if (roll < 0.8 - speedRatio * 0.1) {
      t = types[1]; // wall
    } else {
      t = types[2]; // double
    }
    return {
      x: LOGICAL_W + 20,
      y: GROUND_Y - t.h,
      w: t.w,
      h: t.h,
      type: t.type,
      passed: false,
    };
  }

  // --- Dust particles ---
  function spawnDust() {
    if (!isOnGround) return;
    dustParticles.push({
      x: TIGER_X + 15 + Math.random() * 10,
      y: GROUND_Y - 2 + Math.random() * 4,
      vx: -40 - Math.random() * 30,
      vy: -15 - Math.random() * 20,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.4 + Math.random() * 0.3,
      size: 2 + Math.random() * 2,
    });
  }

  function spawnDeathParticles() {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 200;
      deathParticles.push({
        x: TIGER_X + TIGER_W / 2,
        y: tigerY + TIGER_H / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6 + Math.random() * 0.5,
        maxLife: 0.6 + Math.random() * 0.5,
        size: 3 + Math.random() * 4,
      });
    }
  }

  // --- Collision (inset AABB) ---
  function checkCollision() {
    const inset = 0.25;
    const tx = TIGER_X + TIGER_W * inset;
    const ty = tigerY + TIGER_H * inset;
    const tw = TIGER_W * (1 - 2 * inset);
    const th = TIGER_H * (1 - 2 * inset);
    for (const ob of obstacles) {
      if (tx < ob.x + ob.w && tx + tw > ob.x && ty < ob.y + ob.h && ty + th > ob.y) {
        return true;
      }
    }
    return false;
  }

  // --- Reset ---
  function resetGame() {
    gameSpeed = BASE_SPEED;
    score = 0;
    scoreTimer = 0;
    tigerY = GROUND_Y - TIGER_H;
    tigerVelY = 0;
    isOnGround = true;
    animFrame = 0;
    animTimer = 0;
    obstacles = [];
    spawnTimer = 0;
    nextSpawnTime = 1.5;
    dustParticles = [];
    deathParticles = [];
    shakeTimer = 0;
    shakeX = 0;
    shakeY = 0;
  }

  // --- Input ---
  let jumpPressed = false;

  function onAction() {
    if (state === State.TITLE) {
      resetGame();
      state = State.PLAYING;
    } else if (state === State.PLAYING) {
      if (isOnGround) {
        tigerVelY = JUMP_VEL;
        isOnGround = false;
      }
    } else if (state === State.GAME_OVER) {
      // Delay restart slightly
      if (shakeTimer <= 0) {
        state = State.TITLE;
      }
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (!jumpPressed) {
        jumpPressed = true;
        onAction();
      }
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') jumpPressed = false;
  });
  canvas.addEventListener('mousedown', (e) => { e.preventDefault(); onAction(); });
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onAction(); }, { passive: false });

  // --- Update ---
  function update(dt) {
    blinkTimer += dt;

    if (state === State.PLAYING) {
      // Speed up
      gameSpeed = Math.min(MAX_SPEED, gameSpeed + SPEED_ACCEL * dt);

      // Score
      scoreTimer += dt;
      if (scoreTimer >= 0.1) {
        scoreTimer -= 0.1;
        score++;
      }

      // Tiger animation
      const frameDur = Math.max(0.04, 0.08 * (BASE_SPEED / gameSpeed));
      animTimer += dt;
      if (animTimer >= frameDur) {
        animTimer -= frameDur;
        animFrame = (animFrame + 1) % 9;
      }

      // Tiger jump
      if (!isOnGround) {
        tigerVelY += GRAVITY * dt;
        tigerY += tigerVelY * dt;
        if (tigerY >= GROUND_Y - TIGER_H) {
          tigerY = GROUND_Y - TIGER_H;
          tigerVelY = 0;
          isOnGround = true;
        }
      }

      // Dust
      if (Math.random() < 0.3) spawnDust();

      // Obstacles
      spawnTimer += dt;
      if (spawnTimer >= nextSpawnTime) {
        spawnTimer = 0;
        const minInterval = Math.max(0.6, 1.8 - (gameSpeed - BASE_SPEED) / 600);
        const maxInterval = minInterval + 0.8;
        nextSpawnTime = minInterval + Math.random() * (maxInterval - minInterval);
        obstacles.push(createObstacle());
      }

      for (const ob of obstacles) {
        ob.x -= gameSpeed * dt;
      }
      obstacles = obstacles.filter((ob) => ob.x + ob.w > -50);

      // Collision
      if (checkCollision()) {
        state = State.GAME_OVER;
        if (score > highScore) {
          highScore = score;
          localStorage.setItem('runningAnimalHigh', String(highScore));
        }
        shakeTimer = 0.3;
        spawnDeathParticles();
      }

      // Parallax
      bgScroll1 = (bgScroll1 + gameSpeed * 0.08 * dt) % LOGICAL_W;
      bgScroll2 = (bgScroll2 + gameSpeed * 0.25 * dt) % LOGICAL_W;
      groundScroll = (groundScroll + gameSpeed * dt) % 40;
    }

    // Shake
    if (shakeTimer > 0) {
      shakeTimer -= dt;
      shakeX = (Math.random() - 0.5) * 6;
      shakeY = (Math.random() - 0.5) * 6;
    } else {
      shakeX = 0;
      shakeY = 0;
    }

    // Particles
    dustParticles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    });
    dustParticles = dustParticles.filter((p) => p.life > 0);

    deathParticles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
      p.life -= dt;
    });
    deathParticles = deathParticles.filter((p) => p.life > 0);
  }

  // --- Drawing helpers ---
  function drawBgGradient() {
    const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
    grad.addColorStop(0, BG_TOP);
    grad.addColorStop(1, BG_BOT);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  }

  function drawMountains(scrollX, y, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    for (let x = -scrollX; x < LOGICAL_W + 200; x += 200) {
      ctx.lineTo(x + 40, y + h);
      ctx.lineTo(x + 100, y);
      ctx.lineTo(x + 160, y + h);
    }
    ctx.lineTo(LOGICAL_W + 200, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  function drawGround() {
    // Ground band
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, GROUND_Y, LOGICAL_W, GROUND_H);

    // Gold surface line
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(LOGICAL_W, GROUND_Y);
    ctx.stroke();

    // Scrolling dashes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let x = -groundScroll; x < LOGICAL_W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 15);
      ctx.lineTo(x + 15, GROUND_Y + 15);
      ctx.stroke();
    }
  }

  function drawObstacle(ob) {
    ctx.fillStyle = '#222';
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = 2;

    if (ob.type === 'rock') {
      // Geometric rock
      ctx.beginPath();
      ctx.moveTo(ob.x + ob.w * 0.5, ob.y);
      ctx.lineTo(ob.x + ob.w, ob.y + ob.h * 0.4);
      ctx.lineTo(ob.x + ob.w * 0.85, ob.y + ob.h);
      ctx.lineTo(ob.x + ob.w * 0.15, ob.y + ob.h);
      ctx.lineTo(ob.x, ob.y + ob.h * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (ob.type === 'wall') {
      // Tall angular wall
      ctx.beginPath();
      ctx.moveTo(ob.x + ob.w * 0.3, ob.y);
      ctx.lineTo(ob.x + ob.w * 0.7, ob.y);
      ctx.lineTo(ob.x + ob.w, ob.y + ob.h * 0.2);
      ctx.lineTo(ob.x + ob.w, ob.y + ob.h);
      ctx.lineTo(ob.x, ob.y + ob.h);
      ctx.lineTo(ob.x, ob.y + ob.h * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (ob.type === 'double') {
      // Two small rocks
      const half = ob.w * 0.4;
      for (let off = 0; off < 2; off++) {
        const ox = ob.x + off * (ob.w * 0.6);
        ctx.beginPath();
        ctx.moveTo(ox + half * 0.5, ob.y);
        ctx.lineTo(ox + half, ob.y + ob.h * 0.35);
        ctx.lineTo(ox + half * 0.85, ob.y + ob.h);
        ctx.lineTo(ox + half * 0.15, ob.y + ob.h);
        ctx.lineTo(ox, ob.y + ob.h * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  function drawTiger() {
    if (cleanFrames.length < 9) return;
    ctx.drawImage(cleanFrames[animFrame], TIGER_X, tigerY, TIGER_W, TIGER_H);
  }

  function drawDust() {
    for (const p of dustParticles) {
      const alpha = (p.life / p.maxLife) * 0.5;
      ctx.fillStyle = `rgba(212,168,67,${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDeathParticles() {
    for (const p of deathParticles) {
      const alpha = p.life / p.maxLife;
      ctx.fillStyle = `rgba(212,168,67,${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHUD() {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    // Score
    ctx.font = '700 20px Orbitron, "Courier New", monospace';
    ctx.fillStyle = GOLD;
    ctx.fillText(String(score).padStart(5, '0'), LOGICAL_W - 15, 12);

    // High score
    ctx.font = '400 12px Orbitron, "Courier New", monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('HI ' + String(highScore).padStart(5, '0'), LOGICAL_W - 15, 36);
  }

  function drawTitleScreen() {
    // Darken
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // Tiger preview (larger, centered)
    if (cleanFrames.length >= 9) {
      const previewFrame = Math.floor(blinkTimer * 8) % 9;
      ctx.drawImage(cleanFrames[previewFrame], LOGICAL_W / 2 - 80, 40, 160, 160);
    }

    // Title
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 32px Orbitron, "Courier New", monospace';
    ctx.fillStyle = GOLD;
    ctx.fillText('RUNNING ANIMAL', LOGICAL_W / 2, 220);

    // Blink text
    if (Math.floor(blinkTimer * 2) % 2 === 0) {
      ctx.font = '400 14px Orbitron, "Courier New", monospace';
      ctx.fillStyle = '#ccc';
      ctx.fillText('PRESS SPACE OR TAP TO START', LOGICAL_W / 2, 258);
    }
  }

  function drawGameOver() {
    // Overlay
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '900 36px Orbitron, "Courier New", monospace';
    ctx.fillStyle = '#e44';
    ctx.fillText('GAME OVER', LOGICAL_W / 2, 100);

    ctx.font = '700 22px Orbitron, "Courier New", monospace';
    ctx.fillStyle = GOLD;
    ctx.fillText('SCORE: ' + String(score).padStart(5, '0'), LOGICAL_W / 2, 150);

    ctx.font = '400 14px Orbitron, "Courier New", monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('BEST: ' + String(highScore).padStart(5, '0'), LOGICAL_W / 2, 180);

    if (shakeTimer <= 0 && Math.floor(blinkTimer * 2) % 2 === 0) {
      ctx.font = '400 14px Orbitron, "Courier New", monospace';
      ctx.fillStyle = '#ccc';
      ctx.fillText('PRESS SPACE OR TAP TO RESTART', LOGICAL_W / 2, 230);
    }
  }

  function drawLoading() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 18px Orbitron, "Courier New", monospace';
    ctx.fillStyle = GOLD;
    ctx.fillText('LOADING...', LOGICAL_W / 2, LOGICAL_H / 2 - 15);

    // Progress bar
    const barW = 200;
    const barH = 8;
    const bx = (LOGICAL_W - barW) / 2;
    const by = LOGICAL_H / 2 + 10;
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, barW, barH);
    ctx.fillStyle = GOLD;
    ctx.fillRect(bx, by, barW * loadProgress, barH);
  }

  // --- Render ---
  function render() {
    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawBgGradient();

    if (state !== State.LOADING) {
      // Parallax backgrounds
      drawMountains(bgScroll1, GROUND_Y - 80, 80, '#111118');
      drawMountains(bgScroll2, GROUND_Y - 45, 45, '#161622');

      drawGround();

      // Obstacles
      for (const ob of obstacles) {
        drawObstacle(ob);
      }

      // Dust
      drawDust();
      drawDeathParticles();

      // Tiger
      drawTiger();

      // HUD
      drawHUD();
    }

    ctx.restore();

    // Overlays (no shake)
    if (state === State.LOADING) drawLoading();
    else if (state === State.TITLE) drawTitleScreen();
    else if (state === State.GAME_OVER) drawGameOver();
  }

  // --- Main loop ---
  let lastTime = 0;

  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.033);
    lastTime = timestamp;

    update(dt);
    render();
    requestAnimationFrame(gameLoop);
  }

  // --- Start ---
  async function init() {
    state = State.LOADING;
    // Draw initial loading screen
    drawBgGradient();
    drawLoading();

    await loadImages();

    tigerY = GROUND_Y - TIGER_H;
    state = State.TITLE;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  init();
})();
