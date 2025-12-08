# Claude Code Guidelines

## Git Commit Messages

- Follow the Conventional Commits specification
- Do NOT include "Generated with" or "Co-Authored-By" sections

## Game Coordinate System

### Entity Positions (Player & Cats)
- `player.x`, `player.y`, `cat.x`, `cat.y` represent the **center** of each entity
- Entities are drawn as circles centered at these coordinates
- Collision detection uses center-to-center distance

### Grid Cells
- The grid is `COLS` x `ROWS` cells (default 40x25)
- Each cell is `TILE` x `TILE` pixels (default 20x20)
- Cell (c, r) has its center at pixel coordinates:
  - `x = (c + 0.5) * TILE`
  - `y = (r + 0.5) * TILE`
- Example with TILE=20: cell (0,0) center is (10,10), cell (1,2) center is (30,50)
- The `centerOf(c, r)` function returns the center coordinates

### Crumb Storage
- Crumbs are stored in a flat `Float32Array` of size `COLS * ROWS`
- Position is implicit via index: `index = r * COLS + c` (see `idx(c, r)` function)
- Value at each index = crumb strength (0 = no crumb, >0 = crumb exists)
- Crumbs occupy entire grid cells, no sub-cell positioning
- When rendering, crumbs draw at `(c * TILE, r * TILE)` (top-left corner of cell)
