/**
 * Crumb Chase - Main Entry Point
 *
 * Sets up the game, handles input, and runs the game loop.
 * All game logic is delegated to the Game class.
 * ML training is managed by the TrainingManager.
 *
 * @module main
 */

import { Game } from './game.js';
import { TrainingManager, TrainingMode } from './ml/training.js';

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

// ML Controls
const btnHuman = document.getElementById('btnHuman');
const btnAI = document.getElementById('btnAI');
const btnTrain = document.getElementById('btnTrain');
const btnSave = document.getElementById('btnSave');
const btnLoad = document.getElementById('btnLoad');
const btnResetAI = document.getElementById('btnResetAI');
const mlStats = document.getElementById('mlStats');
const mlStatsText = document.getElementById('mlStatsText');
const speedButtons = document.querySelectorAll('.btn-speed');
const modeButtons = [btnHuman, btnAI, btnTrain];

// ============================================
// Game Instance
// ============================================
const game = new Game(canvas);

// Track pressed keys for debug features (Shift to show path)
const keys = Object.create(null);

// ============================================
// Training Manager
// ============================================
const trainer = new TrainingManager(game, {
  onEpisodeEnd: () => {
    updateMLStats();
  },
  onStatsUpdate: () => {
    updateMLStats();
  },
});

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

/**
 * Update the ML stats display.
 */
function updateMLStats() {
  const stats = trainer.getStats();
  mlStatsText.textContent = `Episodes: ${stats.episodes} | Avg: ${stats.recentAvgReward.toFixed(1)} | Best: ${stats.bestReward.toFixed(0)} | Epsilon: ${stats.epsilon.toFixed(2)} | Q-States: ${stats.qTableSize}`;
}

/**
 * Set the active mode button.
 * @param {string} mode - TrainingMode value
 */
function setActiveMode(mode) {
  modeButtons.forEach(btn => btn.classList.remove('active'));
  if (mode === TrainingMode.HUMAN) btnHuman.classList.add('active');
  else if (mode === TrainingMode.AI_PLAY) btnAI.classList.add('active');
  else if (mode === TrainingMode.TRAIN) btnTrain.classList.add('active');

  // Show/hide ML stats
  mlStats.style.display = mode === TrainingMode.HUMAN ? 'none' : 'flex';
}

/**
 * Set the active speed button.
 * @param {number} speed - Speed multiplier
 */
function setActiveSpeed(speed) {
  speedButtons.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.speed) === speed);
  });
}

// ============================================
// Game Event Callbacks
// ============================================

game.onCaught = (level, timeAlive) => {
  // Only show overlay in human mode
  if (trainer.mode === TrainingMode.HUMAN) {
    ovTitle.textContent = 'Caught!';
    ovMsg.textContent = `Level ${level}, survived ${timeAlive.toFixed(1)}s.`;
    overlay.style.display = 'grid';
  }
};

game.onLevelComplete = (newLevel, catCount) => {
  if (trainer.mode === TrainingMode.HUMAN) {
    overlay.style.display = 'none';
    showToast(`Level ${newLevel} — Cats: ${catCount}`);
    setTimeout(() => canvas.focus(), 0);
  }
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
  // Only handle input in human mode
  if (trainer.mode !== TrainingMode.HUMAN) return;

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
    if (trainer.mode === TrainingMode.HUMAN) {
      startLevel(true);
    }
    return;
  }
  if (e.key === ' ' || e.key === 'Spacebar') {
    if (trainer.mode === TrainingMode.HUMAN) {
      game.stopPlayer();
    }
    return;
  }
  setDirectionFromKey(e.key);
  keys[e.key] = true;
});

window.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

canvas.addEventListener('pointerdown', (e) => {
  // Only handle clicks in human mode
  if (trainer.mode !== TrainingMode.HUMAN) return;

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

resetBtn.addEventListener('click', () => {
  if (trainer.mode === TrainingMode.HUMAN) {
    startLevel(true);
  } else {
    trainer.startEpisode();
  }
});
playAgain.addEventListener('click', () => startLevel(true));

// ============================================
// ML Control Handlers
// ============================================

btnHuman.addEventListener('click', () => {
  trainer.setMode(TrainingMode.HUMAN);
  setActiveMode(TrainingMode.HUMAN);
  overlay.style.display = 'none';
  showToast('Human mode');
});

btnAI.addEventListener('click', () => {
  trainer.setMode(TrainingMode.AI_PLAY);
  setActiveMode(TrainingMode.AI_PLAY);
  overlay.style.display = 'none';
  showToast('AI playing (no learning)');
  updateMLStats();
});

btnTrain.addEventListener('click', () => {
  trainer.setMode(TrainingMode.TRAIN);
  setActiveMode(TrainingMode.TRAIN);
  overlay.style.display = 'none';
  showToast('Training mode');
  updateMLStats();
});

speedButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const speed = parseInt(btn.dataset.speed);
    trainer.setSpeed(speed);
    setActiveSpeed(speed);
    showToast(`Speed: ${speed}x`);
  });
});

btnSave.addEventListener('click', () => {
  trainer.save();
  const stats = trainer.getStats();
  showToast(`Saved! (${stats.episodes} episodes, ${stats.qTableSize} states)`);
});

btnLoad.addEventListener('click', () => {
  if (trainer.load()) {
    updateMLStats();
    const stats = trainer.getStats();
    showToast(`Loaded! (${stats.episodes} episodes, ${stats.qTableSize} states)`);
  } else {
    showToast('No saved agent found');
  }
});

btnResetAI.addEventListener('click', () => {
  if (confirm('Reset all AI learning? This cannot be undone.')) {
    trainer.resetAgent();
    updateMLStats();
    showToast('AI reset');
  }
});

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

  if (trainer.mode === TrainingMode.HUMAN) {
    // Human mode: normal game update
    if (game.running) {
      game.update(dt);
      if (((game.timeAlive * 10) | 0) % 2 === 0) {
        updateHUD();
      }
    }
  } else {
    // AI mode: training manager handles updates
    trainer.update(dt);
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
setActiveMode(TrainingMode.HUMAN);
startLevel(true);
requestAnimationFrame(loop);
