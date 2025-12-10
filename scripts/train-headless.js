/**
 * Headless Q-Learning Training Script
 *
 * Uses the REAL Game class for training, ensuring learned strategies
 * transfer directly to the browser game.
 *
 * Usage: node scripts/train-headless.js [episodes]
 */

import { Game } from '../src/game.js';
import { QLearningAgent } from '../src/ml/qlearning.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';

// ============================================
// Training Configuration
// ============================================
const TRAINING_CONFIG = {
  maxStepsPerEpisode: 3000,  // ~50 seconds at 60fps
  dt: 1 / 60,                // Delta time per step (60 fps)
  startLevel: 1,             // Level to train on
  saveInterval: 100,         // Save Q-table every N episodes
  saveFile: 'scripts/qtable-trained.json',
};

// ============================================
// Training Loop
// ============================================
function runTraining(numEpisodes = 500, verbose = true) {
  // Create headless game instance (uses real game physics!)
  const game = new Game(null, { headless: true });

  // Create Q-learning agent
  const agent = new QLearningAgent();

  // Try to load existing Q-table
  if (existsSync(TRAINING_CONFIG.saveFile)) {
    try {
      const data = JSON.parse(readFileSync(TRAINING_CONFIG.saveFile, 'utf8'));
      agent.importQTable(data);
      console.log(`Loaded existing Q-table: ${agent.qTable.size} states, ${agent.stats.episodes} episodes`);
    } catch (e) {
      console.log('Could not load existing Q-table, starting fresh');
    }
  }

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

  for (let ep = 0; ep < numEpisodes; ep++) {
    // Reset game to level 1
    let state = game.reset(TRAINING_CONFIG.startLevel);
    let episodeReward = 0;
    let steps = 0;
    let done = false;
    let info = {};

    while (!done && steps < TRAINING_CONFIG.maxStepsPerEpisode) {
      // Get action from agent
      const action = agent.getAction(state);

      // Execute action in real game
      const result = game.step(action, TRAINING_CONFIG.dt);

      // Update agent
      agent.update(state, action, result.reward, result.state, result.done);

      // Track
      episodeReward += result.reward;
      state = result.state;
      done = result.done;
      info = result.info;
      steps++;
    }

    // Record episode
    agent.recordEpisode(episodeReward);

    // Track stats
    stats.episodes++;
    stats.totalReward += episodeReward;
    stats.totalSteps += steps;

    if (info.levelComplete) stats.wins++;
    else stats.catches++;

    stats.recentRewards.push(episodeReward);
    stats.recentWins.push(info.levelComplete ? 1 : 0);
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

    // Periodic save
    if ((ep + 1) % TRAINING_CONFIG.saveInterval === 0) {
      saveQTable(agent);
    }
  }

  // Final save
  saveQTable(agent);

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
// Save/Load Q-Table
// ============================================
function saveQTable(agent) {
  const data = agent.exportQTable();
  writeFileSync(TRAINING_CONFIG.saveFile, JSON.stringify(data, null, 2));
  console.log(`  [Saved Q-table to ${TRAINING_CONFIG.saveFile}]`);
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
console.log(`Starting headless training for ${numEpisodes} episodes...`);
console.log(`Using REAL Game class - strategies will transfer to browser!\n`);

const { stats, agent } = runTraining(numEpisodes);
analyzeAgent(agent);

// Recommendations
console.log('\n========== RECOMMENDATIONS ==========');
const winRate = stats.recentWins.reduce((a, b) => a + b, 0) / stats.recentWins.length;

if (winRate < 0.1) {
  console.log('- Win rate very low (<10%). Consider:');
  console.log('  * Game may be too hard - check cat speed vs player speed');
  console.log('  * Need more training episodes');
  console.log('  * State space may need adjustment');
} else if (winRate < 0.3) {
  console.log('- Win rate moderate (10-30%). Consider:');
  console.log('  * More training episodes');
  console.log('  * Tuning danger thresholds in stateToKey');
  console.log('  * Adjusting reward shaping');
} else {
  console.log('- Win rate good (>30%). Agent is learning!');
  console.log('  * Load Q-table in browser to verify');
  console.log('  * Can try higher levels for more challenge');
}

console.log('\nTo use in browser:');
console.log('  1. Copy Q-table to localStorage or import in browser');
console.log('  2. Or copy the saved JSON file content');
