/**
 * Crumb Chase - Main Entry Point
 *
 * Sets up the game, handles input, and runs the game loop.
 * All game logic is delegated to the Game class.
 *
 * @module main
 */

import { Game } from './game.js';

// ============================================
// DOM Elements
// ============================================
const canvas = document.getElementById('game');
const hudStats = document.getElementById('stats');
const overlay = document.getElementById('overlay');
const ovTitle = document.getElementById('ovTitle');
const ovMsg = document.getElementById('ovMsg');
const playAgain = document.getElementById('playAgain');
const resetBtn = document.getElementById('resetBtn');
const toast = document.getElementById('toast');

// ============================================
// Game Instance
// ============================================
const game = new Game(canvas);

// Track pressed keys for debug features (Shift to show path)
const keys = Object.create(null);

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

/**
 * Update the HUD stats display.
 */
function updateHUD() {
  const { level, timeAlive, crumbCount, catSpeed } = game.getStats();
  hudStats.textContent = `Level ${level} · Time: ${timeAlive.toFixed(0)}s · Crumbs: ${crumbCount} · Cat speed: ${catSpeed.toFixed(2)}c/s`;
}

// ============================================
// Game Event Callbacks
// ============================================

game.onCaught = (level, timeAlive) => {
  ovTitle.textContent = 'Caught!';
  ovMsg.textContent = `Level ${level}, survived ${timeAlive.toFixed(1)}s.`;
  overlay.style.display = 'grid';
};

game.onLevelComplete = (newLevel, catCount) => {
  overlay.style.display = 'none';
  showToast(`Level ${newLevel} — Cats: ${catCount}`);
  setTimeout(() => canvas.focus(), 0);
};

// ============================================
// Level Start
// ============================================

/**
 * Start or restart the game.
 * @param {boolean} resetLevel - If true, resets to level 1
 */
function startLevel(resetLevel = false) {
  game.reset(resetLevel ? 1 : undefined);
  overlay.style.display = 'none';
  const { level, catCount } = game.getStats();
  showToast(`Level ${level} — Cats: ${catCount}`);
  setTimeout(() => canvas.focus(), 0);
}

// ============================================
// Input Handling
// ============================================

/**
 * Set desired direction based on key press.
 * @param {string} key - Key name (e.g., 'ArrowLeft', 'a')
 */
function setDirectionFromKey(key) {
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
    game.setPlayerWish(-1, 0);
  } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
    game.setPlayerWish(1, 0);
  } else if (key === 'ArrowUp' || key === 'w' || key === 'W') {
    game.setPlayerWish(0, -1);
  } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
    game.setPlayerWish(0, 1);
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
    game.stopPlayer();
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
  const dpr = game.renderer.dpr;
  const px = ((e.clientX - rect.left) * (canvas.width / rect.width)) / dpr;
  const py = ((e.clientY - rect.top) * (canvas.height / rect.height)) / dpr;
  const playerPos = game.getPlayerPosition();
  const dx = px - playerPos.x;
  const dy = py - playerPos.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    game.setPlayerWish(Math.sign(dx), 0);
  } else {
    game.setPlayerWish(0, Math.sign(dy));
  }
});

resetBtn.addEventListener('click', () => startLevel(true));
playAgain.addEventListener('click', () => startLevel(true));

// ============================================
// Game Loop
// ============================================

let lastTime = performance.now();

/**
 * Main game loop - called every frame via requestAnimationFrame.
 * @param {number} ts - Timestamp in milliseconds
 */
function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;

  if (game.running) {
    game.update(dt);
    // Update HUD every ~100ms
    if (((game.timeAlive * 10) | 0) % 2 === 0) {
      updateHUD();
    }
  }

  game.draw(keys['Shift']);
  requestAnimationFrame(loop);
}

// ============================================
// Start Game
// ============================================
startLevel(true);
requestAnimationFrame(loop);
