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
- Player has 5 lives, shown as red hearts in the top-left.
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

## Difficulty Levels
- Stage thresholds:
  - Stage 1 (≥100 kills): faster spawn cadence for normal waves.
  - Stage 2 (≥150 kills): allows up to 3 Type B elites at once.
  - Stage 3 (≥300 kills): dual-elite era (Type A replacement + unlimited Type B).
- Alerts:
  - At 100 kills: "The enemies are getting angrier!!!"
  - At 150 kills: "More angry Jelly are coming"
  - At 300 kills: "Behold! Here is the real Angry Horde!"
- Alert UI:
  - Large text at the bottom of the screen.
  - Bright red color and visible shadow.
  - Display duration: 2 seconds; a new alert replaces any active one.

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
- Max concurrent Type B elites by stage:
  - Pre-150 kills: up to 1
  - 150–299 kills: up to 3
  - ≥300 kills: unlimited
- Dual Elite system at ≥300 kills:
  - Type A (Replacement): replaces Shooters in normal waves; moves like Shooters; no power-up or extra life rewards; unlimited.
  - Type B (Original): random movement + shooting modes; guaranteed power-up and +1 life on defeat; unlimited.

## Enemy Spawn Details
- Early density caps: <5 kills cap 2; <10 kills cap 5; Rushers and elites ignore the cap.
- Spawn cadence:
  - Base rate early game.
  - Faster from ≥100 kills (Stage 1).
- Post-300 kills:
  - Normal waves no longer produce regular Shooters; they produce Type A elites instead.
  - Rushers continue to appear from elite actions; normal wave rusher lines are suppressed during the Type A replacement path.
- Spawn bounds are centralized and enforced in spawner logic for fairness.

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

## Debug Mode
- Activation:
  - Pause the game (P or Esc).
  - Press D to arm debug input; press Enter to toggle Debug Mode.
  - While active and paused, type digits + Enter to set total kills instantly.
- Features:
  - On-screen blinking "DEBUG MODE" indicator (top-right).
  - Player invincibility (no damage taken).
  - Immediate application of progression effects when kills are set.
- Scoring:
  - High score updates are disabled while Debug Mode is active.
  - High score resumes normally after Debug Mode is turned off.
