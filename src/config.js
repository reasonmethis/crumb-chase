/**
 * Crumb Chase - Game Configuration
 *
 * All game constants and tunables in one place.
 * Modify these values to adjust game balance and behavior.
 *
 * @module config
 */

// ============================================
// Grid / Sizing
// ============================================

export const TILE = 20;        // Pixels per grid cell
export const COLS = 40;        // Grid width (cells) -> canvas width = 800px
export const ROWS = 25;        // Grid height (cells) -> canvas height = 500px

// ============================================
// Player (Mouse)
// ============================================

export const PLAYER_SPEED_CELLS = 6.0;    // Mouse movement speed (cells/sec)
export const PLAYER_RADIUS_FACTOR = 0.76; // Radius as fraction of TILE

// ============================================
// Cat AI
// ============================================

export const CAT_BASE_SPEED_CELLS = 3.2;  // Base cat speed (cells/sec) - unused, levels override
export const CAT_SPEED_IN_CRUMB = 0.25;   // Speed multiplier when in crumb (0.25 = 4x slower)
export const CAT_RADIUS_FACTOR = 0.88;    // Radius as fraction of TILE
export const CAT_EAT_RATE = 1.0;          // Crumb strength removed per second by a cat

// Pathfinding
export const A_STAR_RECALC_HZ = 5;        // Path recalculation frequency (per second)
export const CRUMB_COST_FOR_CAT = 14;     // A* cost for crumb tiles (vs 1 for open)

// Cat divergence (prevent stacking)
export const GOAL_JITTER_RANGE = 1;       // Random offset added to cat goal (±cells)
export const NOISE_REFRESH_MIN = 0.8;     // Min time between jitter updates (seconds)
export const NOISE_REFRESH_MAX = 1.6;     // Max time between jitter updates (seconds)
export const SEPARATION_RADIUS_CELLS = 3.0; // Separation steering radius (cells)
export const SEPARATION_FORCE = 40;       // Separation steering strength (px/sec)

// ============================================
// Crumbs
// ============================================

export const CRUMB_STRENGTH = 1;          // Default crumb thickness (trail)
export const RING_CRUMB_STRENGTH = 1;     // Crumb thickness for hole barrier
export const CRUMB_DECAY_PER_SEC = 12.0;  // Random crumb decay attempts per second
export const PROB_BIASED_RING_DECAY = 0;  // Probability of targeting ring crumbs for decay

// ============================================
// Movement / Turning
// ============================================

export const TURN_EPS_FACTOR = 0.35;      // Turn tolerance as fraction of TILE

/**
 * Get the turn tolerance in pixels.
 * Player must be within this distance of cell center to turn.
 * @returns {number} Turn tolerance in pixels
 */
export function getTurnEps() {
  return TILE * TURN_EPS_FACTOR;
}

// ============================================
// Hole (Goal)
// ============================================

export const HOLE_COLUMN = 0;             // Hole is on the left edge
export const HOLE_HALF_HEIGHT = 2;        // Hole spans 2*halfHeight+1 cells vertically

/**
 * Get the row where the hole is centered.
 * @returns {number} Center row of the escape hole
 */
export function getHoleRow() {
  return Math.floor(ROWS * 0.5);
}

// ============================================
// Level Configuration
// ============================================

export const LEVEL_CONFIG = [
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

export const MAX_LEVEL = LEVEL_CONFIG.length - 1;

/**
 * Get configuration for a specific level.
 * Clamps level to valid range [1, MAX_LEVEL].
 * @param {number} level - Level number
 * @returns {{cats: number, speedFactor: number}} Level configuration
 */
export function getLevelConfig(level) {
  const i = Math.max(1, Math.min(MAX_LEVEL, level));
  return LEVEL_CONFIG[i];
}

// ============================================
// Cat Spawn Positions
// ============================================

export const CAT_SPAWN_GRID = [
  [0.35, 0.25],  // Cat 1: upper-left area
  [0.35, 0.75],  // Cat 2: lower-left area
  [0.65, 0.25],  // Cat 3: upper-right area
  [0.65, 0.75],  // Cat 4: lower-right area
  [0.5, 0.5],    // Cat 5: center (fallback)
];

// ============================================
// Player Spawn Position
// ============================================

/**
 * Get player starting X position (pixels).
 * Player spawns on the right side of the grid.
 * @returns {number} X coordinate in pixels
 */
export function getPlayerSpawnX() {
  return (COLS - 5 + 0.5) * TILE;
}

/**
 * Get player starting Y position (pixels).
 * Player spawns vertically centered.
 * @returns {number} Y coordinate in pixels
 */
export function getPlayerSpawnY() {
  return (ROWS * 0.5 + 0.5) * TILE;
}

// ============================================
// Collision
// ============================================

export const CATCH_MARGIN = 0.75;         // Collision detection margin (0.75 = must overlap 75%)

// ============================================
// Debug
// ============================================

export const DEBUG = false;               // Enable sanity checks and debug rendering

// ============================================
// Computed Values (for convenience)
// ============================================

export const CANVAS_WIDTH = COLS * TILE;
export const CANVAS_HEIGHT = ROWS * TILE;
export const TOTAL_CELLS = COLS * ROWS;
