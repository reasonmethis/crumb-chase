/**
 * Crumb Chase - Training Manager
 *
 * Manages training loop for Q-learning agent.
 * Supports visible training, fast-forward, and headless modes.
 *
 * @module ml/training
 */

import { QLearningAgent } from './qlearning.js';

/**
 * Training modes.
 */
export const TrainingMode = {
  HUMAN: 'human',     // Human plays
  AI_PLAY: 'ai_play', // AI plays (no learning)
  TRAIN: 'train',     // AI trains (learning enabled)
};

/**
 * Training manager for the Q-learning agent.
 */
export class TrainingManager {
  /**
   * Create a new training manager.
   * @param {Game} game - Game instance
   * @param {Object} options - Configuration options
   */
  constructor(game, options = {}) {
    /** Game instance */
    this.game = game;

    /** Q-learning agent */
    this.agent = new QLearningAgent(options.agentOptions);

    /** Current training mode */
    this.mode = TrainingMode.HUMAN;

    /** Training speed multiplier (1 = normal, 10 = 10x) */
    this.speed = 1;

    /** Whether training is paused */
    this.paused = false;

    /** Steps per frame when training fast */
    this.stepsPerFrame = 1;

    /** Current episode state */
    this.episodeState = null;
    this.episodeReward = 0;
    this.episodeSteps = 0;

    /** Maximum steps per episode (prevent infinite loops) */
    this.maxStepsPerEpisode = options.maxSteps ?? 10000;

    /** Callback when episode ends */
    this.onEpisodeEnd = options.onEpisodeEnd ?? null;

    /** Callback when stats update */
    this.onStatsUpdate = options.onStatsUpdate ?? null;

    /** Time step for ML updates */
    this.dt = 1 / 60;
  }

  /**
   * Set the training mode.
   * @param {string} mode - TrainingMode value
   */
  setMode(mode) {
    this.mode = mode;

    if (mode === TrainingMode.HUMAN) {
      // Reset to human control
      this.game.reset(1);
    } else {
      // Start AI control
      this.startEpisode();
    }
  }

  /**
   * Set training speed.
   * @param {number} speed - Speed multiplier (1, 2, 5, 10)
   */
  setSpeed(speed) {
    this.speed = speed;
    this.stepsPerFrame = speed;
  }

  /**
   * Start a new episode.
   */
  startEpisode() {
    this.episodeState = this.game.reset(1);
    this.episodeReward = 0;
    this.episodeSteps = 0;
  }

  /**
   * Run one step of the agent.
   * @returns {{done: boolean, info: Object}} Step result
   */
  step() {
    if (this.mode === TrainingMode.HUMAN || !this.episodeState) {
      return { done: false, info: {} };
    }

    // Get action from agent
    const action = this.agent.getAction(this.episodeState);

    // Execute action in game
    const result = this.game.step(action, this.dt);

    // Update agent (only in training mode)
    if (this.mode === TrainingMode.TRAIN) {
      this.agent.update(
        this.episodeState,
        action,
        result.reward,
        result.state,
        result.done
      );
    }

    // Update episode tracking
    this.episodeState = result.state;
    this.episodeReward += result.reward;
    this.episodeSteps++;

    // Check for episode end
    if (result.done || this.episodeSteps >= this.maxStepsPerEpisode) {
      this.endEpisode(result.info);
      return { done: true, info: result.info };
    }

    return { done: false, info: result.info };
  }

  /**
   * End the current episode and record stats.
   * @param {Object} info - Episode info
   */
  endEpisode(info) {
    if (this.mode === TrainingMode.TRAIN) {
      this.agent.recordEpisode(this.episodeReward);
    }

    if (this.onEpisodeEnd) {
      this.onEpisodeEnd({
        reward: this.episodeReward,
        steps: this.episodeSteps,
        ...info,
        agentStats: this.agent.getStats(),
      });
    }

    // Auto-restart episode in AI modes
    if (this.mode !== TrainingMode.HUMAN) {
      this.startEpisode();
    }
  }

  /**
   * Update training - called each frame.
   * @param {number} dt - Delta time (not used, we use fixed dt)
   */
  update(dt) {
    if (this.mode === TrainingMode.HUMAN || this.paused) {
      return;
    }

    // Run multiple steps per frame for speed-up
    for (let i = 0; i < this.stepsPerFrame; i++) {
      const result = this.step();

      // Notify stats update periodically
      if (this.onStatsUpdate && this.episodeSteps % 60 === 0) {
        this.onStatsUpdate(this.agent.getStats());
      }
    }
  }

  /**
   * Get current agent statistics.
   * @returns {Object} Agent stats
   */
  getStats() {
    return {
      mode: this.mode,
      speed: this.speed,
      episodeReward: this.episodeReward,
      episodeSteps: this.episodeSteps,
      ...this.agent.getStats(),
    };
  }

  /**
   * Save agent to localStorage.
   * @param {string} key - Storage key (default 'crumbChaseAgent')
   */
  save(key = 'crumbChaseAgent') {
    const data = this.agent.exportQTable();
    localStorage.setItem(key, JSON.stringify(data));
  }

  /**
   * Load agent from localStorage.
   * @param {string} key - Storage key (default 'crumbChaseAgent')
   * @returns {boolean} True if loaded successfully
   */
  load(key = 'crumbChaseAgent') {
    const json = localStorage.getItem(key);
    if (!json) return false;

    try {
      const data = JSON.parse(json);
      this.agent.importQTable(data);
      return true;
    } catch (e) {
      console.error('Failed to load agent:', e);
      return false;
    }
  }

  /**
   * Reset the agent (clear all learning).
   */
  resetAgent() {
    this.agent.reset();
    if (this.mode !== TrainingMode.HUMAN) {
      this.startEpisode();
    }
  }
}
