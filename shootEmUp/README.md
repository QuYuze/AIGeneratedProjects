# ShootEmUp

A compact HTML5 canvas arcade shooter built with plain ES6 and the DOM. Fixed-size canvas, simple state routing, bullets, enemies, collisions, score, visual hearts for lives, pause menu with confirmation, and a scrolling starfield. No frameworks, no TypeScript, no build tools, and no external assets.

## Getting Started
- Open [index.html] directly in your browser.
- Click the canvas once to focus if inputs seem inactive.

## Project Structure
- [index.html]: Fixed 800×600 canvas, minimal styling; loads the game script.
- [game.js]: Core loop, input handling, entities, UI, and state logic.

## Design Constraints
- Plain ES6/DOM APIs only; no frameworks or libraries.
- No TypeScript, no bundlers, no build steps.
- No external assets; visuals use simple shapes.
- Keep code simple and readable.

## Game Loop
- Uses `requestAnimationFrame` each frame.
- Computes a time delta (`dt` in seconds) for frame-rate independence.
- Separates responsibilities:
  - `update(dt)`: game logic and state routing.
  - `render()`: canvas drawing.

## Controls
- Movement: Mouse X (smooth follow). Optional Arrow Left/Right or A/D for nudge.
- Shoot: Space or Left Click (rate-limited).
- Pause/Unpause: P or Esc.
- Menu Navigation: Arrow Up/Down or mouse hover.
- Select Menu Option: Enter or Left Click.
- Game Over Restart: Enter or Left Click.

## Gameplay
- Player shoots upward; bullets collide with enemies (AABB).
- Enemies spawn from the top and move downward.
- Score increases by 1 per destroyed enemy.
- Player has 3 lives, shown as red hearts in the top-left.
- Brief invincibility with blinking after taking damage.
- Game states: Intro, Help, Playing, Paused, Confirm End, Game Over.
- Pause menu: Continue, Restart, End Game (with confirmation).
- Visual polish: explosions, screen shake, scrolling starfield.

## Project Notes
- Fixed-size canvas: 800×600.
- All visuals are shapes and text; no images.
- Input handling uses per-frame “just pressed” for menus to avoid rapid repeats.
- Movement and effects use `dt` to stay consistent across frame rates.

## Troubleshooting
- Nothing shows: ensure the browser can access local files and that `game.js` is loaded after the canvas in `index.html`.
- Inputs inactive: click once to focus the canvas.
- Movement too fast/slow: tweak `player.speed` in `game.js`.

## Enemy Progression Rules
- Progress tiers are based on total kills:
  - Tier 0: < 15 kills → Shooters (top-down)
  - Tier 1: ≥ 15 kills → Shooters (top-down) or Horizontal Shooters (from sides)
  - Tier 2: ≥ 30 kills → Mix of Shooters and Rusher lines
  - Tier 3: ≥ 50 kills → Adds Rusher corner spawns
- Normal enemy caps by kills:
  - Kills < 5 → max 2 normal enemies on screen
  - Kills < 10 → max 5 normal enemies on screen
  - Kills ≥ 10 → no cap for normal enemies
- Normal enemies include Shooters and Horizontal Shooters; Rushers and Elite ignore the cap.
- Spawn bounds:
  - Shooters spawning from sides clamp Y to the upper half of the canvas.
  - Top-down Shooters spawn above the top edge (enter from the upper half).

## Enemy Types
- Shooter:
  - HP 150; moves down (or horizontally, depending on mode); fires aimed bullets.
  - Spawns respect upper-half constraint.
- Rusher:
  - HP 200; moves directly toward the player; does not shoot.
  - Spawns in lines from top or corners; not restricted by upper-half rule.
- Elite Shooter:
  - HP = 500 × (Spread + Damage + Speed levels).
  - Alternates between two actions:
    - Bullet Chain: rapid aimed bullet chain
    - Rusher Spawn: spawns two Rushers with brief stun
  - On defeat: guaranteed power-up drop and +1 life.

## Elite Gating Logic
- Single-Elite constraint: only one EliteShooter can be present at a time.
- Respawn timing:
  - Track kills at elite death (killsAtLastEliteDeath).
  - Next elite may spawn only after 30 additional kills since that recorded value.
  - This is state-based and not modulo-based.
- Elite spawn bounds:
  - Elite spawns in the upper half of the canvas.

## Power-Ups
- Categories: Spread, Damage, Speed.
- Unlocking:
  - Based on kill tiers and a max level cap tied to progression.
  - Eligible categories are offered as drops only if not at max level for the current tier.
- Drop rules:
  - Standard enemies: probabilistic drops based on tier.
  - Elite defeat: guaranteed one eligible power-up.
- Effects:
  - Spread: adds additional bullets in a cone.
  - Damage: +50 per level to player bullet damage.
  - Speed: +100 per level to player bullet speed.
