# ShootEmUp

A compact HTML5 canvas arcade shooter built with plain ES6 and the DOM. Fixed-size canvas, simple state routing, bullets, enemies, collisions, score, visual hearts for lives, pause menu with confirmation, and a scrolling starfield. No frameworks, no TypeScript, no build tools, and no external assets.

## Getting Started
- Open [index.html](file:///c:/Yuze's%20File/GitRepos/AIGeneratedProjects/shootEmUp/index.html) directly in your browser.
- Click the canvas once to focus if inputs seem inactive.

## Project Structure
- [index.html](file:///c:/Yuze's%20File/GitRepos/AIGeneratedProjects/shootEmUp/index.html): Fixed 800×600 canvas, minimal styling; loads the game script.
- [game.js](file:///c:/Yuze's%20File/GitRepos/AIGeneratedProjects/shootEmUp/game.js): Core loop, input handling, entities, UI, and state logic.

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
