/**
 * Crumb Chase - Game Module
 *
 * Main game class that orchestrates all game systems.
 * Manages game state, updates, and provides a gym-like interface for ML.
 *
 * @module game
 */

import * as Config from './config.js';
import { Grid } from './grid.js';
import { Player } from './player.js';
import { Cat } from './cat.js';
import { Renderer } from './renderer.js';
import {
  idx as coreIdx,
  inBounds as coreInBounds,
  cellAt as coreCellAt,
  heuristic,
} from './core.js';

// Convenience wrappers using game Config constants
const idx = (c, r) => coreIdx(c, r, Config.COLS);
const inBounds = (c, r) => coreInBounds(c, r, Config.COLS, Config.ROWS);
const cellAt = (x, y) => coreCellAt(x, y, Config.TILE);

/**
 * Game class - main game orchestrator.
 *
 * Manages all game state and provides methods for:
 * - Level management
 * - Game updates
 * - Rendering
 * - Input handling
 * - ML interface (step, reset, getState)
 */
export class Game {
  /**
   * Create a new game instance.
   * @param {HTMLCanvasElement|null} canvas - Canvas element for rendering (null for headless)
   * @param {Object} options - Game options
   * @param {Function} options.onCaught - Callback when player is caught
   * @param {Function} options.onLevelComplete - Callback when level is completed
   * @param {boolean} options.headless - If true, skip renderer creation
   */
  constructor(canvas, options = {}) {
    /** Grid instance - manages crumbs and hole */
    this.grid = new Grid();

    /** Player instance - manages mouse position and movement */
    this.player = new Player();

    /** Renderer instance - handles all drawing (null in headless mode) */
    this.renderer = (canvas && !options.headless) ? new Renderer(canvas) : null;

    /** Array of cat instances */
    this.cats = [];

    /** Current level number */
    this.level = 1;

    /** Whether the game is currently running */
    this.running = true;

    /** Time survived in current level (seconds) */
    this.timeAlive = 0;

    /** Accumulator for crumb decay timing */
    this.decayAccum = 0;

    /** Currently pressed keys */
    this.keys = Object.create(null);

    /** Callbacks */
    this.onCaught = options.onCaught || null;
    this.onLevelComplete = options.onLevelComplete || null;

    /** Total cells for pathfinding arrays */
    this._N = Config.COLS * Config.ROWS;
  }

  /**
   * Get a CSS custom property value.
   * @param {string} name - CSS variable name
   * @returns {string} Property value
   */
  getCSS(name) {
    // In headless mode, return default colors
    if (!this.renderer) {
      const defaults = {
        '--mouse': '#b8c0cc',
        '--cat': '#ff69b4',
      };
      return defaults[name] || '#ffffff';
    }
    return this.renderer.getCSS(name);
  }

  /**
   * Start or restart a level.
   * @param {boolean} resetToLevel1 - If true, resets to level 1
   */
  startLevel(resetToLevel1 = false) {
    if (resetToLevel1) {
      this.level = 1;
    }

    // Reset grid and player
    this.grid.clear();
    this.player.reset();

    // Set player color lazily from CSS
    if (!this.player.color) {
      this.player.color = this.getCSS('--mouse');
    }

    // Get level configuration
    const { cats: targetCats, speedFactor, crumbSpeedFactor } = Config.getLevelConfig(this.level);
    const speedCells = Config.PLAYER_SPEED_CELLS * speedFactor;
    const catColor = this.getCSS('--cat');

    // Spawn cats
    this.cats = [];
    for (let i = 0; i < targetCats; i++) {
      const spawn = Config.CAT_SPAWN_GRID[i % Config.CAT_SPAWN_GRID.length];
      const cat = Cat.fromSpawnFraction(spawn[0], spawn[1], speedCells, crumbSpeedFactor, i, catColor);
      this.cats.push(cat);
    }

    // Reset game state
    this.timeAlive = 0;
    this.decayAccum = 0;
    this.running = true;

    // Build hole barrier
    this.grid.buildHoleBarrier();
  }

  /**
   * A* pathfinding from start cell to goal cell.
   * @param {number} startC - Starting column
   * @param {number} startR - Starting row
   * @param {number} goalC - Goal column
   * @param {number} goalR - Goal row
   * @returns {Array<{c: number, r: number}>} Path as array of cells
   */
  aStar(startC, startR, goalC, goalR) {
    const N = this._N;
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

        const stepCost = this.grid.isCrumb(nc, nr) ? Config.CRUMB_COST_FOR_CAT : 1;
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

  /**
   * Move an agent by the given delta with collision detection.
   * @param {Object} agent - Entity with x, y position
   * @param {number} dx - Horizontal movement delta (pixels)
   * @param {number} dy - Vertical movement delta (pixels)
   * @param {boolean} blockCrumb - If true, crumbs act as walls
   */
  moveAgent(agent, dx, dy, blockCrumb) {
    const EPS = 1e-6;

    if (dx !== 0) {
      const cc = cellAt(agent.x, agent.y);
      const centerX = (cc.c + 0.5) * Config.TILE;
      const dir = Math.sign(dx);
      const nextC = cc.c + dir;
      const nextBlocked = blockCrumb && (!inBounds(nextC, cc.r) || this.grid.isCrumb(nextC, cc.r));

      let nx = agent.x + dx;
      if (nextBlocked) {
        nx = dir > 0 ? Math.min(nx, centerX) : Math.max(nx, centerX);
      }

      const cell = cellAt(nx, agent.y);
      if (!(blockCrumb && this.grid.isCrumb(cell.c, cell.r)) && inBounds(cell.c, cell.r)) {
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
      const nextBlocked = blockCrumb && (!inBounds(cc.c, nextR) || this.grid.isCrumb(cc.c, nextR));

      let ny = agent.y + dy;
      if (nextBlocked) {
        ny = dir > 0 ? Math.min(ny, centerY) : Math.max(ny, centerY);
      }

      const cell = cellAt(agent.x, ny);
      if (!(blockCrumb && this.grid.isCrumb(cell.c, cell.r)) && inBounds(cell.c, cell.r)) {
        agent.y = ny;
      }

      if (nextBlocked && ((dir > 0 && agent.y >= centerY - EPS) || (dir < 0 && agent.y <= centerY + EPS))) {
        agent.y = centerY;
      }
    }
  }

  /**
   * Main game update tick.
   * @param {number} dt - Delta time in seconds
   * @returns {{caught: boolean, levelComplete: boolean}} Update result
   */
  update(dt) {
    if (!this.running) return { caught: false, levelComplete: false };

    this.timeAlive += dt;

    // ── Player Turns ──────────────────────────────────────────────────────
    this.player.processTurns(dt);

    // ── Player Movement ───────────────────────────────────────────────────
    const prevCell = cellAt(this.player.x, this.player.y);
    const delta = this.player.getMovementDelta(dt);
    this.moveAgent(this.player, delta.dx, delta.dy, true);
    this.player.snapToGrid();

    // ── Crumb Trail ───────────────────────────────────────────────────────
    const curCell = cellAt(this.player.x, this.player.y);
    if ((curCell.c !== prevCell.c || curCell.r !== prevCell.r) && inBounds(prevCell.c, prevCell.r)) {
      if (!this.grid.isHoleCell(prevCell.c, prevCell.r)) {
        this.grid.addCrumb(prevCell.c, prevCell.r, Config.CRUMB_STRENGTH);
      }
    }

    // ── Win Condition ────────────────────────────────────────────────────
    if (this.grid.isHoleCell(curCell.c, curCell.r)) {
      this.level += 1;
      this.startLevel(false);
      if (this.onLevelComplete) {
        this.onLevelComplete(this.level, this.cats.length);
      }
      return { caught: false, levelComplete: true };
    }

    // ── Cat AI ────────────────────────────────────────────────────────────
    const playerCell = this.player.getCell();
    const playerPos = { x: this.player.x, y: this.player.y };

    for (const cat of this.cats) {
      // Track cell before movement
      const prevCatCell = cat.getCell();

      // Pathfinding (also refreshes goal jitter)
      if (cat.shouldRecalculatePath(dt)) {
        const goal = cat.getGoalCell(playerCell);
        const catCell = cat.getCell();
        cat.path = this.aStar(catCell.c, catCell.r, goal.c, goal.r);
      }

      // Calculate speed (slowed in crumbs)
      const speedPx = cat.calculateSpeed(this.grid);

      // Separation steering
      cat.applySeparation(this.cats, dt);

      // Movement
      cat.moveAlongPath(speedPx, dt, playerPos);

      // Crumb destruction on cell exit
      const { changed, prevCell: oldCell } = cat.checkCellChange();
      if (changed && this.grid.isCrumb(oldCell.c, oldCell.r)) {
        this.grid.weakenCrumb(oldCell.c, oldCell.r, Infinity);
      }

      // Catch check
      if (cat.hasCaughtPlayer(this.player)) {
        this.running = false;
        if (this.onCaught) {
          this.onCaught(this.level, this.timeAlive);
        }
        return { caught: true, levelComplete: false };
      }
    }

    // ── Crumb Decay ───────────────────────────────────────────────────────
    this.decayAccum += dt * Config.CRUMB_DECAY_PER_SEC;
    while (this.decayAccum >= 1) {
      this.decayAccum -= 1;
      this.grid.decayOneCrumb();
    }

    return { caught: false, levelComplete: false };
  }

  /**
   * Render the current game state.
   * @param {boolean} showPath - Whether to show debug path visualization
   */
  draw(showPath = false) {
    if (!this.renderer) return; // Skip in headless mode
    this.renderer.draw({
      grid: this.grid,
      player: this.player,
      cats: this.cats,
      showPath,
    });
  }

  /**
   * Set player input direction.
   * @param {number} dx - Desired X direction (-1, 0, or 1)
   * @param {number} dy - Desired Y direction (-1, 0, or 1)
   */
  setInput(dx, dy) {
    this.player.setWish(dx, dy);
  }

  /**
   * Alias for setInput - sets player wish direction.
   * @param {number} dx - Desired X direction (-1, 0, or 1)
   * @param {number} dy - Desired Y direction (-1, 0, or 1)
   */
  setPlayerWish(dx, dy) {
    this.player.setWish(dx, dy);
  }

  /**
   * Get player position.
   * @returns {{x: number, y: number}} Player coordinates
   */
  getPlayerPosition() {
    return { x: this.player.x, y: this.player.y };
  }

  /**
   * Stop player movement.
   */
  stopPlayer() {
    this.player.stop();
  }

  /**
   * Get current game stats for HUD display.
   * @returns {{level: number, timeAlive: number, crumbCount: number, catSpeed: number, catCount: number}}
   */
  getStats() {
    return {
      level: this.level,
      timeAlive: this.timeAlive,
      crumbCount: this.grid.countCrumbs(),
      catSpeed: this.cats.length ? this.cats[0].speedCells : 0,
      catCount: this.cats.length,
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // ML Interface (gym-like)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Reset the game environment.
   * @param {number} level - Level to start at (default 1)
   * @returns {Object} Initial observation state
   */
  reset(level = 1) {
    this.level = level;
    this.startLevel(true);
    return this.getState();
  }

  /**
   * Execute one action and return the result.
   * @param {number} action - Action index (0=left, 1=right, 2=up, 3=down, 4=stop)
   * @param {number} dt - Time step (default 1/60)
   * @returns {{state: Object, reward: number, done: boolean, info: Object}}
   */
  step(action, dt = 1 / 60) {
    // Map action to input
    const actions = [
      [-1, 0],  // 0: left
      [1, 0],   // 1: right
      [0, -1],  // 2: up
      [0, 1],   // 3: down
      [0, 0],   // 4: stop
    ];

    if (action >= 0 && action < actions.length) {
      const [dx, dy] = actions[action];
      if (dx === 0 && dy === 0) {
        this.stopPlayer();
      } else {
        this.setInput(dx, dy);
      }
    }

    // Run update
    const prevDistToHole = this._distanceToHole();
    const result = this.update(dt);
    const newDistToHole = this._distanceToHole();

    // Calculate reward
    let reward = 0;
    if (result.caught) {
      reward = -100;
    } else if (result.levelComplete) {
      reward = 100;
    } else {
      // Progress reward: stronger signal for moving toward hole
      const progress = prevDistToHole - newDistToHole;
      reward += progress * 50;

      // Small survival bonus
      reward += 0.05;

      // Danger penalty: proportional to proximity (closer = worse)
      const minCatDist = this._minDistanceToCat();
      const dangerRadius = Config.TILE * 5;
      if (minCatDist < dangerRadius) {
        // Scale from 0 (at edge) to -2 (very close)
        reward -= 2 * (1 - minCatDist / dangerRadius);
      }

      // Small penalty for stopping (encourage movement)
      if (this.player.dirX === 0 && this.player.dirY === 0) {
        reward -= 0.1;
      }
    }

    return {
      state: this.getState(),
      reward,
      done: result.caught || result.levelComplete,
      info: {
        caught: result.caught,
        levelComplete: result.levelComplete,
        timeAlive: this.timeAlive,
        level: this.level,
      },
    };
  }

  /**
   * Get the current observation state for ML.
   * @returns {Object} Normalized state features
   */
  getState() {
    const playerCell = this.player.getCell();
    const holeC = 0;
    const holeR = this.grid.hole.r;

    // Direction to hole
    const dHoleX = holeC - playerCell.c;
    const dHoleY = holeR - playerCell.r;
    const dHoleDist = Math.hypot(dHoleX, dHoleY) || 1;

    // Nearest cat
    let nearestCatDist = Infinity;
    let nearestCatDx = 0;
    let nearestCatDy = 0;
    for (const cat of this.cats) {
      const dx = cat.x - this.player.x;
      const dy = cat.y - this.player.y;
      const d = Math.hypot(dx, dy);
      if (d < nearestCatDist) {
        nearestCatDist = d;
        nearestCatDx = dx;
        nearestCatDy = dy;
      }
    }
    const catDist = nearestCatDist || 1;

    // Adjacent crumbs
    const c = playerCell.c;
    const r = playerCell.r;

    return {
      // Position (normalized)
      playerX: this.player.x / (Config.COLS * Config.TILE),
      playerY: this.player.y / (Config.ROWS * Config.TILE),

      // Direction to hole
      dirToHoleX: dHoleX / dHoleDist,
      dirToHoleY: dHoleY / dHoleDist,

      // Distance to hole (normalized)
      distToHole: dHoleDist / Math.hypot(Config.COLS, Config.ROWS),

      // Nearest cat info
      distToCat: nearestCatDist / (Math.hypot(Config.COLS, Config.ROWS) * Config.TILE),
      dirToCatX: nearestCatDx / catDist,
      dirToCatY: nearestCatDy / catDist,

      // Adjacent crumbs
      crumbUp: this.grid.isCrumb(c, r - 1) ? 1 : 0,
      crumbDown: this.grid.isCrumb(c, r + 1) ? 1 : 0,
      crumbLeft: this.grid.isCrumb(c - 1, r) ? 1 : 0,
      crumbRight: this.grid.isCrumb(c + 1, r) ? 1 : 0,

      // Current movement
      movingX: this.player.dirX,
      movingY: this.player.dirY,
    };
  }

  /**
   * Calculate distance from player to hole.
   * @returns {number} Distance in cells
   * @private
   */
  _distanceToHole() {
    const pc = this.player.getCell();
    return Math.hypot(pc.c - 0, pc.r - this.grid.hole.r);
  }

  /**
   * Calculate minimum distance to any cat.
   * @returns {number} Distance in pixels
   * @private
   */
  _minDistanceToCat() {
    let min = Infinity;
    for (const cat of this.cats) {
      const d = Math.hypot(cat.x - this.player.x, cat.y - this.player.y);
      if (d < min) min = d;
    }
    return min;
  }
}
