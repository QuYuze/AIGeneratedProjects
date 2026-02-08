'use strict';

// Canvas setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Simple input handler: track pressed keys
const input = { keys: new Set(), prev: new Set(), just: new Set() };
window.addEventListener('keydown', (e) => input.keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));

// Centralized mouse input (canvas-relative)
const mouse = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  leftDown: false,
  leftJust: false,
  prevLeftDown: false,
};
function toCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}
canvas.addEventListener('mousemove', (e) => {
  const p = toCanvasPos(e);
  mouse.x = p.x;
  mouse.y = p.y;
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) mouse.leftDown = true;
});
canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.leftDown = false;
});
// Player object positioned near the bottom center
const player = {
  w: 40,
  h: 40,
  x: canvas.width / 2 - 20,
  y: canvas.height - 40 - 20,
  speed: 250, // pixels per second
  color: '#39f',
  bullets: [],
  shootCooldown: 0,
  fireRate: 0.2, // seconds per shot
  lives: 3,
  invincibleTimer: 0,
  invincibleDuration: 1.0,
};

class Bullet {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 4;
    this.speed = 450;
    this.color = '#fff';
  }
  update(dt) {
    this.y -= this.speed * dt;
  }
  offscreen() {
    return this.y + this.r < 0;
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Enemy bullet (distinct visuals and movement)
class EnemyBullet {
  constructor(x, y, vx, vy, speed) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.speed = speed;
    this.r = 4;
    this.color = '#ff9';
  }
  update(dt) {
    this.x += this.vx * this.speed * dt;
    this.y += this.vy * this.speed * dt;
  }
  offscreen() {
    return (
      this.x + this.r < 0 ||
      this.y + this.r < 0 ||
      this.x - this.r > canvas.width ||
      this.y - this.r > canvas.height
    );
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Enemy management
const game = {
  enemies: [],
  enemySpawnCooldown: 0,
  enemySpawnRate: 1.0, // seconds per enemy
  score: 0,
  state: 'intro', // intro | playing | help | paused | confirmEnd | gameover
  fxExplosions: [],
  shakeTime: 0,
  shakeMagnitude: 0,
  stars: [],
  menuIndex: 0, // 0: Start, 1: Help
  pauseMenuIndex: 0, // 0: Continue, 1: Restart, 2: End Game
  confirmIndex: 1, // 0: Yes, 1: No (default No)
  enemyBullets: [],
  enemyFireMin: 1.0,
  enemyFireMax: 2.0,
  enemyBulletSpeed: 200,
};

class Enemy {
  constructor(x, y) {
    this.w = 30;
    this.h = 30;
    this.x = x;
    this.y = y;
    this.speed = 120;
    this.color = '#f33';
    this.shootCooldown = game.enemyFireMin + Math.random() * (game.enemyFireMax - game.enemyFireMin);
  }
  update(dt) {
    this.y += this.speed * dt;
    // Shooting timer
    this.shootCooldown -= dt;
    if (this.shootCooldown <= 0) {
      const px = player.x + player.w / 2;
      const py = player.y + player.h / 2;
      const ex = this.x + this.w / 2;
      const ey = this.y + this.h / 2;
      const dx = px - ex;
      const dy = py - ey;
      const len = Math.hypot(dx, dy) || 1;
      // Fairness: skip firing if too close to the player to avoid instant hits
      if (len < 30) {
        this.shootCooldown = 0.15;
      } else {
        const nx = dx / len;
        const ny = dy / len;
        const offset = this.h / 2 + 6;
        const sx = ex + nx * offset;
        const sy = ey + ny * offset;
        game.enemyBullets.push(new EnemyBullet(sx, sy, nx, ny, game.enemyBulletSpeed));
        this.shootCooldown = game.enemyFireMin + Math.random() * (game.enemyFireMax - game.enemyFireMin);
      }
    }
  }
  offscreen() {
    return this.y > canvas.height;
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.w, this.h);
  }
}

class Explosion {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 0;
    this.maxR = 18;
    this.alpha = 1;
    this.grow = 140; // px/sec
    this.fade = 3.2; // alpha/sec
    this.color = '#fff';
  }
  update(dt) {
    this.r = Math.min(this.maxR, this.r + this.grow * dt);
    this.alpha = Math.max(0, this.alpha - this.fade * dt);
  }
  done() {
    return this.alpha <= 0;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function triggerShake(duration = 0.2, magnitude = 4) {
  game.shakeTime = duration;
  game.shakeMagnitude = magnitude;
}

function updateShake(dt) {
  game.shakeTime = Math.max(0, game.shakeTime - dt);
}

function renderWithShakeStart() {
  if (game.shakeTime > 0) {
    const sx = (Math.random() * 2 - 1) * game.shakeMagnitude;
    const sy = (Math.random() * 2 - 1) * game.shakeMagnitude;
    ctx.save();
    ctx.translate(sx, sy);
    return true;
  }
  return false;
}

function renderWithShakeEnd(applied) {
  if (applied) ctx.restore();
}

// Update: game logic (kept separate from rendering)
function update(dt) {
  // Compute one-shot key presses for menus
  input.just = new Set([...input.keys].filter((k) => !input.prev.has(k)));
  input.prev = new Set(input.keys);
  mouse.leftJust = mouse.leftDown && !mouse.prevLeftDown;
  mouse.prevLeftDown = mouse.leftDown;

  // Pause/resume toggle only valid while playing or paused
  if (game.state === 'playing') {
    if (input.just.has('p') || input.just.has('escape')) {
      game.pauseMenuIndex = 0;
      game.state = 'paused';
      return;
    }
  } else if (game.state === 'paused') {
    const pmRects = pauseMenuOptionRects();
    const hoverIdx = rectIndexAtPoint(pmRects, mouse.x, mouse.y);
    if (hoverIdx !== -1) game.pauseMenuIndex = hoverIdx;
    if (input.just.has('arrowdown')) game.pauseMenuIndex = Math.min(2, game.pauseMenuIndex + 1);
    if (input.just.has('arrowup')) game.pauseMenuIndex = Math.max(0, game.pauseMenuIndex - 1);
    if (input.just.has('enter')) {
      if (game.pauseMenuIndex === 0) {
        game.state = 'playing';
      } else if (game.pauseMenuIndex === 1) {
        resetGame();
        game.state = 'playing';
      } else if (game.pauseMenuIndex === 2) {
        game.confirmIndex = 1; // default No
        game.state = 'confirmEnd';
      }
      return;
    }
    if (mouse.leftJust) {
      if (game.pauseMenuIndex === 0) {
        game.state = 'playing';
      } else if (game.pauseMenuIndex === 1) {
        resetGame();
        game.state = 'playing';
      } else if (game.pauseMenuIndex === 2) {
        game.confirmIndex = 1;
        game.state = 'confirmEnd';
      }
      return;
    }
    if (input.just.has('p') || input.just.has('escape')) game.state = 'playing';
    // Skip gameplay updates while paused
    return;
  } else if (game.state === 'confirmEnd') {
    const cfRects = confirmEndOptionRects();
    const cfHover = rectIndexAtPoint(cfRects, mouse.x, mouse.y);
    if (cfHover !== -1) game.confirmIndex = cfHover;
    if (input.just.has('arrowdown')) game.confirmIndex = Math.min(1, game.confirmIndex + 1);
    if (input.just.has('arrowup')) game.confirmIndex = Math.max(0, game.confirmIndex - 1);
    if (input.just.has('escape')) {
      game.state = 'paused';
      return;
    }
    if (input.just.has('enter')) {
      if (game.confirmIndex === 0) {
        resetGame();
        game.state = 'intro';
      } else {
        game.state = 'paused';
      }
      return;
    }
    if (mouse.leftJust) {
      if (game.confirmIndex === 0) {
        resetGame();
        game.state = 'intro';
      } else {
        game.state = 'paused';
      }
      return;
    }
    // Skip gameplay updates while in confirmation
    return;
  }

  if (game.state === 'intro') {
    updateIntro();
    const inRects = introMenuOptionRects();
    const inHover = rectIndexAtPoint(inRects, mouse.x, mouse.y);
    if (inHover !== -1) game.menuIndex = inHover;
    if (mouse.leftJust) {
      if (game.menuIndex === 0) {
        resetGame();
        game.state = 'playing';
      } else {
        game.state = 'help';
      }
    }
    return;
  }
  if (game.state === 'help') {
    updateHelp();
    if (mouse.leftJust) {
      game.state = 'intro';
    }
    return;
  }
  if (game.state === 'gameover') {
    const restart = input.just.has('enter');
    if (restart) {
      resetGame();
      game.state = 'playing';
    }
    if (mouse.leftJust) {
      resetGame();
      game.state = 'playing';
    }
    return;
  }
  updatePlayer(dt);
  updateBullets(dt);
  updateEnemyBullets(dt);
  updateEnemies(dt);
  checkCollisions();
  checkPlayerDamage();
  checkEnemyBulletHitsPlayer();
  updateShake(dt);
  updateExplosions(dt);
  updateStars(dt);
}

// Render: draw everything (kept separate from update)
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (game.state === 'intro') {
    drawIntro();
    return;
  }
  if (game.state === 'help') {
    drawHelp();
    return;
  }
  if (game.state === 'gameover') {
    drawGameOver();
    return;
  }
  const shaken = (game.state === 'paused' || game.state === 'confirmEnd') ? false : renderWithShakeStart();
  renderStars();
  const blinking = player.invincibleTimer > 0 && Math.floor(player.invincibleTimer * 10) % 2 === 0;
  if (!blinking) {
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.w, player.h);
  }

  renderBullets();
  renderEnemyBullets();
  renderEnemies();
  renderExplosions();
  renderScore();
  renderLivesText();
  renderWithShakeEnd(shaken);

  if (game.state === 'paused') {
    drawPauseMenu();
  } else if (game.state === 'confirmEnd') {
    drawConfirmEnd();
  }
}

// Game loop: runs every frame with requestAnimationFrame
// - Calculates a time delta (dt)
// - Calls update() then render()
let lastTime = 0;
function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // clamp dt to avoid large jumps
  lastTime = timestamp;

  update(dt);
  render();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Player movement:
// - Reads Arrow keys or WASD
// - Moves at constant speed using dt
// - Stays within canvas bounds
function updatePlayer(dt) {
  player.invincibleTimer = Math.max(0, player.invincibleTimer - dt);
  if (player.invincibleTimer > 0) {
    return;
  }
  // Mouse-based X/Y follow with smoothing
  const targetX = Math.max(0, Math.min(canvas.width - player.w, mouse.x - player.w / 2));
  const targetY = Math.max(0, Math.min(canvas.height - player.h, mouse.y - player.h / 2));
  const followSpeed = 8;
  const t = Math.min(1, followSpeed * dt);
  player.x += (targetX - player.x) * t;
  player.y += (targetY - player.y) * t;
  // Optional keyboard influence (small nudge)
  let dx = 0, dy = 0;
  if (input.keys.has('arrowleft') || input.keys.has('a')) dx -= 1;
  if (input.keys.has('arrowright') || input.keys.has('d')) dx += 1;
  if (input.keys.has('arrowup') || input.keys.has('w')) dy -= 1;
  if (input.keys.has('arrowdown') || input.keys.has('s')) dy += 1;
  player.x += dx * player.speed * dt * 0.3;
  player.y += dy * player.speed * dt * 0.3;

  // Clamp to canvas bounds
  if (player.x < 0) player.x = 0;
  if (player.y < 0) player.y = 0;
  if (player.x + player.w > canvas.width) player.x = canvas.width - player.w;
  if (player.y + player.h > canvas.height) player.y = canvas.height - player.h;

  // Shooting (Space)
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  const shootPressed =
    input.keys.has(' ') ||
    input.keys.has('space') ||
    input.keys.has('spacebar') ||
    mouse.leftDown;
  if (shootPressed && player.shootCooldown === 0) {
    const bx = player.x + player.w / 2;
    const by = player.y;
    player.bullets.push(new Bullet(bx, by));
    player.shootCooldown = player.fireRate;
  }
}

function updateBullets(dt) {
  for (let i = 0; i < player.bullets.length; i++) {
    player.bullets[i].update(dt);
  }
  player.bullets = player.bullets.filter((b) => !b.offscreen());
}

function renderBullets() {
  for (let i = 0; i < player.bullets.length; i++) {
    player.bullets[i].draw(ctx);
  }
}

function updateEnemyBullets(dt) {
  for (let i = 0; i < game.enemyBullets.length; i++) {
    game.enemyBullets[i].update(dt);
  }
  game.enemyBullets = game.enemyBullets.filter((b) => !b.offscreen());
}

function renderEnemyBullets() {
  for (let i = 0; i < game.enemyBullets.length; i++) {
    game.enemyBullets[i].draw(ctx);
  }
}

function updateEnemies(dt) {
  // Spawn timer
  game.enemySpawnCooldown -= dt;
  if (game.enemySpawnCooldown <= 0) {
    const w = 30;
    const x = Math.random() * (canvas.width - w);
    const y = -w;
    game.enemies.push(new Enemy(x, y));
    game.enemySpawnCooldown = game.enemySpawnRate;
  }

  // Move and cull
  for (let i = 0; i < game.enemies.length; i++) {
    game.enemies[i].update(dt);
  }
  game.enemies = game.enemies.filter((e) => !e.offscreen());
}

function renderEnemies() {
  for (let i = 0; i < game.enemies.length; i++) {
    game.enemies[i].draw(ctx);
  }
}

function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function bulletRect(b) {
  const size = b.r * 2;
  return { x: b.x - b.r, y: b.y - b.r, w: size, h: size };
}

function playerRect() {
  return { x: player.x, y: player.y, w: player.w, h: player.h };
}

function checkCollisions() {
  if (player.bullets.length === 0 || game.enemies.length === 0) return;
  const bulletsToRemove = new Set();
  const enemiesToRemove = new Set();

  for (let ei = 0; ei < game.enemies.length; ei++) {
    const e = game.enemies[ei];
    for (let bi = 0; bi < player.bullets.length; bi++) {
      if (bulletsToRemove.has(bi)) continue;
      const b = player.bullets[bi];
      const br = bulletRect(b);
      if (aabb(br.x, br.y, br.w, br.h, e.x, e.y, e.w, e.h)) {
        bulletsToRemove.add(bi);
        enemiesToRemove.add(ei);
        game.fxExplosions.push(new Explosion(e.x + e.w / 2, e.y + e.h / 2));
        triggerShake(0.15, 4);
        break;
      }
    }
  }

  if (bulletsToRemove.size > 0) {
    player.bullets = player.bullets.filter((_, i) => !bulletsToRemove.has(i));
  }
  if (enemiesToRemove.size > 0) {
    game.enemies = game.enemies.filter((_, i) => !enemiesToRemove.has(i));
    game.score += enemiesToRemove.size;
  }
}

function checkEnemyBulletHitsPlayer() {
  if (player.invincibleTimer > 0 || game.enemyBullets.length === 0) return;
  const pr = playerRect();
  const removeSet = new Set();
  for (let i = 0; i < game.enemyBullets.length; i++) {
    const b = game.enemyBullets[i];
    const br = bulletRect(b);
    if (aabb(br.x, br.y, br.w, br.h, pr.x, pr.y, pr.w, pr.h)) {
      damagePlayerFromBullet();
      removeSet.add(i);
      break;
    }
  }
  if (removeSet.size > 0) {
    game.enemyBullets = game.enemyBullets.filter((_, i) => !removeSet.has(i));
  }
}

function renderScore() {
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(`Score: ${game.score}`, 8, 16);
}

function renderLivesText() {
  ctx.fillStyle = '#e33';
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`Lives: ${player.lives}`, 8, 34);
}

function damagePlayer(enemyIndex) {
  if (player.invincibleTimer > 0) return;
  player.lives = Math.max(0, player.lives - 1);
  player.invincibleTimer = player.invincibleDuration;
  game.enemies.splice(enemyIndex, 1);
  if (player.lives === 0) {
    game.state = 'gameover';
  }
  triggerShake(0.25, 6);
}

function damagePlayerFromBullet() {
  if (player.invincibleTimer > 0) return;
  player.lives = Math.max(0, player.lives - 1);
  player.invincibleTimer = player.invincibleDuration;
  if (player.lives === 0) {
    game.state = 'gameover';
  }
  triggerShake(0.25, 6);
}

function checkPlayerDamage() {
  if (player.invincibleTimer > 0 || game.enemies.length === 0) return;
  const pr = playerRect();
  for (let i = 0; i < game.enemies.length; i++) {
    const e = game.enemies[i];
    if (aabb(pr.x, pr.y, pr.w, pr.h, e.x, e.y, e.w, e.h)) {
      damagePlayer(i);
      break;
    }
  }
}

function resetGame() {
  player.lives = 3;
  player.invincibleTimer = 0;
  player.shootCooldown = 0;
  player.bullets = [];
  player.x = canvas.width / 2 - player.w / 2;
  player.y = canvas.height - player.h - 20;
  game.enemies = [];
  game.enemySpawnCooldown = 0;
  game.score = 0;
  game.fxExplosions = [];
  game.enemyBullets = [];
  game.shakeTime = 0;
  game.shakeMagnitude = 0;
  initStars(120);
  game.menuIndex = 0;
}

function drawGameOver() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Press Enter to restart', canvas.width / 2, canvas.height / 2 + 24);
}

function updateExplosions(dt) {
  for (let i = 0; i < game.fxExplosions.length; i++) {
    game.fxExplosions[i].update(dt);
  }
  game.fxExplosions = game.fxExplosions.filter((fx) => !fx.done());
}

function renderExplosions() {
  for (let i = 0; i < game.fxExplosions.length; i++) {
    game.fxExplosions[i].draw(ctx);
  }
}

class Star {
  constructor(x, y, size, speed, color) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.speed = speed;
    this.color = color;
  }
  update(dt) {
    this.y += this.speed * dt;
    if (this.y > canvas.height + this.size) {
      this.y = -this.size;
      this.x = Math.random() * canvas.width;
      this.speed = 40 + Math.random() * 80;
      this.size = 1 + Math.random() * 2;
    }
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}

function initStars(n) {
  const palette = ['#555', '#888', '#aaa'];
  game.stars = [];
  for (let i = 0; i < n; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const size = 1 + Math.random() * 2;
    const speed = 40 + Math.random() * 80;
    const color = palette[(Math.random() * palette.length) | 0];
    game.stars.push(new Star(x, y, size, speed, color));
  }
}

function updateStars(dt) {
  for (let i = 0; i < game.stars.length; i++) {
    game.stars[i].update(dt);
  }
}

function renderStars() {
  for (let i = 0; i < game.stars.length; i++) {
    game.stars[i].draw(ctx);
  }
}
initStars(120);

function updateIntro() {
  if (input.just.has('arrowdown')) game.menuIndex = Math.min(1, game.menuIndex + 1);
  if (input.just.has('arrowup')) game.menuIndex = Math.max(0, game.menuIndex - 1);
  if (input.just.has('enter')) {
    if (game.menuIndex === 0) {
      resetGame();
      game.state = 'playing';
    } else {
      game.state = 'help';
    }
  }
}

function drawIntro() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '28px system-ui, sans-serif';
  ctx.fillText('ShootEmUp', canvas.width / 2, canvas.height / 2 - 60);

  const options = ['Start', 'Help'];
  ctx.font = '18px system-ui, sans-serif';
  for (let i = 0; i < options.length; i++) {
    const y = canvas.height / 2 - 10 + i * 28;
    const selected = i === game.menuIndex;
    ctx.fillStyle = selected ? '#ff0' : '#ccc';
    ctx.fillText(options[i], canvas.width / 2, y);
  }
}

function updateHelp() {
  if (input.just.has('escape') || input.just.has('enter')) {
    game.state = 'intro';
  }
}

function drawHelp() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText('Help', 40, 60);
  ctx.font = '16px system-ui, sans-serif';
  let y = 100;
  const lines = [
    'Movement: Mouse X (smooth), optional Arrow Left/Right or A/D',
    'Shoot: Space or Left Click',
    'Pause/Unpause: P or Esc',
    'Menu Navigation: Arrow Up/Down or Hover with Mouse',
    'Select Menu Option: Enter or Left Click',
    'Confirm End: Up/Down + Enter or Left Click',
    'Game Over: Enter or Click to Restart',
    'Score: +1 per enemy destroyed',
    'Lives: hearts top-left, brief blink after hit',
  ];
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 40, y);
    y += 24;
  }
}

function drawPauseMenu() {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillText('Pause Menu', canvas.width / 2, canvas.height / 2 - 50);
  const options = ['Continue', 'Restart', 'End Game'];
  ctx.font = '18px system-ui, sans-serif';
  for (let i = 0; i < options.length; i++) {
    const y = canvas.height / 2 - 10 + i * 26;
    const selected = i === game.pauseMenuIndex;
    ctx.fillStyle = selected ? '#ff0' : '#ccc';
    ctx.fillText(options[i], canvas.width / 2, y);
  }
  ctx.restore();
}

function drawConfirmEnd() {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillText('End current game?', canvas.width / 2, canvas.height / 2 - 50);
  const options = ['Yes', 'No'];
  ctx.font = '18px system-ui, sans-serif';
  for (let i = 0; i < options.length; i++) {
    const y = canvas.height / 2 - 10 + i * 26;
    const selected = i === game.confirmIndex;
    ctx.fillStyle = selected ? '#ff0' : '#ccc';
    ctx.fillText(options[i], canvas.width / 2, y);
  }
  ctx.restore();
}

// Menu hitboxes and helpers
function rectIndexAtPoint(rects, px, py) {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
  }
  return -1;
}
function introMenuOptionRects() {
  const optionsY0 = canvas.height / 2 - 10;
  const h = 24, w = 220;
  return [
    { x: canvas.width / 2 - w / 2, y: optionsY0 + 0 * 28 - h / 2, w, h },
    { x: canvas.width / 2 - w / 2, y: optionsY0 + 1 * 28 - h / 2, w, h },
  ];
}
function pauseMenuOptionRects() {
  const optionsY0 = canvas.height / 2 - 10;
  const h = 24, w = 240;
  return [
    { x: canvas.width / 2 - w / 2, y: optionsY0 + 0 * 26 - h / 2, w, h },
    { x: canvas.width / 2 - w / 2, y: optionsY0 + 1 * 26 - h / 2, w, h },
    { x: canvas.width / 2 - w / 2, y: optionsY0 + 2 * 26 - h / 2, w, h },
  ];
}
function confirmEndOptionRects() {
  const optionsY0 = canvas.height / 2 - 10;
  const h = 24, w = 220;
  return [
    { x: canvas.width / 2 - w / 2, y: optionsY0 + 0 * 26 - h / 2, w, h },
    { x: canvas.width / 2 - w / 2, y: optionsY0 + 1 * 26 - h / 2, w, h },
  ];
}
