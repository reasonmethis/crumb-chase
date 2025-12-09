/**
 * Crumb Chase - Grid Module
 *
 * Manages the game grid including crumbs and the escape hole.
 * The grid is a flat array where each cell can contain a crumb with a strength value.
 *
 * @module grid
 */

import * as Config from './config.js';

/**
 * Grid class - manages crumbs and hole state.
 *
 * The grid uses a flat Float32Array for crumb storage where:
 * - Position is implicit via index: index = r * COLS + c
 * - Value > 0 means crumb exists with that strength
 * - Value = 0 means empty cell
 */
export class Grid {
  /**
   * Create a new grid.
   * @param {number} cols - Number of columns (defaults to Config.COLS)
   * @param {number} rows - Number of rows (defaults to Config.ROWS)
   */
  constructor(cols = Config.COLS, rows = Config.ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.n = cols * rows;

    /** Crumb storage - strength value at each cell */
    this.crumbs = new Float32Array(this.n);

    /** Set of cell indices forming the barrier ring around the hole */
    this.ringSet = new Set();

    /** Set of cell indices that are part of the open hole (win zone) */
    this.holeOpenSet = new Set();

    /** Hole position and dimensions */
    this.hole = {
      c: Config.HOLE_COLUMN,
      r: Config.getHoleRow(),
      halfHeight: Config.HOLE_HALF_HEIGHT,
    };
  }

  /**
   * Convert grid column/row to flat array index.
   * @param {number} c - Column
   * @param {number} r - Row
   * @returns {number} Flat index into the crumbs array
   */
  idx(c, r) {
    return r * this.cols + c;
  }

  /**
   * Check if a cell is within grid bounds.
   * @param {number} c - Column
   * @param {number} r - Row
   * @returns {boolean} True if cell is valid
   */
  inBounds(c, r) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }

  /**
   * Check if a cell contains a crumb (or is out of bounds, which acts as a wall).
   * @param {number} c - Column
   * @param {number} r - Row
   * @returns {boolean} True if cell has crumb or is out of bounds
   */
  isCrumb(c, r) {
    return this.inBounds(c, r) ? this.crumbs[this.idx(c, r)] > 0 : true;
  }

  /**
   * Get crumb strength at a cell.
   * @param {number} c - Column
   * @param {number} r - Row
   * @returns {number} Crumb strength (0 if none or out of bounds)
   */
  getCrumbStrength(c, r) {
    return this.inBounds(c, r) ? this.crumbs[this.idx(c, r)] : 0;
  }

  /**
   * Add or strengthen a crumb at a cell. Takes the max of existing and new strength.
   * @param {number} c - Column
   * @param {number} r - Row
   * @param {number} strength - Crumb thickness to set
   */
  addCrumb(c, r, strength = Config.CRUMB_STRENGTH) {
    if (this.inBounds(c, r)) {
      const k = this.idx(c, r);
      this.crumbs[k] = Math.max(this.crumbs[k], strength);
    }
  }

  /**
   * Reduce crumb strength at a cell. Removes from ringSet if fully depleted.
   * @param {number} c - Column
   * @param {number} r - Row
   * @param {number} amount - Amount to subtract from crumb strength
   */
  weakenCrumb(c, r, amount) {
    if (this.inBounds(c, r)) {
      const k = this.idx(c, r);
      if (this.crumbs[k] > 0) {
        this.crumbs[k] = Math.max(0, this.crumbs[k] - amount);
        if (this.crumbs[k] === 0) this.ringSet.delete(k);
      }
    }
  }

  /**
   * Reduce crumb strength by flat array index.
   * @param {number} k - Flat array index
   * @param {number} amount - Amount to subtract
   */
  weakenCrumbByIndex(k, amount) {
    if (k >= 0 && k < this.n) {
      if (this.crumbs[k] > 0) {
        this.crumbs[k] = Math.max(0, this.crumbs[k] - amount);
        if (this.crumbs[k] === 0) this.ringSet.delete(k);
      }
    }
  }

  /**
   * Count total number of cells with crumbs.
   * @returns {number} Number of crumb cells
   */
  countCrumbs() {
    let count = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.crumbs[i] > 0) count++;
    }
    return count;
  }

  /**
   * Clear all crumbs and reset hole sets.
   */
  clear() {
    this.crumbs.fill(0);
    this.ringSet.clear();
    this.holeOpenSet.clear();
  }

  /**
   * Check if a cell is part of the escape hole.
   * @param {number} c - Column
   * @param {number} r - Row
   * @returns {boolean} True if cell is in the hole opening
   */
  isHoleCell(c, r) {
    return c === 0 && this.holeOpenSet.has(this.idx(c, r));
  }

  /**
   * Build the crumb barrier around the escape hole.
   *
   * The hole is on the left edge of the grid. This function:
   * 1. Marks the open hole cells (where player can escape)
   * 2. Surrounds the hole with crumbs to create a protective barrier
   * 3. Adds extra caps above/below to prevent easy circumvention
   */
  buildHoleBarrier() {
    this.ringSet.clear();
    this.holeOpenSet.clear();
    const rmin = Math.max(0, this.hole.r - this.hole.halfHeight);
    const rmax = Math.min(this.rows - 1, this.hole.r + this.hole.halfHeight);

    // Mark open hole cells (the actual escape zone)
    for (let r = rmin; r <= rmax; r++) {
      this.holeOpenSet.add(this.idx(0, r));
    }

    // Build rectangular barrier around hole opening
    for (let c = 0; c <= 2; c++) {
      for (let r = rmin - 1; r <= rmax + 1; r++) {
        if (!this.inBounds(c, r)) continue;
        if (c === 0 && r >= rmin && r <= rmax) continue; // Leave hole open
        this.addCrumb(c, r, Config.RING_CRUMB_STRENGTH);
        this.ringSet.add(this.idx(c, r));
      }
    }

    // Add extra caps above and below to make it harder to slip around
    for (let c = 0; c <= 1; c++) {
      for (let r = rmin - 2; r <= rmin - 1; r++) {
        if (this.inBounds(c, r)) {
          this.addCrumb(c, r, Config.RING_CRUMB_STRENGTH);
          this.ringSet.add(this.idx(c, r));
        }
      }
      for (let r = rmax + 1; r <= rmax + 2; r++) {
        if (this.inBounds(c, r)) {
          this.addCrumb(c, r, Config.RING_CRUMB_STRENGTH);
          this.ringSet.add(this.idx(c, r));
        }
      }
    }
  }

  /**
   * Pick a random element from a Set.
   * @param {Set} set - The set to pick from
   * @returns {*} A random element, or null if set is empty
   * @private
   */
  _randomFromSet(set) {
    const size = set.size;
    if (!size) return null;
    const n = (Math.random() * size) | 0;
    let i = 0;
    for (const v of set) {
      if (i++ === n) return v;
    }
    return null;
  }

  /**
   * Decay a random crumb on the grid.
   *
   * With PROB_BIASED_RING_DECAY probability, targets the protective ring
   * around the hole. Otherwise picks a random cell.
   */
  decayOneCrumb() {
    let removed = false;
    if (this.ringSet.size && Math.random() < Config.PROB_BIASED_RING_DECAY) {
      const pick = this._randomFromSet(this.ringSet);
      if (pick !== null) {
        this.weakenCrumbByIndex(pick, 1);
        removed = true;
      }
    }
    if (!removed) {
      const c = (Math.random() * this.cols) | 0;
      const r = (Math.random() * this.rows) | 0;
      if (this.crumbs[this.idx(c, r)] > 0) this.weakenCrumb(c, r, 1);
    }
  }
}
