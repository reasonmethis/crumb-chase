# Crumb Chase — Mouse vs Cat

Tiny, dependency‑free canvas game. You're a mouse trying to reach the hole on the left edge while cats chase you using A\* pathfinding. Your movement leaves crumb tiles that block you and slow the cats. Crumbs randomly disappear over time and cats can eat through them.

## Play

- Open `index.html` in a modern browser
- Or serve locally to avoid file:// issues:
  - Python: `python -m http.server`
  - Node: `npx serve`

## Controls

- Arrows or WASD: set direction (no need to hold down)
- Alternatively, click to set direction
- Space: stop
- R: restart

## Goal and rules

- Reach the vertical hole on the left edge without being caught
- Moving leaves a crumb trail; crumbs act like walls for you and heavily slow cats
- Crumbs decay randomly; cats also "eat" crumbs as they move
- Levels ramp difficulty by adding cats and increasing their speed

## Tech

- HTML5 Canvas, no build or deps
- HiDPI scaling for crisp rendering
- A\* pathfinding with increased cost on crumb tiles, plus simple separation steering so cats don't stack

## Tuning

Edit the constants near the top of `index.html` to tweak feel and difficulty, e.g. grid size (`TILE`, `COLS`, `ROWS`), speeds, crumb decay, pathfinding rate/cost, and turn tolerance.
