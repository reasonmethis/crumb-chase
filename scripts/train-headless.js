/**
 * Headless Q-Learning Training Script
 *
 * Runs training without browser/canvas, analyzes results,
 * and can be iterated upon automatically.
 *
 * Usage: node scripts/train-headless.js [episodes]
 */

// ============================================
// Configuration (must match game settings)
// ============================================
const CONFIG = {
  COLS: 40,
  ROWS: 25,
  TILE: 20,
  PLAYER_SPEED_CELLS: 6.0,
  HOLE_COLUMN: 0,
  PLAYER_START_COL: 35,  // Right side
  CATCH_RADIUS: 1.2,     // Tiles (slightly smaller)
  PLAYER_SPEED: 0.25,    // Cells per step
  CAT_SPEED: 0.12,       // Cells per step (in open)
  CAT_CRUMB_SPEED: 0.02, // Cells per step (in crumbs)
};

// ============================================
// Simplified Game State (for headless training)
// ============================================
class HeadlessGame {
  constructor() {
    this.reset();
  }

  reset() {
    // Player starts on right side, vertically centered
    this.playerX = CONFIG.PLAYER_START_COL;
    this.playerY = Math.floor(CONFIG.ROWS / 2);
    this.playerDirX = 0;
    this.playerDirY = 0;

    // Cat starts on left side (between player and hole)
    this.catX = Math.floor(CONFIG.COLS * 0.35);
    this.catY = Math.floor(CONFIG.ROWS * 0.25);

    // Hole is on left edge
    this.holeX = CONFIG.HOLE_COLUMN;
    this.holeY = Math.floor(CONFIG.ROWS / 2);

    // Simple crumb tracking (just around player path)
    this.crumbs = new Set();

    this.timeAlive = 0;
    this.done = false;
    this.won = false;

    return this.getState();
  }

  getState() {
    // Direction to hole
    const dHoleX = this.holeX - this.playerX;
    const dHoleY = this.holeY - this.playerY;
    const dHoleDist = Math.hypot(dHoleX, dHoleY) || 1;

    // Direction to cat
    const dCatX = this.catX - this.playerX;
    const dCatY = this.catY - this.playerY;
    const dCatDist = Math.hypot(dCatX, dCatY) || 1;

    // Check adjacent crumbs
    const key = (x, y) => `${x},${y}`;

    return {
      playerX: this.playerX / CONFIG.COLS,
      playerY: this.playerY / CONFIG.ROWS,
      dirToHoleX: dHoleX / dHoleDist,
      dirToHoleY: dHoleY / dHoleDist,
      distToHole: dHoleDist / Math.hypot(CONFIG.COLS, CONFIG.ROWS),
      distToCat: dCatDist / (Math.hypot(CONFIG.COLS, CONFIG.ROWS)),
      dirToCatX: dCatX / dCatDist,
      dirToCatY: dCatY / dCatDist,
      crumbUp: this.crumbs.has(key(this.playerX, this.playerY - 1)) ? 1 : 0,
      crumbDown: this.crumbs.has(key(this.playerX, this.playerY + 1)) ? 1 : 0,
      crumbLeft: this.crumbs.has(key(this.playerX - 1, this.playerY)) ? 1 : 0,
      crumbRight: this.crumbs.has(key(this.playerX + 1, this.playerY)) ? 1 : 0,
      movingX: this.playerDirX,
      movingY: this.playerDirY,
    };
  }

  step(action) {
    // Map action to direction
    const actions = [
      [-1, 0],  // 0: left
      [1, 0],   // 1: right
      [0, -1],  // 2: up
      [0, 1],   // 3: down
      [0, 0],   // 4: stop
    ];

    const [dx, dy] = actions[action] || [0, 0];

    // Store previous position for crumb trail
    const prevX = this.playerX;
    const prevY = this.playerY;
    const prevDistToHole = Math.hypot(this.holeX - this.playerX, this.holeY - this.playerY);

    // Update player direction and move
    if (dx !== 0 || dy !== 0) {
      this.playerDirX = dx;
      this.playerDirY = dy;
    } else {
      this.playerDirX = 0;
      this.playerDirY = 0;
    }

    // Move player
    const newX = this.playerX + this.playerDirX * CONFIG.PLAYER_SPEED;
    const newY = this.playerY + this.playerDirY * CONFIG.PLAYER_SPEED;

    // Boundary check
    if (newX >= 0 && newX < CONFIG.COLS) this.playerX = newX;
    if (newY >= 0 && newY < CONFIG.ROWS) this.playerY = newY;

    // Leave crumb trail
    const key = (x, y) => `${Math.floor(x)},${Math.floor(y)}`;
    if (Math.floor(prevX) !== Math.floor(this.playerX) ||
        Math.floor(prevY) !== Math.floor(this.playerY)) {
      this.crumbs.add(key(prevX, prevY));
    }

    // Move cat toward player (A* simplified to direct chase, slower in crumbs)
    const catDx = this.playerX - this.catX;
    const catDy = this.playerY - this.catY;
    const catDist = Math.hypot(catDx, catDy) || 1;

    // Cat speed: much slower in crumbs (this is key to player survival!)
    const catCellKey = key(this.catX, this.catY);
    const inCrumb = this.crumbs.has(catCellKey);
    const catSpeed = inCrumb ? CONFIG.CAT_CRUMB_SPEED : CONFIG.CAT_SPEED;

    this.catX += (catDx / catDist) * catSpeed;
    this.catY += (catDy / catDist) * catSpeed;

    // Cat destroys crumbs it walks through
    if (inCrumb) {
      this.crumbs.delete(catCellKey);
    }

    this.timeAlive += 1/60;

    // Check win condition (reached hole)
    const distToHole = Math.hypot(this.holeX - this.playerX, this.holeY - this.playerY);
    if (distToHole < 1.5) {
      this.done = true;
      this.won = true;
      return { state: this.getState(), reward: 100, done: true, info: { won: true } };
    }

    // Check lose condition (caught by cat)
    const distToCat = Math.hypot(this.catX - this.playerX, this.catY - this.playerY);
    if (distToCat < CONFIG.CATCH_RADIUS) {
      this.done = true;
      return { state: this.getState(), reward: -100, done: true, info: { caught: true } };
    }

    // Calculate reward
    let reward = 0;

    // Progress toward hole
    const newDistToHole = Math.hypot(this.holeX - this.playerX, this.holeY - this.playerY);
    reward += (prevDistToHole - newDistToHole) * 5;

    // Survival bonus
    reward += 0.05;

    // Danger penalty
    const dangerRadius = 5;
    if (distToCat < dangerRadius) {
      reward -= 2 * (1 - distToCat / dangerRadius);
    }

    // Penalty for stopping
    if (this.playerDirX === 0 && this.playerDirY === 0) {
      reward -= 0.1;
    }

    return { state: this.getState(), reward, done: false, info: {} };
  }
}

// ============================================
// Q-Learning Agent (same as browser version)
// ============================================
class QLearningAgent {
  constructor(options = {}) {
    this.lr = options.learningRate ?? 0.2;
    this.gamma = options.discount ?? 0.9;
    this.epsilon = options.epsilon ?? 1.0;
    this.epsilonDecay = options.epsilonDecay ?? 0.998;
    this.epsilonMin = options.epsilonMin ?? 0.05;
    this.numActions = 5;
    this.qTable = new Map();
  }

  dirToOctant(dx, dy) {
    const angle = Math.atan2(dy, dx);
    return Math.round((angle + Math.PI) / (Math.PI / 4)) % 8;
  }

  distToDanger(dist) {
    if (dist < 0.08) return 0;
    if (dist < 0.2) return 1;
    return 2;
  }

  isCatBlocking(state) {
    const dotProduct = state.dirToHoleX * state.dirToCatX + state.dirToHoleY * state.dirToCatY;
    return (dotProduct > 0.3 && state.distToCat < state.distToHole * 1.5) ? 1 : 0;
  }

  stateToKey(state) {
    const holeDir = this.dirToOctant(state.dirToHoleX, state.dirToHoleY);
    const catDanger = this.distToDanger(state.distToCat);
    const catDir = catDanger < 2 ? this.dirToOctant(state.dirToCatX, state.dirToCatY) : 0;
    const blocking = this.isCatBlocking(state);
    const crumbMask = (state.crumbUp << 3) | (state.crumbDown << 2) |
                      (state.crumbLeft << 1) | state.crumbRight;
    return `${holeDir},${catDanger},${catDir},${blocking},${crumbMask}`;
  }

  getQ(key) {
    if (!this.qTable.has(key)) {
      const q = new Float32Array(this.numActions);
      for (let i = 0; i < this.numActions; i++) {
        q[i] = Math.random() * 0.01;
      }
      this.qTable.set(key, q);
    }
    return this.qTable.get(key);
  }

  getAction(state) {
    if (Math.random() < this.epsilon) {
      return Math.floor(Math.random() * this.numActions);
    }
    return this.getBestAction(state);
  }

  getBestAction(state) {
    const key = this.stateToKey(state);
    const q = this.getQ(key);
    let bestAction = 0;
    let bestValue = q[0];
    for (let a = 1; a < this.numActions; a++) {
      if (q[a] > bestValue) {
        bestValue = q[a];
        bestAction = a;
      }
    }
    return bestAction;
  }

  update(state, action, reward, nextState, done) {
    const key = this.stateToKey(state);
    const q = this.getQ(key);
    let target;
    if (done) {
      target = reward;
    } else {
      const nextKey = this.stateToKey(nextState);
      const nextQ = this.getQ(nextKey);
      target = reward + this.gamma * Math.max(...nextQ);
    }
    q[action] += this.lr * (target - q[action]);
  }

  decayEpsilon() {
    if (this.epsilon > this.epsilonMin) {
      this.epsilon *= this.epsilonDecay;
    }
  }
}

// ============================================
// Training Loop
// ============================================
function runTraining(numEpisodes = 500, verbose = true) {
  const game = new HeadlessGame();
  const agent = new QLearningAgent();

  const stats = {
    episodes: 0,
    wins: 0,
    catches: 0,
    totalReward: 0,
    recentRewards: [],
    recentWins: [],
    avgStepsPerEpisode: 0,
    totalSteps: 0,
  };

  const maxStepsPerEpisode = 2000;

  for (let ep = 0; ep < numEpisodes; ep++) {
    let state = game.reset();
    let episodeReward = 0;
    let steps = 0;

    while (!game.done && steps < maxStepsPerEpisode) {
      const action = agent.getAction(state);
      const result = game.step(action);

      agent.update(state, action, result.reward, result.state, result.done);

      episodeReward += result.reward;
      state = result.state;
      steps++;
    }

    agent.decayEpsilon();

    // Track stats
    stats.episodes++;
    stats.totalReward += episodeReward;
    stats.totalSteps += steps;

    if (game.won) stats.wins++;
    else stats.catches++;

    stats.recentRewards.push(episodeReward);
    stats.recentWins.push(game.won ? 1 : 0);
    if (stats.recentRewards.length > 100) {
      stats.recentRewards.shift();
      stats.recentWins.shift();
    }

    // Log progress every 50 episodes
    if (verbose && (ep + 1) % 50 === 0) {
      const avgReward = stats.recentRewards.reduce((a, b) => a + b, 0) / stats.recentRewards.length;
      const winRate = stats.recentWins.reduce((a, b) => a + b, 0) / stats.recentWins.length;
      const avgSteps = stats.totalSteps / stats.episodes;

      console.log(`Episode ${ep + 1}/${numEpisodes} | ` +
        `Avg Reward: ${avgReward.toFixed(1)} | ` +
        `Win Rate: ${(winRate * 100).toFixed(1)}% | ` +
        `Epsilon: ${agent.epsilon.toFixed(3)} | ` +
        `Q-States: ${agent.qTable.size} | ` +
        `Avg Steps: ${avgSteps.toFixed(0)}`);
    }
  }

  // Final summary
  const avgReward = stats.recentRewards.reduce((a, b) => a + b, 0) / stats.recentRewards.length;
  const winRate = stats.recentWins.reduce((a, b) => a + b, 0) / stats.recentWins.length;

  console.log('\n========== TRAINING COMPLETE ==========');
  console.log(`Total Episodes: ${stats.episodes}`);
  console.log(`Total Wins: ${stats.wins} (${(stats.wins / stats.episodes * 100).toFixed(1)}%)`);
  console.log(`Final Avg Reward (last 100): ${avgReward.toFixed(1)}`);
  console.log(`Final Win Rate (last 100): ${(winRate * 100).toFixed(1)}%`);
  console.log(`Final Epsilon: ${agent.epsilon.toFixed(3)}`);
  console.log(`Q-Table Size: ${agent.qTable.size}`);
  console.log(`Avg Steps/Episode: ${(stats.totalSteps / stats.episodes).toFixed(0)}`);

  return { stats, agent };
}

// ============================================
// Analysis Functions
// ============================================
function analyzeAgent(agent) {
  console.log('\n========== Q-TABLE ANALYSIS ==========');

  // Analyze Q-values by state features
  const analysis = {
    byHoleDir: Array(8).fill(0).map(() => ({ count: 0, avgQ: 0, bestActions: {} })),
    byCatDanger: Array(3).fill(0).map(() => ({ count: 0, avgQ: 0, bestActions: {} })),
  };

  const actionNames = ['left', 'right', 'up', 'down', 'stop'];

  for (const [key, qValues] of agent.qTable) {
    const [holeDir, catDanger] = key.split(',').map(Number);
    const maxQ = Math.max(...qValues);
    const bestAction = qValues.indexOf(maxQ);

    // By hole direction
    analysis.byHoleDir[holeDir].count++;
    analysis.byHoleDir[holeDir].avgQ += maxQ;
    analysis.byHoleDir[holeDir].bestActions[bestAction] =
      (analysis.byHoleDir[holeDir].bestActions[bestAction] || 0) + 1;

    // By cat danger
    analysis.byCatDanger[catDanger].count++;
    analysis.byCatDanger[catDanger].avgQ += maxQ;
    analysis.byCatDanger[catDanger].bestActions[bestAction] =
      (analysis.byCatDanger[catDanger].bestActions[bestAction] || 0) + 1;
  }

  // Print analysis
  console.log('\nBy Hole Direction (0=right, 2=down, 4=left, 6=up):');
  const holeDirNames = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
  for (let i = 0; i < 8; i++) {
    const data = analysis.byHoleDir[i];
    if (data.count > 0) {
      const avgQ = (data.avgQ / data.count).toFixed(2);
      const topAction = Object.entries(data.bestActions)
        .sort((a, b) => b[1] - a[1])[0];
      console.log(`  ${holeDirNames[i]} (${i}): ${data.count} states, avgQ=${avgQ}, ` +
        `most common: ${actionNames[topAction[0]]} (${topAction[1]})`);
    }
  }

  console.log('\nBy Cat Danger (0=danger, 1=caution, 2=safe):');
  const dangerNames = ['DANGER', 'caution', 'safe'];
  for (let i = 0; i < 3; i++) {
    const data = analysis.byCatDanger[i];
    if (data.count > 0) {
      const avgQ = (data.avgQ / data.count).toFixed(2);
      const topAction = Object.entries(data.bestActions)
        .sort((a, b) => b[1] - a[1])[0];
      console.log(`  ${dangerNames[i]}: ${data.count} states, avgQ=${avgQ}, ` +
        `most common: ${actionNames[topAction[0]]} (${topAction[1]})`);
    }
  }
}

// ============================================
// Main
// ============================================
const numEpisodes = parseInt(process.argv[2]) || 500;
console.log(`Starting headless training for ${numEpisodes} episodes...\n`);

const { stats, agent } = runTraining(numEpisodes);
analyzeAgent(agent);

// Recommendations
console.log('\n========== RECOMMENDATIONS ==========');
const winRate = stats.recentWins.reduce((a, b) => a + b, 0) / stats.recentWins.length;

if (winRate < 0.1) {
  console.log('- Win rate very low (<10%). Consider:');
  console.log('  * Increasing progress reward toward hole');
  console.log('  * Reducing death penalty magnitude');
  console.log('  * Simplifying state space further');
} else if (winRate < 0.3) {
  console.log('- Win rate moderate (10-30%). Consider:');
  console.log('  * More training episodes');
  console.log('  * Tuning danger thresholds');
  console.log('  * Adding escape direction to state');
} else {
  console.log('- Win rate good (>30%). Agent is learning!');
  console.log('  * Try with actual game to verify');
}
