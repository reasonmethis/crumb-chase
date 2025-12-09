/**
 * Crumb Chase - Renderer Module
 *
 * Handles all canvas rendering operations for the game.
 * Uses canvas 2D API with HiDPI scaling support.
 *
 * @module renderer
 */

import * as Config from './config.js';

/**
 * Renderer class - handles all game drawing operations.
 *
 * Creates and manages a canvas context with HiDPI support.
 * Provides methods to draw all game elements.
 */
export class Renderer {
  /**
   * Create a new renderer.
   * @param {HTMLCanvasElement} canvas - Canvas element to draw on
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    /** Device pixel ratio for crisp rendering on HiDPI displays */
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    // Set up canvas scaling
    this._setupCanvas();

    // Cache CSS colors (lazily populated)
    this._colors = {};
  }

  /**
   * Set up canvas dimensions and scaling for HiDPI.
   * @private
   */
  _setupCanvas() {
    this.canvas.width = Config.COLS * Config.TILE * this.dpr;
    this.canvas.height = Config.ROWS * Config.TILE * this.dpr;
    this.canvas.style.width = Config.COLS * Config.TILE + 'px';
    this.canvas.style.height = Config.ROWS * Config.TILE + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /**
   * Get a CSS custom property value from the document root.
   * Caches values for performance.
   * @param {string} name - CSS variable name (e.g., '--mouse')
   * @returns {string} The trimmed property value
   */
  getCSS(name) {
    if (!this._colors[name]) {
      this._colors[name] = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
    }
    return this._colors[name];
  }

  /**
   * Clear the color cache (call if CSS variables change).
   */
  clearColorCache() {
    this._colors = {};
  }

  /**
   * Lighten or darken a color.
   * @param {string} hexOrCSS - Input color (hex, rgb, or CSS variable value)
   * @param {number} amt - Amount to adjust: negative = darken, positive = lighten
   * @returns {string} RGB color string
   */
  shade(hexOrCSS, amt) {
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
   * Clear the entire canvas.
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
  }

  /**
   * Draw the background grid with subtle lines and vignette effect.
   */
  drawBackgroundGrid() {
    const ctx = this.ctx;
    const w = Config.COLS * Config.TILE;
    const h = Config.ROWS * Config.TILE;
    ctx.save();

    // Vignette effect
    const vg = ctx.createRadialGradient(
      w * 0.5, h * 0.45, Math.min(w, h) * 0.25,
      w * 0.5, h * 0.5, Math.max(w, h) * 0.68
    );
    vg.addColorStop(0, 'rgba(255,255,255,0.02)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
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
   * @param {Object} grid - Grid instance with crumbs array
   */
  drawCrumbs(grid) {
    const ctx = this.ctx;
    ctx.save();
    const crumbColor = this.getCSS('--crumb');
    const crumb2Color = this.getCSS('--crumb2');

    for (let r = 0; r < Config.ROWS; r++) {
      for (let c = 0; c < Config.COLS; c++) {
        if (grid.crumbs[grid.idx(c, r)] > 0) {
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
   * @param {Object} grid - Grid instance with hole configuration
   */
  drawHole(grid) {
    const ctx = this.ctx;
    const rmin = Math.max(0, grid.hole.r - grid.hole.halfHeight);
    const rmax = Math.min(Config.ROWS - 1, grid.hole.r + grid.hole.halfHeight);
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
  drawMouse(x, y, r, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    const er = r * 0.55;
    const ey = y - r * 0.85;
    const ex = r * 0.68;
    ctx.fillStyle = this.shade(color, 0.08);
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
  drawCat(x, y, r, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Ears (triangular)
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

    // Eyes (slits)
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
   * @param {Array<{c: number, r: number}>} cells - Path waypoints
   */
  drawPath(cells) {
    if (!cells || !cells.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(122,162,255,0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    let first = true;
    for (const cell of cells) {
      const px = (cell.c + 0.5) * Config.TILE;
      const py = (cell.r + 0.5) * Config.TILE;
      if (first) {
        ctx.moveTo(px, py);
        first = false;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * Draw the complete game scene.
   * @param {Object} options - Drawing options
   * @param {Object} options.grid - Grid instance
   * @param {Object} options.player - Player instance
   * @param {Array} options.cats - Array of cat instances
   * @param {boolean} options.showPath - Whether to show debug path
   */
  draw({ grid, player, cats, showPath = false }) {
    this.clear();
    this.drawBackgroundGrid();
    this.drawCrumbs(grid);
    this.drawHole(grid);

    // Draw player with slight vertical offset for visual appeal
    this.drawMouse(player.x, player.y + player.r * 0.05, player.r, player.color);

    // Draw all cats
    for (const cat of cats) {
      this.drawCat(cat.x, cat.y, cat.r, cat.color);
    }

    // Debug: show first cat's path
    if (showPath && cats.length && cats[0].path) {
      this.drawPath(cats[0].path);
    }
  }
}
