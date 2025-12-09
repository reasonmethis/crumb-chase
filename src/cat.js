/**
 * Crumb Chase - Cat Module
 *
 * Manages cat entities that chase the player using A* pathfinding.
 * Cats slow down in crumbs and can destroy them by walking through.
 *
 * @module cat
 */

import * as Config from './config.js';
import { randInt, randRange } from './core.js';

/**
 * Cat class - manages a single cat's state and behavior.
 *
 * Cats use A* pathfinding to chase the player, with goal jitter
 * to prevent multiple cats from stacking on the same point.
 */
export class Cat {
  /**
   * Create a new cat.
   * @param {Object} options - Cat configuration
   * @param {number} options.id - Unique cat identifier
   * @param {number} options.x - Starting X position (pixels, center)
   * @param {number} options.y - Starting Y position (pixels, center)
   * @param {number} options.speedCells - Movement speed in cells per second
   * @param {number} options.crumbSpeedFactor - Speed multiplier in crumbs (0 = blocked)
   * @param {string} options.color - Fill color for rendering
   */
  constructor(options) {
    /** Unique identifier */
    this.id = options.id;

    /** X position (center) in pixels */
    this.x = options.x;

    /** Y position (center) in pixels */
    this.y = options.y;

    /** Collision radius in pixels */
    this.r = Config.TILE * Config.CAT_RADIUS_FACTOR;

    /** Movement speed in cells per second */
    this.speedCells = options.speedCells;

    /** Speed multiplier when in crumbs (0 = can't enter) */
    this.crumbSpeedFactor = options.crumbSpeedFactor;

    /** Fill color for rendering */
    this.color = options.color;

    /** Current A* path to player (array of {c, r} cells) */
    this.path = [];

    /** Countdown until next path recalculation */
    this.pathTimer = 0;

    /** Random offset added to goal to prevent cats stacking */
    this.goalJitter = {
      dc: randInt(-Config.GOAL_JITTER_RANGE, Config.GOAL_JITTER_RANGE),
      dr: randInt(-Config.GOAL_JITTER_RANGE, Config.GOAL_JITTER_RANGE),
    };

    /** Previous cell position (for detecting cell changes) */
    this.lastCell = { c: -1, r: -1 };
  }

  /**
   * Create a cat from spawn grid configuration.
   * @param {number} colFrac - X position as fraction of grid width (0-1)
   * @param {number} rowFrac - Y position as fraction of grid height (0-1)
   * @param {number} speedCells - Movement speed in cells per second
   * @param {number} crumbSpeedFactor - Speed multiplier in crumbs
   * @param {number} id - Unique cat identifier
   * @param {string} color - Fill color
   * @returns {Cat} New cat instance
   */
  static fromSpawnFraction(colFrac, rowFrac, speedCells, crumbSpeedFactor, id, color) {
    const col = Math.max(0, Math.min(Config.COLS - 1, Math.round(Config.COLS * colFrac)));
    const row = Math.max(0, Math.min(Config.ROWS - 1, Math.round(Config.ROWS * rowFrac)));
    const x = (col + 0.5) * Config.TILE;
    const y = (row + 0.5) * Config.TILE;

    return new Cat({
      id,
      x,
      y,
      speedCells,
      crumbSpeedFactor,
      color,
    });
  }

  /**
   * Get the current cell this cat is in.
   * @returns {{c: number, r: number}} Current cell
   */
  getCell() {
    return {
      c: Math.floor(this.x / Config.TILE),
      r: Math.floor(this.y / Config.TILE),
    };
  }

  /**
   * Check if it's time to recalculate path. Also refreshes goal jitter.
   * @param {number} dt - Delta time in seconds
   * @returns {boolean} True if path should be recalculated
   */
  shouldRecalculatePath(dt) {
    this.pathTimer -= dt;
    if (this.pathTimer <= 0) {
      this.pathTimer = 1 / Config.A_STAR_RECALC_HZ;
      // Refresh jitter when recalculating path
      this.goalJitter.dc = randInt(-Config.GOAL_JITTER_RANGE, Config.GOAL_JITTER_RANGE);
      this.goalJitter.dr = randInt(-Config.GOAL_JITTER_RANGE, Config.GOAL_JITTER_RANGE);
      return true;
    }
    return false;
  }

  /**
   * Get the goal cell for pathfinding (player position + jitter).
   * @param {{c: number, r: number}} playerCell - Player's current cell
   * @returns {{c: number, r: number}} Goal cell for pathfinding
   */
  getGoalCell(playerCell) {
    return {
      c: Math.max(0, Math.min(Config.COLS - 1, playerCell.c + this.goalJitter.dc)),
      r: Math.max(0, Math.min(Config.ROWS - 1, playerCell.r + this.goalJitter.dr)),
    };
  }

  /**
   * Calculate current movement speed, considering crumbs.
   * @param {Object} grid - Grid instance for crumb checks
   * @returns {number} Speed in pixels per second
   */
  calculateSpeed(grid) {
    const cell = this.getCell();
    let inCrumb = grid.isCrumb(cell.c, cell.r);

    // Also check next cell in path
    if (!inCrumb && this.path && this.path.length) {
      const next = this.path[0];
      inCrumb = grid.isCrumb(next.c, next.r);
    }

    return this.speedCells * Config.TILE * (inCrumb ? this.crumbSpeedFactor : 1);
  }

  /**
   * Apply separation steering from other cats.
   * @param {Cat[]} allCats - Array of all cats (including this one)
   * @param {number} dt - Delta time in seconds
   */
  applySeparation(allCats, dt) {
    let sepX = 0, sepY = 0;

    for (const other of allCats) {
      if (other.id === this.id) continue;

      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const d = Math.hypot(dx, dy);
      const R = Config.SEPARATION_RADIUS_CELLS * Config.TILE;

      if (d > 0 && d < R) {
        const m = (R - d) / R;
        sepX += (dx / d) * m;
        sepY += (dy / d) * m;
      }
    }

    if (sepX !== 0 || sepY !== 0) {
      const len = Math.hypot(sepX, sepY) || 1;
      this.x += (sepX / len) * Config.SEPARATION_FORCE * dt;
      this.y += (sepY / len) * Config.SEPARATION_FORCE * dt;
    }
  }

  /**
   * Move along the current path toward the player.
   * @param {number} speedPx - Speed in pixels per second
   * @param {number} dt - Delta time in seconds
   * @param {{x: number, y: number}} playerPos - Player position for fallback chase
   */
  moveAlongPath(speedPx, dt, playerPos) {
    if (this.path && this.path.length) {
      // Follow path
      const next = this.path[0];
      const targetX = (next.c + 0.5) * Config.TILE;
      const targetY = (next.r + 0.5) * Config.TILE;
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = Math.min(d, speedPx * dt);

      this.x += (dx / d) * step;
      this.y += (dy / d) * step;

      // Pop waypoint when reached
      if (d <= 0.5 || (Math.abs(this.x - targetX) < 0.5 && Math.abs(this.y - targetY) < 0.5)) {
        this.path.shift();
      }
    } else {
      // Fallback: chase player directly with slight randomness
      const dx = playerPos.x + randRange(-0.2, 0.2) * Config.TILE - this.x;
      const dy = playerPos.y + randRange(-0.2, 0.2) * Config.TILE - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = speedPx * dt;

      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
    }
  }

  /**
   * Check if cat has entered a new cell since last check.
   * @returns {{changed: boolean, prevCell: {c: number, r: number}}} Change status and previous cell
   */
  checkCellChange() {
    const curCell = this.getCell();
    const changed = curCell.c !== this.lastCell.c || curCell.r !== this.lastCell.r;
    const prevCell = { ...this.lastCell };

    // Update last cell for next check
    this.lastCell = curCell;

    return { changed, prevCell };
  }

  /**
   * Check if this cat has caught the player.
   * @param {{x: number, y: number, r: number}} player - Player position and radius
   * @returns {boolean} True if cat caught the player
   */
  hasCaughtPlayer(player) {
    const dist = Math.hypot(this.x - player.x, this.y - player.y);
    return dist < (this.r + player.r) * Config.CATCH_MARGIN;
  }
}
