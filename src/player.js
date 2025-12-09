/**
 * Crumb Chase - Player Module
 *
 * Manages the player (mouse) state including position, movement direction,
 * and Pac-Man style turn mechanics.
 *
 * @module player
 */

import * as Config from './config.js';

/**
 * Player class - manages mouse position and movement state.
 *
 * The player uses a "wish" system for turning:
 * - wishX/wishY: The direction the player wants to go (from input)
 * - dirX/dirY: The committed direction the player is actually moving
 * - Turns only commit when near a cell center (Pac-Man style)
 */
export class Player {
  /**
   * Create a new player.
   * @param {Object} options - Optional overrides
   * @param {number} options.x - Starting X position (defaults to spawn position)
   * @param {number} options.y - Starting Y position (defaults to spawn position)
   * @param {string} options.color - Fill color (defaults to CSS --mouse variable)
   */
  constructor(options = {}) {
    /** X position (center of entity) in pixels */
    this.x = options.x ?? Config.getPlayerSpawnX();

    /** Y position (center of entity) in pixels */
    this.y = options.y ?? Config.getPlayerSpawnY();

    /** Collision radius in pixels */
    this.r = Config.TILE * Config.PLAYER_RADIUS_FACTOR;

    /** Movement speed in pixels per second */
    this.speed = Config.PLAYER_SPEED_CELLS * Config.TILE;

    /** Fill color for rendering */
    this.color = options.color ?? null; // Set lazily from CSS

    /** Last cell the player was in (for crumb trail) */
    this.lastCell = { c: -1, r: -1 };

    /** Current committed movement direction X (-1, 0, or 1) */
    this.dirX = 0;

    /** Current committed movement direction Y (-1, 0, or 1) */
    this.dirY = 0;

    /** Desired direction X from player input */
    this.wishX = 0;

    /** Desired direction Y from player input */
    this.wishY = 0;

    /** Time since wish was set (for failsafe snap) */
    this.wishTimer = 0;

    /** Tolerance for committing turns at cell centers */
    this.turnEps = Config.getTurnEps();
  }

  /**
   * Reset player to starting position and clear movement.
   */
  reset() {
    this.x = Config.getPlayerSpawnX();
    this.y = Config.getPlayerSpawnY();
    this.lastCell = { c: -1, r: -1 };
    this.dirX = 0;
    this.dirY = 0;
    this.wishX = 0;
    this.wishY = 0;
    this.wishTimer = 0;
  }

  /**
   * Set the desired movement direction from player input.
   * @param {number} dx - Desired X direction (-1, 0, or 1)
   * @param {number} dy - Desired Y direction (-1, 0, or 1)
   */
  setWish(dx, dy) {
    this.wishX = dx;
    this.wishY = dy;
  }

  /**
   * Stop all movement immediately.
   */
  stop() {
    this.dirX = 0;
    this.dirY = 0;
    this.wishX = 0;
    this.wishY = 0;
  }

  /**
   * Find the nearest column center for snapping during a turn.
   * @param {number} movingDirX - Current horizontal movement direction
   * @returns {number} X coordinate of nearest column center
   */
  nearestColumnCenter(movingDirX) {
    const c = Math.floor(this.x / Config.TILE);
    const cx0 = (c + 0.5) * Config.TILE;
    if (movingDirX !== 0) {
      const cx1 = (c + 0.5 + Math.sign(movingDirX)) * Config.TILE;
      return Math.abs(this.x - cx0) < Math.abs(this.x - cx1) ? cx0 : cx1;
    }
    return cx0;
  }

  /**
   * Find the nearest row center for snapping during a turn.
   * @param {number} movingDirY - Current vertical movement direction
   * @returns {number} Y coordinate of nearest row center
   */
  nearestRowCenter(movingDirY) {
    const r = Math.floor(this.y / Config.TILE);
    const cy0 = (r + 0.5) * Config.TILE;
    if (movingDirY !== 0) {
      const cy1 = (r + 0.5 + Math.sign(movingDirY)) * Config.TILE;
      return Math.abs(this.y - cy0) < Math.abs(this.y - cy1) ? cy0 : cy1;
    }
    return cy0;
  }

  /**
   * Check if player can commit a vertical turn (change to up/down movement).
   * @returns {boolean} True if turn is allowed
   */
  canTurnVertical() {
    const c = Math.floor(this.x / Config.TILE);
    const cx0 = (c + 0.5) * Config.TILE;
    if (Math.abs(this.x - cx0) <= this.turnEps) return true;
    if (this.dirX !== 0) {
      const cx1 = (c + 0.5 + Math.sign(this.dirX)) * Config.TILE;
      if (Math.abs(this.x - cx1) <= this.turnEps) return true;
    }
    return false;
  }

  /**
   * Check if player can commit a horizontal turn (change to left/right movement).
   * @returns {boolean} True if turn is allowed
   */
  canTurnHorizontal() {
    const r = Math.floor(this.y / Config.TILE);
    const cy0 = (r + 0.5) * Config.TILE;
    if (Math.abs(this.y - cy0) <= this.turnEps) return true;
    if (this.dirY !== 0) {
      const cy1 = (r + 0.5 + Math.sign(this.dirY)) * Config.TILE;
      if (Math.abs(this.y - cy1) <= this.turnEps) return true;
    }
    return false;
  }

  /**
   * Process turn wishes and commit direction changes when valid.
   * Call this every frame before movement.
   * @param {number} dt - Delta time in seconds
   */
  processTurns(dt) {
    // Track how long we've been waiting to turn
    if (this.wishX !== this.dirX || this.wishY !== this.dirY) {
      this.wishTimer += dt;
    } else {
      this.wishTimer = 0;
    }

    // Skip if no wish or wish matches current direction
    if (this.wishX === 0 && this.wishY === 0) return;
    if (this.wishX === this.dirX && this.wishY === this.dirY) return;

    // Trying to turn vertical (up/down)
    if (this.wishX === 0 && this.wishY !== 0) {
      if (this.dirX === 0 && this.dirY === 0) {
        // From standstill - snap and go
        this.x = this.nearestColumnCenter(0);
        this.dirX = 0;
        this.dirY = Math.sign(this.wishY);
        this.wishTimer = 0;
      } else if (this.canTurnVertical()) {
        // Normal turn at cell center
        this.x = this.nearestColumnCenter(this.dirX);
        this.dirX = 0;
        this.dirY = Math.sign(this.wishY);
        this.wishTimer = 0;
      } else if (this.wishTimer > 0.25) {
        // Failsafe: force turn after 0.25s
        this.x = this.nearestColumnCenter(this.dirX);
        this.dirX = 0;
        this.dirY = Math.sign(this.wishY);
        this.wishTimer = 0;
      }
    }
    // Trying to turn horizontal (left/right)
    else if (this.wishY === 0 && this.wishX !== 0) {
      if (this.dirX === 0 && this.dirY === 0) {
        // From standstill - snap and go
        this.y = this.nearestRowCenter(0);
        this.dirY = 0;
        this.dirX = Math.sign(this.wishX);
        this.wishTimer = 0;
      } else if (this.canTurnHorizontal()) {
        // Normal turn at cell center
        this.y = this.nearestRowCenter(this.dirY);
        this.dirY = 0;
        this.dirX = Math.sign(this.wishX);
        this.wishTimer = 0;
      } else if (this.wishTimer > 0.25) {
        // Failsafe: force turn after 0.25s
        this.y = this.nearestRowCenter(this.dirY);
        this.dirY = 0;
        this.dirX = Math.sign(this.wishX);
        this.wishTimer = 0;
      }
    }
  }

  /**
   * Snap the perpendicular axis to cell center for clean movement.
   * Call after movement to maintain grid alignment.
   */
  snapToGrid() {
    if (this.dirX === 0 && this.dirY === 0) {
      // Stationary - snap both axes
      const c = Math.floor(this.x / Config.TILE);
      const r = Math.floor(this.y / Config.TILE);
      this.x = (c + 0.5) * Config.TILE;
      this.y = (r + 0.5) * Config.TILE;
    } else if (this.dirX === 0 && this.dirY !== 0) {
      // Moving vertically - snap X
      const c = Math.floor(this.x / Config.TILE);
      this.x = (c + 0.5) * Config.TILE;
    } else if (this.dirY === 0 && this.dirX !== 0) {
      // Moving horizontally - snap Y
      const r = Math.floor(this.y / Config.TILE);
      this.y = (r + 0.5) * Config.TILE;
    }
  }

  /**
   * Get the cell the player is currently in.
   * @returns {{c: number, r: number}} Current cell
   */
  getCell() {
    return {
      c: Math.floor(this.x / Config.TILE),
      r: Math.floor(this.y / Config.TILE),
    };
  }

  /**
   * Get movement delta for this frame.
   * @param {number} dt - Delta time in seconds
   * @returns {{dx: number, dy: number}} Movement delta in pixels
   */
  getMovementDelta(dt) {
    return {
      dx: this.dirX * this.speed * dt,
      dy: this.dirY * this.speed * dt,
    };
  }
}
