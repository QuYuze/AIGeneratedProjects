'use strict';

// Canvas setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

loadAssets();
// Simple input handler: track pressed keys
const input = { keys: new Set(), prev: new Set(), just: new Set() };
window.addEventListener('keydown', (e) => input.keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));

// Combat constants
const ENEMY_INITIAL_HP = 150;
const DAMAGE_PLAYER_BULLET = 50;
const LS_HIGH_SCORE_KEY = 'shootEmUp:highScore';
const ABILITY_MAX_LEVEL = 3;
const PROGRESS_THRESHOLDS = [2, 30, 100];
const DROP_PROB_BY_TIER = { 1: 0.2, 2: 0.1, 3: 0.05 };
const BULLET_SPEED_BASE = 450;
const BULLET_SPEED_INC = 100;
const SPREAD_CONE_DEG = 28;
// Normal enemy caps by kill thresholds
const NORMAL_CAP_LT5 = 2;
const NORMAL_CAP_LT10 = 5;
const NORMAL_CAP_NO_LIMIT_THRESHOLD = 10;
// Stage thresholds
const STAGE_FAST_SPAWN_AT = 100;
const STAGE_ELITE_CAP_INCREASE_AT = 150;
const STAGE_DUAL_ELITE_AT = 300;
function currentStage(kills) {
  if (kills >= STAGE_DUAL_ELITE_AT) return 3;
  if (kills >= STAGE_ELITE_CAP_INCREASE_AT) return 2;
  if (kills >= STAGE_FAST_SPAWN_AT) return 1;
  return 0;
}
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
  lives: 5,
  invincibleTimer: 0,
  invincibleDuration: 3.0,
};

class Bullet {
  constructor(x, y, vx = 0, vy = -1, speed = BULLET_SPEED_BASE, damage = DAMAGE_PLAYER_BULLET) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = 4;
    this.speed = speed;
    this.damage = damage;
    this.color = '#fff';
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
  highScore: 0,
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
  powerUps: [],
  abilities: { spread: 0, damage: 0, speed: 0 },
  kills: 0,
  nextEliteAt: 30,
  extraLifeMessageTimer: 0,
  eliteAlive: false,
  killsAtLastEliteDeath: 0,
  alertText: '',
  alertTimer: 0,
  alertStageShown: -1,
  debugMode: false,
  debugArmed: false,
  debugInputBuffer: '',
  debugBlinkTimer: 0,
};
// High score load
function loadHighScore() {
  try {
    const v = localStorage.getItem(LS_HIGH_SCORE_KEY);
    const n = parseInt(v ?? '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch (_) {
    return 0;
  }
}
function saveHighScoreSafe(n) {
  try {
    localStorage.setItem(LS_HIGH_SCORE_KEY, String(n));
  } catch (_) {}
}
function updateHighScoreIfNeeded() {
  if (game.debugMode) return;
  if (game.score > game.highScore) {
    game.highScore = game.score;
    saveHighScoreSafe(game.highScore);
  }
}
game.highScore = loadHighScore();

class Shooter {
  constructor(x, y, mode = 'down') {
    this.w = 30;
    this.h = 30;
    this.x = x;
    this.y = y;
    this.speed = 120;
    this.color = '#f33';
    this.hp = ENEMY_INITIAL_HP;
    this.hitFlash = 0;
    this.shootCooldown = game.enemyFireMin + Math.random() * (game.enemyFireMax - game.enemyFireMin);
    this.mode = mode; // 'down' | 'hleft' | 'hright'
  }
  update(dt) {
    if (this.mode === 'down') {
      this.y += this.speed * dt;
    } else if (this.mode === 'hleft') {
      this.x += this.speed * dt;
    } else if (this.mode === 'hright') {
      this.x -= this.speed * dt;
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    // Shooting timer
    this.shootCooldown -= dt;
    const allowShooting = !(this.mode === 'down' && this.y >= canvas.height * 0.75);
    if (this.shootCooldown <= 0 && allowShooting) {
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
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.hitFlash = 0.15;
  }
  offscreen() {
    if (this.mode === 'down') return this.y > canvas.height;
    if (this.mode === 'hleft') return this.x - this.w > canvas.width;
    if (this.mode === 'hright') return this.x + this.w < 0;
    return false;
  }
  draw(ctx) {
    if (assets.images.enemy && assets.images.enemy.loaded) {
      if (this.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.drawImage(assets.images.enemy.img, this.x, this.y, this.w, this.h);
        ctx.restore();
      } else {
        ctx.drawImage(assets.images.enemy.img, this.x, this.y, this.w, this.h);
      }
    } else {
      ctx.fillStyle = this.hitFlash > 0 ? '#ff6' : this.color;
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }
  }
}

class EliteTypeA {
  constructor(x, y, mode = 'down') {
    this.w = 60;
    this.h = 60;
    this.x = x;
    this.y = y;
    this.speed = 140;
    this.color = '#f60';
    this.hp = ENEMY_INITIAL_HP;
    this.hitFlash = 0;
    this.mode = mode; // 'down' | 'hleft' | 'hright'
    // Type B-style firing state (rapid fire + rusher spawn alternation)
    this.chainCount = 0;
    this.spawnCount = 0;
    this.modePhase = 'chain'; // 'chain' | 'spawn'
    this.chainBurstRemaining = 10;
    this.chainBurstInterval = 0.08;
    this.chainBurstTimer = 0;
    this.sequenceCooldownTimer = 0;
    this.modeCooldown = 1.0;
  }
  update(dt) {
    if (this.mode === 'down') {
      this.y += this.speed * dt;
    } else if (this.mode === 'hleft') {
      this.x += this.speed * dt;
    } else if (this.mode === 'hright') {
      this.x -= this.speed * dt;
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    // Type B-style firing logic
    if (this.modePhase === 'chain') {
      if (this.chainBurstRemaining > 0) {
        this.chainBurstTimer = Math.max(0, this.chainBurstTimer - dt);
        if (this.chainBurstTimer === 0) {
          this.fireSingleBullet();
          this.chainBurstRemaining -= 1;
          this.chainBurstTimer = this.chainBurstInterval;
          if (this.chainBurstRemaining === 0) {
            this.sequenceCooldownTimer = 3.0;
          }
        }
      } else {
        this.sequenceCooldownTimer = Math.max(0, this.sequenceCooldownTimer - dt);
        if (this.sequenceCooldownTimer === 0) {
          this.chainCount += 1;
          if (this.chainCount >= 2) {
            this.modePhase = 'spawn';
            this.spawnCount = 0;
            this.chainCount = 0;
            this.modeCooldown = 1.0;
            this.chainBurstRemaining = 10;
            this.chainBurstTimer = 0;
            this.sequenceCooldownTimer = 0;
          } else {
            this.chainBurstRemaining = 10;
            this.chainBurstTimer = 0;
            this.sequenceCooldownTimer = 0;
          }
        }
      }
    } else {
      this.modeCooldown = Math.max(0, this.modeCooldown - dt);
      if (this.modeCooldown === 0) {
        this.spawnRushers();
        this.spawnCount += 1;
        if (this.spawnCount >= 2) {
          this.modePhase = 'chain';
          this.chainCount = 0;
          this.spawnCount = 0;
          this.chainBurstRemaining = 10;
          this.chainBurstTimer = 0;
          this.sequenceCooldownTimer = 0;
        }
        this.modeCooldown = 1.0;
      }
    }
  }
  fireSingleBullet() {
    const ex = this.x + this.w / 2;
    const ey = this.y + this.h / 2;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const dx = px - ex;
    const dy = py - ey;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const offset = this.h / 2 + 6;
    const sx = ex + nx * offset;
    const sy = ey + ny * offset;
    game.enemyBullets.push(new EnemyBullet(sx, sy, nx, ny, game.enemyBulletSpeed));
  }
  spawnRushers() {
    const ex = this.x + this.w / 2;
    const ey = this.y + this.h / 2;
    const offset = 30;
    game.enemies.push(new Rusher(ex - offset, ey, 1.0));
    game.enemies.push(new Rusher(ex + offset, ey, 1.0));
  }
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.hitFlash = 0.15;
  }
  offscreen() {
    if (this.mode === 'down') return this.y > canvas.height;
    if (this.mode === 'hleft') return this.x - this.w > canvas.width;
    if (this.mode === 'hright') return this.x + this.w < 0;
    return false;
  }
  draw(ctx) {
    const useEliteAsset = assets.images.elite && assets.images.elite.loaded;
    if (useEliteAsset) {
      if (this.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.drawImage(assets.images.elite.img, this.x, this.y, this.w, this.h);
        ctx.restore();
      } else {
        ctx.drawImage(assets.images.elite.img, this.x, this.y, this.w, this.h);
      }
    } else {
      ctx.fillStyle = this.hitFlash > 0 ? '#fd9' : this.color;
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }
  }
}

class Rusher {
  constructor(x, y, stun = 0) {
    this.w = 30;
    this.h = 30;
    this.x = x;
    this.y = y;
    this.speed = 160;
    this.color = '#3c3';
    this.hp = 200;
    this.hitFlash = 0;
    this.stunTimer = stun;
  }
  update(dt) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.stunTimer > 0) {
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      return;
    }
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const ex = this.x + this.w / 2;
    const ey = this.y + this.h / 2;
    const dx = px - ex;
    const dy = py - ey;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    this.x += nx * this.speed * dt;
    this.y += ny * this.speed * dt;
  }
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.hitFlash = 0.15;
  }
  offscreen() {
    return false;
  }
  draw(ctx) {
    if (assets.images.rusher && assets.images.rusher.loaded) {
      if (this.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.drawImage(assets.images.rusher.img, this.x, this.y, this.w, this.h);
        ctx.restore();
      } else {
        ctx.drawImage(assets.images.rusher.img, this.x, this.y, this.w, this.h);
      }
    } else {
      ctx.fillStyle = this.hitFlash > 0 ? '#cf9' : this.color;
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }
  }
}

class EliteShooter {
  constructor(x, y, powerSum) {
    this.w = 60;
    this.h = 60;
    this.x = x;
    this.y = y;
    this.moveSpeed = 120;
    this.tx = x;
    this.ty = y;
    this.retargetTimer = 0;
    this.retargetInterval = 2.0;
    this.color = '#f90';
    this.hp = Math.max(0, 500 * powerSum);
    this.hitFlash = 0;
    this.mode = 'chain';
    this.chainCount = 0;
    this.spawnCount = 0;
    this.modeCooldown = 1.0;
    this.chainBurstRemaining = 10;
    this.chainBurstInterval = 0.08;
    this.chainBurstTimer = 0;
    this.sequenceCooldownTimer = 0;
  }
  update(dt) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.updateMovement(dt);
    if (this.mode === 'chain') {
      if (this.chainBurstRemaining > 0) {
        this.chainBurstTimer = Math.max(0, this.chainBurstTimer - dt);
        if (this.chainBurstTimer === 0) {
          this.fireSingleBullet();
          this.chainBurstRemaining -= 1;
          this.chainBurstTimer = this.chainBurstInterval;
          if (this.chainBurstRemaining === 0) {
            this.sequenceCooldownTimer = 3.0;
          }
        }
      } else {
        this.sequenceCooldownTimer = Math.max(0, this.sequenceCooldownTimer - dt);
        if (this.sequenceCooldownTimer === 0) {
          this.chainCount += 1;
          if (this.chainCount >= 2) {
            this.mode = 'spawn';
            this.spawnCount = 0;
            this.chainCount = 0;
            this.modeCooldown = 1.0;
            this.chainBurstRemaining = 10;
            this.chainBurstTimer = 0;
            this.sequenceCooldownTimer = 0;
          } else {
            this.chainBurstRemaining = 10;
            this.chainBurstTimer = 0;
            this.sequenceCooldownTimer = 0;
          }
        }
      }
    } else {
      this.modeCooldown = Math.max(0, this.modeCooldown - dt);
      if (this.modeCooldown === 0) {
        this.spawnRushers();
        this.spawnCount += 1;
        if (this.spawnCount >= 2) {
          this.mode = 'chain';
          this.chainCount = 0;
          this.spawnCount = 0;
          this.chainBurstRemaining = 10;
          this.chainBurstTimer = 0;
          this.sequenceCooldownTimer = 0;
        }
        this.modeCooldown = 1.0;
      }
    }
  }
  fireSingleBullet() {
    const ex = this.x + this.w / 2;
    const ey = this.y + this.h / 2;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const dx = px - ex;
    const dy = py - ey;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const offset = this.h / 2 + 6;
    const sx = ex + nx * offset;
    const sy = ey + ny * offset;
    game.enemyBullets.push(new EnemyBullet(sx, sy, nx, ny, game.enemyBulletSpeed));
  }
  spawnRushers() {
    const ex = this.x + this.w / 2;
    const ey = this.y + this.h / 2;
    const offset = 30;
    game.enemies.push(new Rusher(ex - offset, ey, 1.0));
    game.enemies.push(new Rusher(ex + offset, ey, 1.0));
  }
  updateMovement(dt) {
    this.retargetTimer = Math.max(0, this.retargetTimer - dt);
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (this.retargetTimer === 0 || dist < 6) {
      this.tx = Math.random() * Math.max(1, canvas.width - this.w);
      this.ty = Math.random() * Math.max(1, canvas.height - this.h);
      this.retargetTimer = this.retargetInterval;
    }
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    this.x += nx * this.moveSpeed * dt;
    this.y += ny * this.moveSpeed * dt;
    if (this.x < 0) this.x = 0;
    if (this.y < 0) this.y = 0;
    if (this.x + this.w > canvas.width) this.x = canvas.width - this.w;
    if (this.y + this.h > canvas.height) this.y = canvas.height - this.h;
  }
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.hitFlash = 0.15;
  }
  offscreen() {
    return false;
  }
  draw(ctx) {
    if (assets.images.elite && assets.images.elite.loaded) {
      if (this.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.drawImage(assets.images.elite.img, this.x, this.y, this.w, this.h);
        ctx.restore();
      } else {
        ctx.drawImage(assets.images.elite.img, this.x, this.y, this.w, this.h);
      }
    } else {
      ctx.fillStyle = this.hitFlash > 0 ? '#ffb' : this.color;
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }
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
    // Debug input only while paused
    if (input.just.has('d')) {
      game.debugArmed = !game.debugArmed;
      if (!game.debugArmed) game.debugInputBuffer = '';
    }
    if (game.debugArmed) {
      const digits = ['0','1','2','3','4','5','6','7','8','9'];
      for (let i = 0; i < digits.length; i++) {
        const d = digits[i];
        if (input.just.has(d)) game.debugInputBuffer += d;
      }
      if (input.just.has('backspace')) game.debugInputBuffer = game.debugInputBuffer.slice(0, -1);
      if (input.just.has('enter')) {
        if (!game.debugMode) {
          game.debugMode = true;
        } else {
          if (game.debugInputBuffer.length > 0) {
            const v = parseInt(game.debugInputBuffer, 10);
            if (!Number.isNaN(v) && v >= 0) {
              setDebugKills(v);
            }
          } else {
            game.debugMode = false;
            game.debugArmed = false;
          }
          game.debugInputBuffer = '';
        }
        return;
      }
    } else {
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
  updatePowerUps(dt);
  checkPowerUpPickup();
  updateShake(dt);
  updateExplosions(dt);
  updateStars(dt);
  updateExtraLifeMessage(dt);
  updateDifficultyAlert(dt);
  updateDebugBlink(dt);
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
    if (assets.images.player && assets.images.player.loaded) {
      ctx.drawImage(assets.images.player.img, player.x, player.y, player.w, player.h);
    } else {
      ctx.fillStyle = player.color;
      ctx.fillRect(player.x, player.y, player.w, player.h);
    }
  }

  renderBullets();
  renderEnemyBullets();
  renderEnemies();
  renderExplosions();
  renderScore();
  renderHighScore();
  renderLivesText();
  renderPowerUps();
  renderAbilitiesHUD();
  renderExtraLifeMessage();
  renderDifficultyAlert();
  renderDebugIndicator();
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
    const count = 1 + game.abilities.spread * 2;
    const speed = BULLET_SPEED_BASE + game.abilities.speed * BULLET_SPEED_INC;
    const dmg = DAMAGE_PLAYER_BULLET + game.abilities.damage * 50;
    if (count === 1) {
      player.bullets.push(new Bullet(bx, by, 0, -1, speed, dmg));
    } else {
      const half = count - 1;
      const maxHalfAngle = SPREAD_CONE_DEG * Math.PI / 180;
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : (i / half) * 2 - 1;
        const angle = -Math.PI / 2 + t * maxHalfAngle;
        const vx = Math.cos(angle);
        const vy = Math.sin(angle);
        player.bullets.push(new Bullet(bx, by, vx, vy, speed, dmg));
      }
    }
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
  // Dynamic spawn rate scaling
  const stage = currentStage(game.kills);
  game.enemySpawnRate = stage >= 1 ? 0.7 : 1.0;
  if (game.enemySpawnCooldown <= 0) {
    spawnEnemyWave();
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

function renderExtraLifeMessage() {
  if (game.extraLifeMessageTimer <= 0) return;
  const t = game.extraLifeMessageTimer;
  const alpha = Math.min(1, t / 0.2); // quick pop-in
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = '#ff0';
  ctx.strokeStyle = '#f00';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#f90';
  ctx.shadowBlur = 12;
  ctx.fillText('EXTRA LIFE!!!!!', canvas.width / 2, 28);
  ctx.strokeText('EXTRA LIFE!!!!!', canvas.width / 2, 28);
  ctx.restore();
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

class PowerUp {
  constructor(x, y, category) {
    this.x = x;
    this.y = y;
    this.w = 16;
    this.h = 16;
    this.category = category;
    this.speed = 40;
    this.color = category === 'spread' ? '#6cf' : category === 'damage' ? '#f96' : '#9f6';
  }
  update(dt) {
    this.y += this.speed * dt;
  }
  offscreen() {
    return this.y > canvas.height + this.h;
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
  }
}

function getProgressTier(kills) {
  if (kills >= PROGRESS_THRESHOLDS[2]) return 3;
  if (kills >= PROGRESS_THRESHOLDS[1]) return 2;
  if (kills >= PROGRESS_THRESHOLDS[0]) return 1;
  return 0;
}
function maxLevelForTier(tier) {
  return Math.min(ABILITY_MAX_LEVEL, tier);
}
function eligibleCategories() {
  const tier = getProgressTier(game.kills);
  const maxLvl = maxLevelForTier(tier);
  const cats = [];
  if (maxLvl > 0) {
    if (game.abilities.spread < maxLvl) cats.push('spread');
    if (game.abilities.damage < maxLvl) cats.push('damage');
    if (game.abilities.speed < maxLvl) cats.push('speed');
  }
  return { cats, tier };
}
function maybeSpawnPowerUp(x, y) {
  const { cats, tier } = eligibleCategories();
  if (cats.length === 0 || tier === 0) return;
  const p = DROP_PROB_BY_TIER[tier] || 0;
  if (Math.random() < p) {
    const idx = (Math.random() * cats.length) | 0;
    const cat = cats[idx];
    game.powerUps.push(new PowerUp(x, y, cat));
  }
}
function updatePowerUps(dt) {
  for (let i = 0; i < game.powerUps.length; i++) {
    game.powerUps[i].update(dt);
  }
  game.powerUps = game.powerUps.filter((p) => !p.offscreen());
}
function renderPowerUps() {
  for (let i = 0; i < game.powerUps.length; i++) {
    game.powerUps[i].draw(ctx);
  }
}
function applyPowerUp(cat) {
  const tier = getProgressTier(game.kills);
  const maxLvl = maxLevelForTier(tier);
  if (cat === 'spread') game.abilities.spread = Math.min(maxLvl, game.abilities.spread + 1);
  else if (cat === 'damage') game.abilities.damage = Math.min(maxLvl, game.abilities.damage + 1);
  else if (cat === 'speed') game.abilities.speed = Math.min(maxLvl, game.abilities.speed + 1);
}
function checkPowerUpPickup() {
  if (game.powerUps.length === 0) return;
  const pr = playerRect();
  const remove = new Set();
  for (let i = 0; i < game.powerUps.length; i++) {
    const p = game.powerUps[i];
    const px = p.x - p.w / 2;
    const py = p.y - p.h / 2;
    if (aabb(px, py, p.w, p.h, pr.x, pr.y, pr.w, pr.h)) {
      applyPowerUp(p.category);
      remove.add(i);
    }
  }
  if (remove.size > 0) {
    game.powerUps = game.powerUps.filter((_, i) => !remove.has(i));
  }
}

function forceSpawnEligiblePowerUp(x, y) {
  const { cats } = eligibleCategories();
  if (cats.length === 0) return;
  const idx = (Math.random() * cats.length) | 0;
  const cat = cats[idx];
  game.powerUps.push(new PowerUp(x, y, cat));
}

function sumAbilityLevels() {
  return game.abilities.spread + game.abilities.damage + game.abilities.speed;
}

function normalEnemyCapForKills(kills) {
  if (kills < 5) return NORMAL_CAP_LT5;
  if (kills < 10) return NORMAL_CAP_LT10;
  return Number.POSITIVE_INFINITY;
}
function normalEnemiesOnScreen() {
  let n = 0;
  for (let i = 0; i < game.enemies.length; i++) {
    const e = game.enemies[i];
    if (e instanceof Shooter) n += 1;
  }
  return n;
}
function canSpawnNormalEnemy() {
  const cap = normalEnemyCapForKills(game.kills);
  return normalEnemiesOnScreen() < cap;
}

function spawnShooterDown() {
  const w = 30;
  const x = Math.random() * (canvas.width - w);
  const y = -w;
  const stage = currentStage(game.kills);
  if (stage >= 3) game.enemies.push(new EliteTypeA(x, y, 'down'));
  else game.enemies.push(new Shooter(x, y, 'down'));
}
function spawnShooterHorizontal() {
  const w = 30;
  const y = Math.random() * Math.max(0, canvas.height / 2 - w);
  const sideLeft = Math.random() < 0.5;
  if (sideLeft) {
    const x = -w;
    const stage = currentStage(game.kills);
    if (stage >= 3) game.enemies.push(new EliteTypeA(x, y, 'hleft'));
    else game.enemies.push(new Shooter(x, y, 'hleft'));
  } else {
    const x = canvas.width + w;
    const stage = currentStage(game.kills);
    if (stage >= 3) game.enemies.push(new EliteTypeA(x, y, 'hright'));
    else game.enemies.push(new Shooter(x, y, 'hright'));
  }
}
function spawnRusherLineTop() {
  const count = 3;
  const spacing = canvas.width / (count + 1);
  const y = -40;
  for (let i = 1; i <= count; i++) {
    const x = spacing * i - 15;
    game.enemies.push(new Rusher(x, y, 0));
  }
}
function spawnRusherCorner() {
  const upperLeft = Math.random() < 0.5;
  const x = upperLeft ? -20 : canvas.width + 20;
  const y = -20;
  game.enemies.push(new Rusher(x, y, 0));
}
function spawnEnemyWave() {
  const kills = game.kills;
  const tier = kills >= 50 ? 3 : kills >= 30 ? 2 : kills >= 15 ? 1 : 0;
  const stage = currentStage(kills);
  if (stage >= 3) {
    const r = Math.random();
    if (r < 0.5) {
      spawnShooterDown();
    } else {
      spawnShooterHorizontal();
    }
    return;
  }
  if (tier === 0) {
    if (canSpawnNormalEnemy()) spawnShooterDown();
  } else if (tier === 1) {
    if (Math.random() < 0.7) {
      if (canSpawnNormalEnemy()) spawnShooterDown();
    } else {
      if (canSpawnNormalEnemy()) spawnShooterHorizontal();
    }
  } else if (tier === 2) {
    if (Math.random() < 0.5) {
      if (Math.random() < 0.5) {
        if (canSpawnNormalEnemy()) spawnShooterDown();
      } else {
        if (canSpawnNormalEnemy()) spawnShooterHorizontal();
      }
    } else {
      spawnRusherLineTop();
    }
  } else {
    const r = Math.random();
    if (r < 0.35) {
      if (canSpawnNormalEnemy()) spawnShooterDown();
    } else if (r < 0.7) {
      if (canSpawnNormalEnemy()) spawnShooterHorizontal();
    } else if (r < 0.85) {
      spawnRusherLineTop();
    } else {
      spawnRusherCorner();
    }
  }
}
function typeBEliteCount() {
  let n = 0;
  for (let i = 0; i < game.enemies.length; i++) {
    if (game.enemies[i] instanceof EliteShooter) n += 1;
  }
  return n;
}
function maxTypeBElitesForStage(kills) {
  const s = currentStage(kills);
  if (s >= 3) return Number.POSITIVE_INFINITY;
  if (s >= 2) return 3;
  return 1;
}
function spawnEliteIfNeeded() {
  const cap = maxTypeBElitesForStage(game.kills);
  if (typeBEliteCount() >= cap) return;
  if (game.kills >= game.nextEliteAt) {
    const powerSum = sumAbilityLevels();
    const x = Math.random() * (canvas.width - 60);
    const y = Math.min(40, canvas.height / 2 - 60);
    game.enemies.push(new EliteShooter(x, y, powerSum));
    game.nextEliteAt += 30;
  }
}
function checkCollisions() {
  if (player.bullets.length === 0 || game.enemies.length === 0) return;
  const bulletsToRemove = new Set();
  const enemiesToRemove = new Set();
  const destroyed = [];

  for (let ei = 0; ei < game.enemies.length; ei++) {
    const e = game.enemies[ei];
    for (let bi = 0; bi < player.bullets.length; bi++) {
      if (bulletsToRemove.has(bi)) continue;
      const b = player.bullets[bi];
      const br = bulletRect(b);
      if (aabb(br.x, br.y, br.w, br.h, e.x, e.y, e.w, e.h)) {
        bulletsToRemove.add(bi);
        e.takeDamage(b.damage);
        if (e.hp <= 0) {
          enemiesToRemove.add(ei);
          game.fxExplosions.push(new Explosion(e.x + e.w / 2, e.y + e.h / 2));
          triggerShake(0.15, 4);
          destroyed.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, elite: (e instanceof EliteShooter) });
        }
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
    game.kills += enemiesToRemove.size;
    // Difficulty alerts
    const s = currentStage(game.kills);
    if (s >= 1 && game.alertStageShown < 1) {
      triggerDifficultyAlert('The enemies are getting angrier!!!');
      game.alertStageShown = 1;
    }
    if (game.kills >= 150 && game.alertStageShown < 2) {
      triggerDifficultyAlert('More angry Jelly are coming');
      game.alertStageShown = 2;
    }
    if (s >= 3 && game.alertStageShown < 3) {
      triggerDifficultyAlert('Behold! Here is the real Angry Horde!');
      game.alertStageShown = 3;
    }
    for (let i = 0; i < destroyed.length; i++) {
      const d = destroyed[i];
      if (d.elite) {
        forceSpawnEligiblePowerUp(d.x, d.y);
        player.lives += 1;
        game.extraLifeMessageTimer = 2.0;
      } else {
        maybeSpawnPowerUp(d.x, d.y);
      }
    }
    spawnEliteIfNeeded();
  }
}

function checkEnemyBulletHitsPlayer() {
  if (player.invincibleTimer > 0 || game.debugMode || game.enemyBullets.length === 0) return;
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

function renderHighScore() {
  ctx.fillStyle = '#0cf';
  ctx.textAlign = 'right';
  ctx.font = 'bold 14px system-ui, sans-serif';
  const value = game.highScore || 0;
  ctx.fillText(`High Score: ${value}`, canvas.width - 8, 16);
}

function renderAbilitiesHUD() {
  ctx.fillStyle = '#d4af37';
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px system-ui, sans-serif';
  let y = 52;
  ctx.fillText('Power:', 8, y);
  y += 18;
  ctx.fillText(`Spread: ${game.abilities.spread}`, 8, y);
  y += 18;
  ctx.fillText(`Damage: ${game.abilities.damage}`, 8, y);
  y += 18;
  ctx.fillText(`Speed: ${game.abilities.speed}`, 8, y);
}

function renderLivesText() {
  ctx.fillStyle = '#e33';
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`Lives: ${player.lives}`, 8, 34);
}

function damagePlayer(enemyIndex) {
  if (player.invincibleTimer > 0 || game.debugMode) return;
  player.lives = Math.max(0, player.lives - 1);
  player.invincibleTimer = player.invincibleDuration;
  game.enemies.splice(enemyIndex, 1);
  if (player.lives === 0) {
    updateHighScoreIfNeeded();
    game.state = 'gameover';
  }
  triggerShake(0.25, 6);
}

function damagePlayerFromBullet() {
  if (player.invincibleTimer > 0 || game.debugMode) return;
  player.lives = Math.max(0, player.lives - 1);
  player.invincibleTimer = player.invincibleDuration;
  if (player.lives === 0) {
    updateHighScoreIfNeeded();
    game.state = 'gameover';
  }
  triggerShake(0.25, 6);
}

function checkPlayerDamage() {
  if (player.invincibleTimer > 0 || game.debugMode || game.enemies.length === 0) return;
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
  player.lives = 5;
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
  game.powerUps = [];
  game.abilities = { spread: 0, damage: 0, speed: 0 };
  game.kills = 0;
  game.nextEliteAt = 30;
  game.extraLifeMessageTimer = 0;
  game.eliteAlive = false;
  game.killsAtLastEliteDeath = 0;
  game.alertText = '';
  game.alertTimer = 0;
  game.alertStageShown = -1;
  game.debugMode = false;
  game.debugArmed = false;
  game.debugInputBuffer = '';
  game.debugBlinkTimer = 0;
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

function updateExtraLifeMessage(dt) {
  game.extraLifeMessageTimer = Math.max(0, game.extraLifeMessageTimer - dt);
}
function triggerDifficultyAlert(text, duration = 2.0) {
  game.alertText = text;
  game.alertTimer = duration;
}
function updateDifficultyAlert(dt) {
  game.alertTimer = Math.max(0, game.alertTimer - dt);
}
function renderDifficultyAlert() {
  if (game.alertTimer <= 0 || !game.alertText) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#f33';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#900';
  ctx.shadowBlur = 16;
  const y = canvas.height - 24;
  ctx.fillText(game.alertText, canvas.width / 2, y);
  ctx.strokeText(game.alertText, canvas.width / 2, y);
  ctx.restore();
}
function updateDebugBlink(dt) {
  if (game.debugMode) {
    game.debugBlinkTimer += dt;
    if (game.debugBlinkTimer > 10) game.debugBlinkTimer = 0;
  } else {
    game.debugBlinkTimer = 0;
  }
}
function renderDebugIndicator() {
  if (!game.debugMode) return;
  const t = game.debugBlinkTimer;
  const visible = Math.floor(t * 4) % 2 === 0;
  if (!visible) return;
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillStyle = '#ff6';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#f90';
  ctx.shadowBlur = 10;
  ctx.fillText('DEBUG MODE', canvas.width - 10, 20);
  ctx.strokeText('DEBUG MODE', canvas.width - 10, 20);
  ctx.restore();
}
function setDebugKills(v) {
  game.kills = v;
  const s = currentStage(game.kills);
  if (s >= 1 && game.alertStageShown < 1) {
    triggerDifficultyAlert('The enemies are getting angrier!!!');
    game.alertStageShown = 1;
  }
  if (game.kills >= 150 && game.alertStageShown < 2) {
    triggerDifficultyAlert('More angry Jelly are coming');
    game.alertStageShown = 2;
  }
  if (s >= 3 && game.alertStageShown < 3) {
    triggerDifficultyAlert('Behold! Here is the real Angry Horde!');
    game.alertStageShown = 3;
  }
  spawnEliteIfNeeded();
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
