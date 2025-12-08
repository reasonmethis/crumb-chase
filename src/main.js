/**
 * Crumb Chase - Main Game Module
 *
 * A chase game where a mouse tries to reach a hole while being pursued by cats.
 * The mouse leaves a crumb trail that blocks its own movement but slows down cats.
 *
 * Game mechanics:
 * - Player controls a mouse using arrow keys or WASD
 * - Cats use A* pathfinding to chase the player
 * - Crumbs act as walls for the player but only slow cats
 * - Crumbs decay over time and cats can eat through them
 * - Reaching the hole advances to the next level
 *
 * @module main
 */

import * as Config from './config.js';

// ============================================
// Device Pixel Ratio (for crisp rendering on HiDPI displays)
// ============================================
const DPR = Math.max(1, window.devicePixelRatio || 1);

// ============================================
// DOM Elements
// ============================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const hudStats = document.getElementById('stats');
const overlay = document.getElementById('overlay');
const ovTitle = document.getElementById('ovTitle');
const ovMsg = document.getElementById('ovMsg');
const playAgain = document.getElementById('playAgain');
const resetBtn = document.getElementById('resetBtn');
const toast = document.getElementById('toast');

// ============================================
// Canvas Setup
// ============================================
canvas.width = Config.COLS * Config.TILE * DPR;
canvas.height = Config.ROWS * Config.TILE * DPR;
canvas.style.width = Config.COLS * Config.TILE + 'px';
canvas.style.height = Config.ROWS * Config.TILE + 'px';
ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

// ============================================
// Game State
// ============================================

/** Total number of cells in the grid */
const N = Config.COLS * Config.ROWS;

/**
 * Crumb grid - stores thickness/strength of crumbs at each cell.
 * Value > 0 means crumb exists; 0 means empty.
 */
const crumbs = new Float32Array(N);

/** Set of cell indices that form the barrier ring around the hole */
const ringSet = new Set();

/** Set of cell indices that are part of the open hole (win zone) */
const holeOpenSet = new Set();

/** Hole position and dimensions */
const hole = {
  c: Config.HOLE_COLUMN,
  r: Config.getHoleRow(),
  halfHeight: Config.HOLE_HALF_HEIGHT,
};

/** Player (mouse) state */
const player = {
  x: Config.getPlayerSpawnX(),
  y: Config.getPlayerSpawnY(),
  r: Config.TILE * Config.PLAYER_RADIUS_FACTOR,
  speed: Config.PLAYER_SPEED_CELLS * Config.TILE,
  color: getCSS('--mouse'),
  lastCell: { c: -1, r: -1 },
};

/** Array of cat objects */
let cats = [];

/** Current level number */
let level = 1;

// ============================================
// Movement State
// ============================================

/**
 * Current committed movement direction.
 * The player moves continuously in this direction until changed.
 */
let dirX = 0, dirY = 0;

/**
 * Desired/wished direction from player input.
 * Gets committed to dirX/dirY when the player reaches a valid turn point.
 */
let wishX = 0, wishY = 0;

/** Time elapsed since wish direction was set (for failsafe snap) */
let wishTimer = 0;

/** Currently pressed keys (for debug features like Shift to show paths) */
const keys = Object.create(null);

/** Whether the game is currently running (false when caught or between levels) */
let running = true;

/** Time survived in current level (seconds) */
let timeAlive = 0;

/** Accumulator for crumb decay timing */
let decayAccum = 0;

/** Tolerance for committing turns at cell centers (in pixels) */
const TURN_EPS = Config.getTurnEps();

// ============================================
// Utility Functions
// ============================================

/**
 * Get a CSS custom property value from the document root.
 * @param {string} name - CSS variable name (e.g., '--mouse')
 * @returns {string} The trimmed property value
 */
function getCSS(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Convert grid column/row to flat array index.
 * @param {number} c - Column
 * @param {number} r - Row
 * @returns {number} Flat index into the crumbs array
 */
function idx(c, r) {
  return r * Config.COLS + c;
}

/**
 * Check if a cell is within grid bounds.
 * @param {number} c - Column
 * @param {number} r - Row
 * @returns {boolean} True if cell is valid
 */
function inBounds(c, r) {
  return c >= 0 && r >= 0 && c < Config.COLS && r < Config.ROWS;
}

/**
 * Convert pixel coordinates to grid cell.
 * @param {number} x - X pixel coordinate
 * @param {number} y - Y pixel coordinate
 * @returns {{c: number, r: number}} Cell column and row
 */
function cellAt(x, y) {
  return { c: Math.floor(x / Config.TILE), r: Math.floor(y / Config.TILE) };
}

/**
 * Get the pixel coordinates of a cell's center.
 * @param {number} c - Column
 * @param {number} r - Row
 * @returns {{x: number, y: number}} Center coordinates in pixels
 */
function centerOf(c, r) {
  return { x: (c + 0.5) * Config.TILE, y: (r + 0.5) * Config.TILE };
}

/**
 * Generate a random integer in range [a, b] inclusive.
 * @param {number} a - Minimum value
 * @param {number} b - Maximum value
 * @returns {number} Random integer
 */
function randInt(a, b) {
  return ((Math.random() * (b - a + 1)) | 0) + a;
}

/**
 * Generate a random float in range [a, b).
 * @param {number} a - Minimum value
 * @param {number} b - Maximum value (exclusive)
 * @returns {number} Random float
 */
function randRange(a, b) {
  return a + Math.random() * (b - a);
}

/**
 * Pick a random element from a Set.
 * @param {Set} set - The set to pick from
 * @returns {*} A random element, or null if set is empty
 */
function randomFromSet(set) {
  const size = set.size;
  if (!size) return null;
  const n = (Math.random() * size) | 0;
  let i = 0;
  for (const v of set) {
    if (i++ === n) return v;
  }
  return null;
}

// ============================================
// Turn Helpers
// ============================================
// These functions handle "Pac-Man style" turning where the player must be
// near a cell center to change direction perpendicular to current movement.

/**
 * Find the nearest column center for snapping during a turn.
 * Considers both current cell and next cell (if moving horizontally).
 * @param {number} x - Current X position
 * @param {number} movingDirX - Current horizontal movement direction (-1, 0, or 1)
 * @returns {number} X coordinate of nearest column center
 */
function nearestColumnCenter(x, movingDirX) {
  const c = Math.floor(x / Config.TILE);
  const cx0 = (c + 0.5) * Config.TILE;
  if (movingDirX !== 0) {
    const cx1 = (c + 0.5 + Math.sign(movingDirX)) * Config.TILE;
    return Math.abs(x - cx0) < Math.abs(x - cx1) ? cx0 : cx1;
  }
  return cx0;
}

/**
 * Check if player can commit a vertical turn (change to up/down movement).
 * Player must be within TURN_EPS of a column center.
 * @param {number} x - Current X position
 * @param {number} movingDirX - Current horizontal movement direction
 * @returns {boolean} True if turn is allowed
 */
function canTurnVertical(x, movingDirX) {
  const c = Math.floor(x / Config.TILE);
  const cx0 = (c + 0.5) * Config.TILE;
  if (Math.abs(x - cx0) <= TURN_EPS) return true;
  if (movingDirX !== 0) {
    const cx1 = (c + 0.5 + Math.sign(movingDirX)) * Config.TILE;
    if (Math.abs(x - cx1) <= TURN_EPS) return true;
  }
  return false;
}

/**
 * Find the nearest row center for snapping during a turn.
 * @param {number} y - Current Y position
 * @param {number} movingDirY - Current vertical movement direction (-1, 0, or 1)
 * @returns {number} Y coordinate of nearest row center
 */
function nearestRowCenter(y, movingDirY) {
  const r = Math.floor(y / Config.TILE);
  const cy0 = (r + 0.5) * Config.TILE;
  if (movingDirY !== 0) {
    const cy1 = (r + 0.5 + Math.sign(movingDirY)) * Config.TILE;
    return Math.abs(y - cy0) < Math.abs(y - cy1) ? cy0 : cy1;
  }
  return cy0;
}

/**
 * Check if player can commit a horizontal turn (change to left/right movement).
 * Player must be within TURN_EPS of a row center.
 * @param {number} y - Current Y position
 * @param {number} movingDirY - Current vertical movement direction
 * @returns {boolean} True if turn is allowed
 */
function canTurnHorizontal(y, movingDirY) {
  const r = Math.floor(y / Config.TILE);
  const cy0 = (r + 0.5) * Config.TILE;
  if (Math.abs(y - cy0) <= TURN_EPS) return true;
  if (movingDirY !== 0) {
    const cy1 = (r + 0.5 + Math.sign(movingDirY)) * Config.TILE;
    if (Math.abs(y - cy1) <= TURN_EPS) return true;
  }
  return false;
}

// ============================================
// Crumb Functions
// ============================================

/**
 * Check if a cell contains a crumb (or is out of bounds, which acts as a wall).
 * @param {number} c - Column
 * @param {number} r - Row
 * @returns {boolean} True if cell has crumb or is out of bounds
 */
function isCrumb(c, r) {
  return inBounds(c, r) ? crumbs[idx(c, r)] > 0 : true;
}

/**
 * Add or strengthen a crumb at a cell. Takes the max of existing and new strength.
 * @param {number} c - Column
 * @param {number} r - Row
 * @param {number} strength - Crumb thickness to set
 */
function addCrumb(c, r, strength = Config.CRUMB_STRENGTH) {
  if (inBounds(c, r)) {
    const k = idx(c, r);
    crumbs[k] = Math.max(crumbs[k], strength);
  }
}

/**
 * Reduce crumb strength at a cell. Removes from ringSet if fully depleted.
 * @param {number} c - Column
 * @param {number} r - Row
 * @param {number} amount - Amount to subtract from crumb strength
 */
function weakenCrumb(c, r, amount) {
  if (inBounds(c, r)) {
    const k = idx(c, r);
    if (crumbs[k] > 0) {
      crumbs[k] = Math.max(0, crumbs[k] - amount);
      if (crumbs[k] === 0) ringSet.delete(k);
    }
  }
}

/**
 * Reduce crumb strength by flat array index.
 * @param {number} k - Flat array index
 * @param {number} amount - Amount to subtract
 */
function weakenCrumbByIndex(k, amount) {
  if (k >= 0 && k < N) {
    if (crumbs[k] > 0) {
      crumbs[k] = Math.max(0, crumbs[k] - amount);
      if (crumbs[k] === 0) ringSet.delete(k);
    }
  }
}

/**
 * Count total number of cells with crumbs.
 * @returns {number} Number of crumb cells
 */
function countCrumbs() {
  let count = 0;
  for (let i = 0; i < N; i++) {
    if (crumbs[i] > 0) count++;
  }
  return count;
}

// ============================================
// UI Functions
// ============================================

/**
 * Show a temporary toast notification at the bottom of the screen.
 * @param {string} msg - Message to display
 * @param {number} ms - Duration in milliseconds (default 1200)
 */
function showToast(msg, ms = 1200) {
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, ms);
}

// ============================================
// Cat Factory
// ============================================

/**
 * Create a new cat object at the specified position.
 * @param {number} colFrac - X position as fraction of grid width (0-1)
 * @param {number} rowFrac - Y position as fraction of grid height (0-1)
 * @param {number} speedCells - Movement speed in cells per second
 * @param {number} crumbSpeedFactor - Speed multiplier in crumbs (0 = blocked, 1 = no slowdown)
 * @param {number} id - Unique cat identifier
 * @returns {Object} Cat object with position, pathfinding state, etc.
 */
function makeCat(colFrac, rowFrac, speedCells, crumbSpeedFactor, id) {
  const x = (Math.max(0, Math.min(Config.COLS - 1, Math.round(Config.COLS * colFrac))) + 0.5) * Config.TILE;
  const y = (Math.max(0, Math.min(Config.ROWS - 1, Math.round(Config.ROWS * rowFrac))) + 0.5) * Config.TILE;
  return {
    id,
    x,
    y,
    r: Config.TILE * Config.CAT_RADIUS_FACTOR,
    speedCells,
    crumbSpeedFactor,      // Speed multiplier when in crumbs (0 = can't enter)
    color: getCSS('--cat'),
    path: [],              // Current A* path to player
    pathTimer: 0,          // Countdown until next path recalculation
    goalJitter: {          // Random offset added to goal to prevent cats stacking
      dc: randInt(-Config.GOAL_JITTER_RANGE, Config.GOAL_JITTER_RANGE),
      dr: randInt(-Config.GOAL_JITTER_RANGE, Config.GOAL_JITTER_RANGE),
    },
    noiseTimer: randRange(Config.NOISE_REFRESH_MIN, Config.NOISE_REFRESH_MAX),
    lastCell: { c: -1, r: -1 },  // Track previous cell for crumb destruction
  };
}

// ============================================
// Hole Barrier
// ============================================

/**
 * Build the crumb barrier around the escape hole.
 *
 * The hole is on the left edge of the grid. This function:
 * 1. Marks the open hole cells (where player can escape)
 * 2. Surrounds the hole with crumbs to create a protective barrier
 * 3. Adds extra caps above/below to prevent easy circumvention
 */
function buildHoleBarrier() {
  ringSet.clear();
  holeOpenSet.clear();
  const rmin = Math.max(0, hole.r - hole.halfHeight);
  const rmax = Math.min(Config.ROWS - 1, hole.r + hole.halfHeight);

  // Mark open hole cells (the actual escape zone)
  for (let r = rmin; r <= rmax; r++) {
    holeOpenSet.add(idx(0, r));
  }

  // Build rectangular barrier around hole opening
  for (let c = 0; c <= 2; c++) {
    for (let r = rmin - 1; r <= rmax + 1; r++) {
      if (!inBounds(c, r)) continue;
      if (c === 0 && r >= rmin && r <= rmax) continue; // Leave hole open
      addCrumb(c, r, Config.RING_CRUMB_STRENGTH);
      ringSet.add(idx(c, r));
    }
  }

  // Add extra caps above and below to make it harder to slip around
  for (let c = 0; c <= 1; c++) {
    for (let r = rmin - 2; r <= rmin - 1; r++) {
      if (inBounds(c, r)) {
        addCrumb(c, r, Config.RING_CRUMB_STRENGTH);
        ringSet.add(idx(c, r));
      }
    }
    for (let r = rmax + 1; r <= rmax + 2; r++) {
      if (inBounds(c, r)) {
        addCrumb(c, r, Config.RING_CRUMB_STRENGTH);
        ringSet.add(idx(c, r));
      }
    }
  }
}

// ============================================
// Level Management
// ============================================

/**
 * Initialize or restart a game level.
 *
 * Resets all game state: clears crumbs, repositions player,
 * spawns cats based on level config, and rebuilds the hole barrier.
 *
 * @param {boolean} resetLevelNumber - If true, resets to level 1; otherwise continues to next level
 */
function startLevel(resetLevelNumber = false) {
  if (resetLevelNumber) {
    level = 1;
  }

  crumbs.fill(0);
  ringSet.clear();
  holeOpenSet.clear();

  player.x = Config.getPlayerSpawnX();
  player.y = Config.getPlayerSpawnY();
  player.lastCell = { c: -1, r: -1 };

  dirX = 0;
  dirY = 0;
  wishX = 0;
  wishY = 0;
  wishTimer = 0;

  const { cats: targetCats, speedFactor, crumbSpeedFactor } = Config.getLevelConfig(level);
  const speedCells = Config.PLAYER_SPEED_CELLS * speedFactor;

  cats = [];
  for (let i = 0; i < targetCats; i++) {
    const p = Config.CAT_SPAWN_GRID[i % Config.CAT_SPAWN_GRID.length];
    cats.push(makeCat(p[0], p[1], speedCells, crumbSpeedFactor, i));
  }

  overlay.style.display = 'none';
  timeAlive = 0;
  decayAccum = 0;
  running = true;

  buildHoleBarrier();
  draw();
  showToast(`Level ${level} — Cats: ${cats.length}`);
  setTimeout(() => canvas.focus(), 0);
}

// ============================================
// A* Pathfinding
// ============================================
// Standard A* algorithm for cat navigation.
// Crumb cells have higher traversal cost (CRUMB_COST_FOR_CAT) so cats prefer
// open paths but will push through crumbs if necessary.

/**
 * Manhattan distance heuristic for A*.
 * @param {number} c1 - Start column
 * @param {number} r1 - Start row
 * @param {number} c2 - Goal column
 * @param {number} r2 - Goal row
 * @returns {number} Manhattan distance
 */
function heuristic(c1, r1, c2, r2) {
  return Math.abs(c1 - c2) + Math.abs(r1 - r2);
}

/**
 * A* pathfinding from start cell to goal cell.
 *
 * Uses typed arrays for performance. Crumb cells cost more to traverse,
 * making cats prefer open paths but still able to eat through barriers.
 *
 * @param {number} startC - Starting column
 * @param {number} startR - Starting row
 * @param {number} goalC - Goal column
 * @param {number} goalR - Goal row
 * @returns {Array<{c: number, r: number}>} Path as array of cells (empty if no path)
 */
function aStar(startC, startR, goalC, goalR) {
  const start = idx(startC, startR);
  const goal = idx(goalC, goalR);
  if (start === goal) return [];

  const g = new Float32Array(N);
  const f = new Float32Array(N);
  const came = new Int32Array(N);
  const closed = new Uint8Array(N);

  for (let i = 0; i < N; i++) {
    g[i] = Infinity;
    f[i] = Infinity;
    came[i] = -1;
  }

  const open = new Uint8Array(N);
  g[start] = 0;
  f[start] = heuristic(startC, startR, goalC, goalR);
  open[start] = 1;

  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (true) {
    let current = -1;
    let bestF = Infinity;
    for (let i = 0; i < N; i++) {
      if (open[i] && f[i] < bestF) {
        bestF = f[i];
        current = i;
      }
    }
    if (current === -1) break;

    open[current] = 0;
    closed[current] = 1;
    if (current === goal) break;

    const curC = current % Config.COLS;
    const curR = (current / Config.COLS) | 0;

    for (const [dc, dr] of neighbors) {
      const nc = curC + dc;
      const nr = curR + dr;
      if (!inBounds(nc, nr)) continue;

      const ni = idx(nc, nr);
      if (closed[ni]) continue;

      const stepCost = isCrumb(nc, nr) ? Config.CRUMB_COST_FOR_CAT : 1;
      const tentative = g[current] + stepCost;

      if (tentative < g[ni]) {
        came[ni] = current;
        g[ni] = tentative;
        f[ni] = tentative + heuristic(nc, nr, goalC, goalR);
        open[ni] = 1;
      }
    }
  }

  if (came[goal] === -1) return [];

  const path = [];
  let node = goal;
  while (node !== start && node !== -1) {
    path.push(node);
    node = came[node];
  }
  path.reverse();

  return path.map(p => ({ c: p % Config.COLS, r: (p / Config.COLS) | 0 }));
}

// ============================================
// Movement
// ============================================

/**
 * Move an agent (player or cat) by the given delta.
 *
 * Handles collision with grid boundaries and optionally with crumbs.
 * When blocked, snaps agent to cell center to prevent getting stuck.
 *
 * @param {Object} agent - Entity with x, y position properties
 * @param {number} dx - Horizontal movement delta (pixels)
 * @param {number} dy - Vertical movement delta (pixels)
 * @param {boolean} blockCrumb - If true, crumbs act as walls (used for player)
 */
function moveAgent(agent, dx, dy, blockCrumb) {
  const EPS = 1e-6;

  if (dx !== 0) {
    const cc = cellAt(agent.x, agent.y);
    const centerX = (cc.c + 0.5) * Config.TILE;
    const dir = Math.sign(dx);
    const nextC = cc.c + dir;
    const nextBlocked = blockCrumb && (!inBounds(nextC, cc.r) || isCrumb(nextC, cc.r));

    let nx = agent.x + dx;
    if (nextBlocked) {
      nx = dir > 0 ? Math.min(nx, centerX) : Math.max(nx, centerX);
    }

    const cell = cellAt(nx, agent.y);
    if (!(blockCrumb && isCrumb(cell.c, cell.r)) && inBounds(cell.c, cell.r)) {
      agent.x = nx;
    }

    if (nextBlocked && ((dir > 0 && agent.x >= centerX - EPS) || (dir < 0 && agent.x <= centerX + EPS))) {
      agent.x = centerX;
    }
  }

  if (dy !== 0) {
    const cc = cellAt(agent.x, agent.y);
    const centerY = (cc.r + 0.5) * Config.TILE;
    const dir = Math.sign(dy);
    const nextR = cc.r + dir;
    const nextBlocked = blockCrumb && (!inBounds(cc.c, nextR) || isCrumb(cc.c, nextR));

    let ny = agent.y + dy;
    if (nextBlocked) {
      ny = dir > 0 ? Math.min(ny, centerY) : Math.max(ny, centerY);
    }

    const cell = cellAt(agent.x, ny);
    if (!(blockCrumb && isCrumb(cell.c, cell.r)) && inBounds(cell.c, cell.r)) {
      agent.y = ny;
    }

    if (nextBlocked && ((dir > 0 && agent.y >= centerY - EPS) || (dir < 0 && agent.y <= centerY + EPS))) {
      agent.y = centerY;
    }
  }
}

/**
 * Check if a cell is part of the escape hole.
 * @param {number} c - Column
 * @param {number} r - Row
 * @returns {boolean} True if cell is in the hole opening
 */
function isHoleCell(c, r) {
  return c === 0 && holeOpenSet.has(idx(c, r));
}

/**
 * Decay a random crumb on the grid.
 *
 * With PROB_BIASED_RING_DECAY probability, targets the protective ring
 * around the hole. Otherwise picks a random cell.
 */
function decayOneCrumb() {
  let removed = false;
  if (ringSet.size && Math.random() < Config.PROB_BIASED_RING_DECAY) {
    const pick = randomFromSet(ringSet);
    if (pick !== null) {
      weakenCrumbByIndex(pick, 1);
      removed = true;
    }
  }
  if (!removed) {
    const c = (Math.random() * Config.COLS) | 0;
    const r = (Math.random() * Config.ROWS) | 0;
    if (crumbs[idx(c, r)] > 0) weakenCrumb(c, r, 1);
  }
}

// ============================================
// Game Update
// ============================================

/**
 * Main game update tick - called every frame.
 *
 * This is the heart of the game logic. It processes:
 * 1. Turn wishes - commits player direction changes when at valid turn points
 * 2. Player movement - moves player and snaps to grid alignment
 * 3. Crumb trail - leaves crumbs behind the player
 * 4. Win condition - checks if player reached the hole
 * 5. Cat AI - updates pathfinding, separation steering, and movement
 * 6. Collision - checks if any cat caught the player
 * 7. Crumb decay - gradually removes crumbs over time
 * 8. HUD - updates stats display
 *
 * @param {number} dt - Delta time in seconds since last frame
 */
function update(dt) {
  timeAlive += dt;

  // ── Turn Wishes ──────────────────────────────────────────────────────
  // Player input sets wishX/wishY. We only commit to dirX/dirY when the
  // player is near a cell center (Pac-Man style turning).
  if (wishX !== dirX || wishY !== dirY) wishTimer += dt;
  else wishTimer = 0;

  if (!(wishX === 0 && wishY === 0) && (wishX !== dirX || wishY !== dirY)) {
    if (wishX === 0 && wishY !== 0) {
      if (dirX === 0 && dirY === 0) {
        player.x = nearestColumnCenter(player.x, 0);
        dirX = 0;
        dirY = Math.sign(wishY);
        wishTimer = 0;
      } else if (canTurnVertical(player.x, dirX)) {
        player.x = nearestColumnCenter(player.x, dirX);
        dirX = 0;
        dirY = Math.sign(wishY);
        wishTimer = 0;
      } else if (wishTimer > 0.25) {
        player.x = nearestColumnCenter(player.x, dirX);
        dirX = 0;
        dirY = Math.sign(wishY);
        wishTimer = 0;
      }
    } else if (wishY === 0 && wishX !== 0) {
      if (dirX === 0 && dirY === 0) {
        player.y = nearestRowCenter(player.y, 0);
        dirY = 0;
        dirX = Math.sign(wishX);
        wishTimer = 0;
      } else if (canTurnHorizontal(player.y, dirY)) {
        player.y = nearestRowCenter(player.y, dirY);
        dirY = 0;
        dirX = Math.sign(wishX);
        wishTimer = 0;
      } else if (wishTimer > 0.25) {
        player.y = nearestRowCenter(player.y, dirY);
        dirY = 0;
        dirX = Math.sign(wishX);
        wishTimer = 0;
      }
    }
  }

  // ── Player Movement ───────────────────────────────────────────────────
  // Move in committed direction, blocked by crumbs (blockCrumb=true).
  const prevCell = cellAt(player.x, player.y);
  moveAgent(player, dirX * player.speed * dt, dirY * player.speed * dt, true);

  // Snap perpendicular axis to cell center for clean grid-aligned movement.
  if (dirX === 0 && dirY === 0) {
    const cc = cellAt(player.x, player.y);
    player.x = (cc.c + 0.5) * Config.TILE;
    player.y = (cc.r + 0.5) * Config.TILE;
  }

  // Snap perpendicular axis
  if (dirX === 0 && dirY !== 0) {
    const cc = cellAt(player.x, player.y);
    player.x = (cc.c + 0.5) * Config.TILE;
  } else if (dirY === 0 && dirX !== 0) {
    const cc = cellAt(player.x, player.y);
    player.y = (cc.r + 0.5) * Config.TILE;
  }

  // ── Crumb Trail ───────────────────────────────────────────────────────
  // When player enters a new cell, leave a crumb in the previous cell.
  // Don't leave crumbs in the hole area.
  const curCell = cellAt(player.x, player.y);
  if ((curCell.c !== prevCell.c || curCell.r !== prevCell.r) && inBounds(prevCell.c, prevCell.r)) {
    if (!isHoleCell(prevCell.c, prevCell.r)) {
      addCrumb(prevCell.c, prevCell.r, Config.CRUMB_STRENGTH);
    }
  }

  // ── Win Condition ────────────────────────────────────────────────────
  if (isHoleCell(curCell.c, curCell.r)) {
    level += 1;
    startLevel(false);
    return;
  }

  // ── Cat AI ────────────────────────────────────────────────────────────
  // Each cat: updates jitter, recalculates path, applies separation steering,
  // moves along path, destroys crumbs when exiting, and checks for player collision.
  for (let i = 0; i < cats.length; i++) {
    const cat = cats[i];

    // Track cell before movement for crumb destruction
    const prevCatCell = cellAt(cat.x, cat.y);

    // Goal jitter: random offset to prevent all cats targeting exact same point.
    cat.noiseTimer -= dt;
    if (cat.noiseTimer <= 0) {
      cat.goalJitter.dc = randInt(-Config.GOAL_JITTER_RANGE, Config.GOAL_JITTER_RANGE);
      cat.goalJitter.dr = randInt(-Config.GOAL_JITTER_RANGE, Config.GOAL_JITTER_RANGE);
      cat.noiseTimer = randRange(Config.NOISE_REFRESH_MIN, Config.NOISE_REFRESH_MAX);
    }

    // Pathfinding: periodically recalculate A* path to player (with jitter offset).
    cat.pathTimer -= dt;
    if (cat.pathTimer <= 0) {
      const ps = cellAt(player.x, player.y);
      const gc = Math.max(0, Math.min(Config.COLS - 1, ps.c + cat.goalJitter.dc));
      const gr = Math.max(0, Math.min(Config.ROWS - 1, ps.r + cat.goalJitter.dr));
      const cs = cellAt(cat.x, cat.y);
      cat.path = aStar(cs.c, cs.r, gc, gr);
      cat.pathTimer = 1 / Config.A_STAR_RECALC_HZ;
    }

    // Speed: cats slow down when in crumbs or about to enter one.
    // If crumbSpeedFactor is 0, cats are blocked by crumbs entirely.
    const cs0 = cellAt(cat.x, cat.y);
    let inCrumb = isCrumb(cs0.c, cs0.r);
    if (!inCrumb && cat.path && cat.path.length) {
      const nxt = cat.path[0];
      inCrumb = isCrumb(nxt.c, nxt.r);
    }
    let speedPx = cat.speedCells * Config.TILE * (inCrumb ? cat.crumbSpeedFactor : 1);

    // Separation steering: push cats apart so they don't stack on top of each other.
    let sepX = 0, sepY = 0;
    for (let j = 0; j < cats.length; j++) {
      if (i === j) continue;
      const other = cats[j];
      const dx = cat.x - other.x;
      const dy = cat.y - other.y;
      const d = Math.hypot(dx, dy);
      const R = Config.SEPARATION_RADIUS_CELLS * Config.TILE;
      if (d > 0 && d < R) {
        const m = (R - d) / R;
        sepX += (dx / d) * m;
        sepY += (dy / d) * m;
      }
    }
    if (sepX !== 0 || sepY !== 0) {
      const sl = Math.hypot(sepX, sepY) || 1;
      cat.x += (sepX / sl) * Config.SEPARATION_FORCE * dt;
      cat.y += (sepY / sl) * Config.SEPARATION_FORCE * dt;
    }

    // Path following: move toward next waypoint, pop when reached.
    if (cat.path && cat.path.length) {
      const next = cat.path[0];
      const target = centerOf(next.c, next.r);
      const dx = target.x - cat.x;
      const dy = target.y - cat.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = Math.min(d, speedPx * dt);
      cat.x += (dx / d) * step;
      cat.y += (dy / d) * step;
      if (d <= 0.5 || (Math.abs(cat.x - target.x) < 0.5 && Math.abs(cat.y - target.y) < 0.5)) {
        cat.path.shift();
      }
    } else {
      // Fallback: if no path, chase player directly with slight randomness.
      const dx = player.x + randRange(-0.2, 0.2) * Config.TILE - cat.x;
      const dy = player.y + randRange(-0.2, 0.2) * Config.TILE - cat.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = speedPx * dt;
      cat.x += (dx / d) * step;
      cat.y += (dy / d) * step;
    }

    // Crumb destruction: when cat exits a crumb cell, destroy it.
    const curCatCell = cellAt(cat.x, cat.y);
    if (curCatCell.c !== prevCatCell.c || curCatCell.r !== prevCatCell.r) {
      // Cat changed cells - destroy crumb in the cell they left
      if (isCrumb(prevCatCell.c, prevCatCell.r)) {
        weakenCrumb(prevCatCell.c, prevCatCell.r, Infinity);
      }
    }

    // Catch check: if cat overlaps player sufficiently, game over.
    const dist = Math.hypot(cat.x - player.x, cat.y - player.y);
    if (dist < (cat.r + player.r) * Config.CATCH_MARGIN) {
      running = false;
      ovTitle.textContent = 'Caught! 🐱';
      ovMsg.textContent = `Level ${level}, survived ${timeAlive.toFixed(1)}s.`;
      overlay.style.display = 'grid';
      return;
    }
  }

  // ── Crumb Decay ───────────────────────────────────────────────────────
  // Gradually remove crumbs over time so maze doesn't become permanent.
  decayAccum += dt * Config.CRUMB_DECAY_PER_SEC;
  while (decayAccum >= 1) {
    decayAccum -= 1;
    decayOneCrumb();
  }

  // ── HUD Update ───────────────────────────────────────────────────────
  if (((timeAlive * 10) | 0) % 2 === 0) {
    const crumbCount = countCrumbs();
    const sp = cats.length ? cats[0].speedCells : 0;
    hudStats.textContent = `Level ${level} · Time: ${timeAlive.toFixed(0)}s · Crumbs: ${crumbCount} · Cat speed: ${sp.toFixed(2)}c/s`;
  }
}

// ============================================
// Rendering
// ============================================
// All drawing functions. The game uses canvas 2D with HiDPI scaling.

/**
 * Lighten or darken a color.
 * @param {string} hexOrCSS - Input color (hex, rgb, or CSS variable value)
 * @param {number} amt - Amount to adjust: negative = darken, positive = lighten
 * @returns {string} RGB color string
 */
function shade(hexOrCSS, amt) {
  const tmp = document.createElement('canvas').getContext('2d');
  tmp.fillStyle = hexOrCSS;
  tmp.fillRect(0, 0, 1, 1);
  const data = tmp.getImageData(0, 0, 1, 1).data;
  const r = data[0] / 255, g = data[1] / 255, b = data[2] / 255;
  const t = amt < 0 ? 0 : 1, p = Math.abs(amt);
  const nr = r + (t - r) * p, ng = g + (t - g) * p, nb = b + (t - b) * p;
  return `rgb(${(nr * 255) | 0}, ${(ng * 255) | 0}, ${(nb * 255) | 0})`;
}

/**
 * Draw the background grid with subtle lines and vignette effect.
 */
function drawBackgroundGrid() {
  const w = Config.COLS * Config.TILE;
  const h = Config.ROWS * Config.TILE;
  ctx.save();

  const vg = ctx.createRadialGradient(
    w * 0.5, h * 0.45, Math.min(w, h) * 0.25,
    w * 0.5, h * 0.5, Math.max(w, h) * 0.68
  );
  vg.addColorStop(0, 'rgba(255,255,255,0.02)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= Config.COLS; c++) {
    ctx.moveTo(c * Config.TILE, 0);
    ctx.lineTo(c * Config.TILE, h);
  }
  for (let r = 0; r <= Config.ROWS; r++) {
    ctx.moveTo(0, r * Config.TILE);
    ctx.lineTo(w, r * Config.TILE);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw all crumbs on the grid as small colored squares.
 */
function drawCrumbs() {
  ctx.save();
  const crumbColor = getCSS('--crumb');
  const crumb2Color = getCSS('--crumb2');

  for (let r = 0; r < Config.ROWS; r++) {
    for (let c = 0; c < Config.COLS; c++) {
      if (crumbs[idx(c, r)] > 0) {
        const x = c * Config.TILE;
        const y = r * Config.TILE;
        ctx.fillStyle = crumbColor;
        ctx.fillRect(x + 3, y + 3, Config.TILE - 6, Config.TILE - 6);
        ctx.fillStyle = crumb2Color;
        ctx.fillRect(x + 5, y + 5, Config.TILE - 10, Config.TILE - 10);
      }
    }
  }
  ctx.restore();
}

/**
 * Draw the escape hole on the left edge of the grid.
 */
function drawHole() {
  const rmin = Math.max(0, hole.r - hole.halfHeight);
  const rmax = Math.min(Config.ROWS - 1, hole.r + hole.halfHeight);
  const y = rmin * Config.TILE;
  const h = (rmax - rmin + 1) * Config.TILE;
  const w = Math.floor(Config.TILE * 1.1);

  ctx.save();
  const g = ctx.createLinearGradient(0, y, w, y);
  g.addColorStop(0, '#000');
  g.addColorStop(1, '#050505');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.fillText('Hole', 6, y - 6 < 12 ? 12 : y - 6);
  ctx.restore();
}

/**
 * Draw the mouse character (player) with ears, eyes, nose, and whiskers.
 * @param {number} x - Center X position
 * @param {number} y - Center Y position
 * @param {number} r - Radius
 * @param {string} color - Fill color
 */
function drawMouseHead(x, y, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  const er = r * 0.55;
  const ey = y - r * 0.85;
  const ex = r * 0.68;
  ctx.fillStyle = shade(color, 0.08);
  ctx.beginPath();
  ctx.arc(x - ex, ey, er, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + ex, ey, er, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.beginPath();
  ctx.arc(x - r * 0.38, y - r * 0.36, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.38, y - r * 0.36, r * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // Nose
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.arc(x, y + r * 0.24, r * 0.16, 0, Math.PI * 2);
  ctx.fill();

  // Whiskers
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  const wy = y + r * 0.24;
  const wdx = r * 0.65;
  const wgap = r * 0.12;
  for (let i = -1; i <= 1; i++) {
    const off = wy + i * wgap;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.12, off);
    ctx.lineTo(x - wdx, off + i * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + r * 0.12, off);
    ctx.lineTo(x + wdx, off + i * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw a cat character with triangular ears, slit eyes, nose, and whiskers.
 * @param {number} x - Center X position
 * @param {number} y - Center Y position
 * @param {number} r - Radius
 * @param {string} color - Fill color
 */
function drawCatHead(x, y, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  const earBaseY = y - r * 0.45;
  const earApexY = y - r * 1.7;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.9, earBaseY);
  ctx.lineTo(x - r * 0.15, earBaseY);
  ctx.lineTo(x - r * 0.55, earApexY);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.9, earBaseY);
  ctx.lineTo(x + r * 0.15, earBaseY);
  ctx.lineTo(x + r * 0.55, earApexY);
  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.36, r * 0.1, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + r * 0.3, y - r * 0.36, r * 0.1, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nose
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.beginPath();
  ctx.arc(x, y + r * 0.18, r * 0.16, 0, Math.PI * 2);
  ctx.fill();

  // Whiskers
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  const wy = y + r * 0.18;
  const wdx = r * 0.8;
  const wgap = r * 0.14;
  for (let i = -1; i <= 1; i++) {
    const off = wy + i * wgap;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.15, off);
    ctx.lineTo(x - wdx, off + i * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + r * 0.15, off);
    ctx.lineTo(x + wdx, off + i * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw a debug path visualization (dashed line through cells).
 * Shown when holding Shift key.
 * @param {Array<{c: number, r: number}>} cells - Path waypoints
 */
function drawPath(cells) {
  if (!cells || !cells.length) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(122,162,255,0.75)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  let first = true;
  for (const cell of cells) {
    const p = centerOf(cell.c, cell.r);
    if (first) {
      ctx.moveTo(p.x, p.y);
      first = false;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Main render function - draws entire game scene.
 * Called every frame after update().
 */
function draw() {
  ctx.clearRect(0, 0, canvas.width / DPR, canvas.height / DPR);
  drawBackgroundGrid();
  drawCrumbs();
  drawHole();
  drawMouseHead(player.x, player.y + player.r * 0.05, player.r, player.color);
  for (const cat of cats) {
    drawCatHead(cat.x, cat.y, cat.r, cat.color);
  }
  if (keys['Shift'] && cats.length && cats[0].path) {
    drawPath(cats[0].path);
  }
}

// ============================================
// Input Handling
// ============================================
// Supports arrow keys, WASD, Space to stop, R to restart, and click/tap.

/**
 * Set desired direction based on key press.
 * @param {string} key - Key name (e.g., 'ArrowLeft', 'a')
 */
function setDirectionFromKey(key) {
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
    wishX = -1;
    wishY = 0;
  } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
    wishX = 1;
    wishY = 0;
  } else if (key === 'ArrowUp' || key === 'w' || key === 'W') {
    wishX = 0;
    wishY = -1;
  } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
    wishX = 0;
    wishY = 1;
  }
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].includes(e.key)) {
    e.preventDefault();
  }
  if (e.key === 'r' || e.key === 'R') {
    startLevel(true);
    return;
  }
  if (e.key === ' ' || e.key === 'Spacebar') {
    dirX = 0;
    dirY = 0;
    wishX = 0;
    wishY = 0;
    return;
  }
  setDirectionFromKey(e.key);
  keys[e.key] = true;
});

window.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

canvas.addEventListener('pointerdown', (e) => {
  canvas.focus();
  const rect = canvas.getBoundingClientRect();
  const px = ((e.clientX - rect.left) * (canvas.width / rect.width)) / DPR;
  const py = ((e.clientY - rect.top) * (canvas.height / rect.height)) / DPR;
  const dx = px - player.x;
  const dy = py - player.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    wishX = Math.sign(dx);
    wishY = 0;
  } else {
    wishX = 0;
    wishY = Math.sign(dy);
  }
});

resetBtn.addEventListener('click', () => startLevel(true));
playAgain.addEventListener('click', () => startLevel(true));

// ============================================
// Game Loop
// ============================================

/** Timestamp of previous frame for delta time calculation */
let lastTime = performance.now();

/**
 * Main game loop - called every frame via requestAnimationFrame.
 * Calculates delta time, updates game state, and renders.
 * @param {number} ts - Timestamp in milliseconds
 */
function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;
  if (running) update(dt);
  draw();
  requestAnimationFrame(loop);
}

// ============================================
// Start Game
// ============================================
startLevel(true);
requestAnimationFrame(loop);
