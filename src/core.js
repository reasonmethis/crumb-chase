/**
 * Core game logic - pure functions with no DOM dependencies.
 * These can be tested in Node.js and shared with the browser game.
 */

// ============================================
// Grid Utilities
// ============================================

/**
 * Convert column/row to flat array index.
 */
function idx(c, r, cols) {
  return r * cols + c;
}

/**
 * Check if column/row is within grid bounds.
 */
function inBounds(c, r, cols, rows) {
  return c >= 0 && r >= 0 && c < cols && r < rows;
}

/**
 * Convert pixel coordinates to cell column/row.
 */
function cellAt(x, y, tileSize) {
  return { c: Math.floor(x / tileSize), r: Math.floor(y / tileSize) };
}

/**
 * Get pixel coordinates of cell center.
 */
function centerOf(c, r, tileSize) {
  return { x: (c + 0.5) * tileSize, y: (r + 0.5) * tileSize };
}

// ============================================
// Turn/Movement Helpers
// ============================================

/**
 * Find nearest column center (current or next based on movement direction).
 */
function nearestColumnCenter(x, movingDirX, tileSize) {
  const c = Math.floor(x / tileSize);
  const cx0 = (c + 0.5) * tileSize;
  if (movingDirX !== 0) {
    const cx1 = (c + 0.5 + Math.sign(movingDirX)) * tileSize;
    return Math.abs(x - cx0) < Math.abs(x - cx1) ? cx0 : cx1;
  }
  return cx0;
}

/**
 * Check if a vertical turn is possible (near a column center).
 */
function canTurnVertical(x, movingDirX, tileSize, turnEps) {
  const c = Math.floor(x / tileSize);
  const cx0 = (c + 0.5) * tileSize;
  if (Math.abs(x - cx0) <= turnEps) return true;
  if (movingDirX !== 0) {
    const cx1 = (c + 0.5 + Math.sign(movingDirX)) * tileSize;
    if (Math.abs(x - cx1) <= turnEps) return true;
  }
  return false;
}

/**
 * Find nearest row center (current or next based on movement direction).
 */
function nearestRowCenter(y, movingDirY, tileSize) {
  const r = Math.floor(y / tileSize);
  const cy0 = (r + 0.5) * tileSize;
  if (movingDirY !== 0) {
    const cy1 = (r + 0.5 + Math.sign(movingDirY)) * tileSize;
    return Math.abs(y - cy0) < Math.abs(y - cy1) ? cy0 : cy1;
  }
  return cy0;
}

/**
 * Check if a horizontal turn is possible (near a row center).
 */
function canTurnHorizontal(y, movingDirY, tileSize, turnEps) {
  const r = Math.floor(y / tileSize);
  const cy0 = (r + 0.5) * tileSize;
  if (Math.abs(y - cy0) <= turnEps) return true;
  if (movingDirY !== 0) {
    const cy1 = (r + 0.5 + Math.sign(movingDirY)) * tileSize;
    if (Math.abs(y - cy1) <= turnEps) return true;
  }
  return false;
}

// ============================================
// Random Utilities
// ============================================

/**
 * Random integer in range [a, b] inclusive.
 */
function randInt(a, b) {
  return ((Math.random() * (b - a + 1)) | 0) + a;
}

/**
 * Random float in range [a, b).
 */
function randRange(a, b) {
  return a + Math.random() * (b - a);
}

/**
 * Pick random element from a Set.
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
// A* Pathfinding
// ============================================

/**
 * Manhattan distance heuristic.
 */
function heuristic(c1, r1, c2, r2) {
  return Math.abs(c1 - c2) + Math.abs(r1 - r2);
}

/**
 * A* pathfinding algorithm.
 * @param {number} startC - Start column
 * @param {number} startR - Start row
 * @param {number} goalC - Goal column
 * @param {number} goalR - Goal row
 * @param {number} cols - Grid width
 * @param {number} rows - Grid height
 * @param {function} getCost - Function (c, r) => cost for stepping into cell (Infinity = impassable)
 * @returns {Array<{c: number, r: number}>} Path from start to goal (excluding start, including goal)
 */
function aStar(startC, startR, goalC, goalR, cols, rows, getCost) {
  const N = cols * rows;
  const start = startR * cols + startC;
  const goal = goalR * cols + goalC;

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
    // Find node with lowest f score in open set
    let current = -1;
    let bestF = Infinity;
    for (let i = 0; i < N; i++) {
      if (open[i] && f[i] < bestF) {
        bestF = f[i];
        current = i;
      }
    }

    if (current === -1) break; // No path found

    open[current] = 0;
    closed[current] = 1;

    if (current === goal) break; // Found goal

    const curC = current % cols;
    const curR = (current / cols) | 0;

    for (const [dc, dr] of neighbors) {
      const nc = curC + dc;
      const nr = curR + dr;

      if (!inBounds(nc, nr, cols, rows)) continue;

      const ni = nr * cols + nc;
      if (closed[ni]) continue;

      const stepCost = getCost(nc, nr);
      if (stepCost === Infinity) continue; // Impassable

      const tentative = g[current] + stepCost;

      if (tentative < g[ni]) {
        came[ni] = current;
        g[ni] = tentative;
        f[ni] = tentative + heuristic(nc, nr, goalC, goalR);
        open[ni] = 1;
      }
    }
  }

  // Reconstruct path
  if (came[goal] === -1) return []; // No path found

  const path = [];
  let node = goal;
  while (node !== start && node !== -1) {
    path.push(node);
    node = came[node];
  }
  path.reverse();

  // Convert to {c, r} objects
  return path.map(p => ({ c: p % cols, r: (p / cols) | 0 }));
}

// ============================================
// Crumb Grid Management
// ============================================

/**
 * Create a new crumb grid.
 */
function createCrumbGrid(cols, rows) {
  return {
    data: new Float32Array(cols * rows),
    cols,
    rows,
  };
}

/**
 * Check if cell has crumb (or is out of bounds, treated as wall).
 */
function hasCrumb(grid, c, r) {
  if (!inBounds(c, r, grid.cols, grid.rows)) return true; // Out of bounds = wall
  return grid.data[idx(c, r, grid.cols)] > 0;
}

/**
 * Add or strengthen crumb at cell.
 */
function addCrumb(grid, c, r, strength) {
  if (inBounds(c, r, grid.cols, grid.rows)) {
    const k = idx(c, r, grid.cols);
    grid.data[k] = Math.max(grid.data[k], strength);
  }
}

/**
 * Remove crumb at cell completely.
 */
function removeCrumb(grid, c, r) {
  if (inBounds(c, r, grid.cols, grid.rows)) {
    grid.data[idx(c, r, grid.cols)] = 0;
  }
}

/**
 * Weaken crumb at cell by amount.
 */
function weakenCrumb(grid, c, r, amount) {
  if (inBounds(c, r, grid.cols, grid.rows)) {
    const k = idx(c, r, grid.cols);
    if (grid.data[k] > 0) {
      grid.data[k] = Math.max(0, grid.data[k] - amount);
    }
  }
}

/**
 * Count total crumbs in grid.
 */
function countCrumbs(grid) {
  let count = 0;
  for (let i = 0; i < grid.data.length; i++) {
    if (grid.data[i] > 0) count++;
  }
  return count;
}

// ============================================
// Collision Detection
// ============================================

/**
 * Check if two circles overlap.
 */
function circlesOverlap(x1, y1, r1, x2, y2, r2, margin = 0.75) {
  const dist = Math.hypot(x1 - x2, y1 - y2);
  return dist < (r1 + r2) * margin;
}

/**
 * Calculate distance between two points.
 */
function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

// ============================================
// Level Configuration
// ============================================

const LEVEL_CONFIG = [
  null, // Level 0 doesn't exist
  { cats: 1, speedFactor: 0.55 },
  { cats: 1, speedFactor: 0.9 },
  { cats: 2, speedFactor: 0.55 },
  { cats: 2, speedFactor: 0.9 },
  { cats: 2, speedFactor: 1.2 },
  { cats: 3, speedFactor: 0.75 },
  { cats: 3, speedFactor: 1.0 },
  { cats: 3, speedFactor: 1.25 },
  { cats: 3, speedFactor: 1.5 },
  { cats: 4, speedFactor: 1.2 },
];

/**
 * Get level configuration (clamped to valid range).
 */
function getLevelConfig(level) {
  const i = Math.max(1, Math.min(LEVEL_CONFIG.length - 1, level));
  return LEVEL_CONFIG[i];
}

// ============================================
// Movement Logic
// ============================================

/**
 * Move an agent with collision checking against crumbs.
 * Returns the new position.
 */
function moveWithCollision(x, y, dx, dy, tileSize, cols, rows, isCrumbBlocking) {
  const EPS = 1e-6;
  let newX = x;
  let newY = y;

  // Horizontal movement
  if (dx !== 0) {
    const cc = cellAt(x, y, tileSize);
    const centerX = (cc.c + 0.5) * tileSize;
    const dir = Math.sign(dx);
    const nextC = cc.c + dir;
    const nextBlocked = !inBounds(nextC, cc.r, cols, rows) ||
                        (isCrumbBlocking && isCrumbBlocking(nextC, cc.r));

    let nx = x + dx;
    if (nextBlocked) {
      nx = dir > 0 ? Math.min(nx, centerX) : Math.max(nx, centerX);
    }

    const cell = cellAt(nx, y, tileSize);
    const cellBlocked = isCrumbBlocking && isCrumbBlocking(cell.c, cell.r);
    if (!cellBlocked && inBounds(cell.c, cell.r, cols, rows)) {
      newX = nx;
    }

    // Snap to center if clamped
    if (nextBlocked &&
        ((dir > 0 && newX >= centerX - EPS) || (dir < 0 && newX <= centerX + EPS))) {
      newX = centerX;
    }
  }

  // Vertical movement
  if (dy !== 0) {
    const cc = cellAt(newX, y, tileSize);
    const centerY = (cc.r + 0.5) * tileSize;
    const dir = Math.sign(dy);
    const nextR = cc.r + dir;
    const nextBlocked = !inBounds(cc.c, nextR, cols, rows) ||
                        (isCrumbBlocking && isCrumbBlocking(cc.c, nextR));

    let ny = y + dy;
    if (nextBlocked) {
      ny = dir > 0 ? Math.min(ny, centerY) : Math.max(ny, centerY);
    }

    const cell = cellAt(newX, ny, tileSize);
    const cellBlocked = isCrumbBlocking && isCrumbBlocking(cell.c, cell.r);
    if (!cellBlocked && inBounds(cell.c, cell.r, cols, rows)) {
      newY = ny;
    }

    // Snap to center if clamped
    if (nextBlocked &&
        ((dir > 0 && newY >= centerY - EPS) || (dir < 0 && newY <= centerY + EPS))) {
      newY = centerY;
    }
  }

  return { x: newX, y: newY };
}

// ============================================
// Exports
// ============================================

// Support both Node.js (CommonJS) and browser (ES modules)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // Grid utilities
    idx,
    inBounds,
    cellAt,
    centerOf,

    // Turn helpers
    nearestColumnCenter,
    canTurnVertical,
    nearestRowCenter,
    canTurnHorizontal,

    // Random utilities
    randInt,
    randRange,
    randomFromSet,

    // Pathfinding
    heuristic,
    aStar,

    // Crumb management
    createCrumbGrid,
    hasCrumb,
    addCrumb,
    removeCrumb,
    weakenCrumb,
    countCrumbs,

    // Collision
    circlesOverlap,
    distance,

    // Level config
    LEVEL_CONFIG,
    getLevelConfig,

    // Movement
    moveWithCollision,
  };
}
