/**
 * Crumb Chase - Q-Learning Agent
 *
 * Implements tabular Q-learning with discretized state space.
 * Uses epsilon-greedy exploration with decay.
 *
 * @module ml/qlearning
 */

/**
 * Q-Learning Agent for the Crumb Chase game.
 *
 * Discretizes continuous state features into bins and maintains
 * a Q-table mapping state strings to action values.
 */
export class QLearningAgent {
  /**
   * Create a new Q-learning agent.
   * @param {Object} options - Agent configuration
   * @param {number} options.learningRate - Learning rate alpha (default 0.1)
   * @param {number} options.discount - Discount factor gamma (default 0.95)
   * @param {number} options.epsilon - Initial exploration rate (default 1.0)
   * @param {number} options.epsilonDecay - Epsilon decay per episode (default 0.995)
   * @param {number} options.epsilonMin - Minimum epsilon (default 0.01)
   * @param {number} options.bins - Number of bins for discretization (default 10)
   */
  constructor(options = {}) {
    /** Learning rate (alpha) */
    this.lr = options.learningRate ?? 0.1;

    /** Discount factor (gamma) */
    this.gamma = options.discount ?? 0.95;

    /** Exploration rate (epsilon) */
    this.epsilon = options.epsilon ?? 1.0;

    /** Epsilon decay multiplier per episode */
    this.epsilonDecay = options.epsilonDecay ?? 0.995;

    /** Minimum exploration rate */
    this.epsilonMin = options.epsilonMin ?? 0.01;

    /** Number of bins for discretization */
    this.bins = options.bins ?? 10;

    /** Number of actions (left, right, up, down, stop) */
    this.numActions = 5;

    /** Q-table: state string -> Float32Array of action values */
    this.qTable = new Map();

    /** Training statistics */
    this.stats = {
      episodes: 0,
      totalReward: 0,
      avgReward: 0,
      bestReward: -Infinity,
      recentRewards: [],
    };
  }

  /**
   * Discretize a continuous value into a bin index.
   * @param {number} value - Value to discretize (expected 0-1 range)
   * @param {number} bins - Number of bins
   * @returns {number} Bin index
   */
  discretize(value, bins = this.bins) {
    // Clamp to [0, 1] then map to bin
    const clamped = Math.max(0, Math.min(1, value));
    return Math.min(bins - 1, Math.floor(clamped * bins));
  }

  /**
   * Discretize a signed value (-1 to 1) into a bin index.
   * @param {number} value - Signed value to discretize
   * @param {number} bins - Number of bins
   * @returns {number} Bin index
   */
  discretizeSigned(value, bins = this.bins) {
    // Map [-1, 1] to [0, 1] then discretize
    const normalized = (value + 1) / 2;
    return this.discretize(normalized, bins);
  }

  /**
   * Convert game state object to discretized state string.
   * @param {Object} state - State from game.getState()
   * @returns {string} Discretized state key
   */
  stateToKey(state) {
    // Discretize key features
    const features = [
      this.discretize(state.playerX),
      this.discretize(state.playerY),
      this.discretizeSigned(state.dirToHoleX),
      this.discretizeSigned(state.dirToHoleY),
      this.discretize(state.distToHole),
      this.discretize(state.distToCat),
      this.discretizeSigned(state.dirToCatX),
      this.discretizeSigned(state.dirToCatY),
      state.crumbUp,
      state.crumbDown,
      state.crumbLeft,
      state.crumbRight,
      // Discretize movement direction: -1, 0, 1 -> 0, 1, 2
      state.movingX + 1,
      state.movingY + 1,
    ];

    return features.join(',');
  }

  /**
   * Get Q-values for a state, initializing if needed.
   * @param {string} key - State key
   * @returns {Float32Array} Q-values for all actions
   */
  getQ(key) {
    if (!this.qTable.has(key)) {
      // Initialize with small random values to break ties
      const q = new Float32Array(this.numActions);
      for (let i = 0; i < this.numActions; i++) {
        q[i] = Math.random() * 0.01;
      }
      this.qTable.set(key, q);
    }
    return this.qTable.get(key);
  }

  /**
   * Choose an action using epsilon-greedy policy.
   * @param {Object} state - Current state object
   * @returns {number} Action index (0-4)
   */
  getAction(state) {
    // Exploration: random action
    if (Math.random() < this.epsilon) {
      return Math.floor(Math.random() * this.numActions);
    }

    // Exploitation: best action
    return this.getBestAction(state);
  }

  /**
   * Get the best action for a state (greedy).
   * @param {Object} state - Current state object
   * @returns {number} Best action index
   */
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

  /**
   * Update Q-value using the Q-learning update rule.
   * @param {Object} state - Current state
   * @param {number} action - Action taken
   * @param {number} reward - Reward received
   * @param {Object} nextState - Next state
   * @param {boolean} done - Whether episode ended
   */
  update(state, action, reward, nextState, done) {
    const key = this.stateToKey(state);
    const q = this.getQ(key);

    // Calculate target
    let target;
    if (done) {
      target = reward;
    } else {
      const nextKey = this.stateToKey(nextState);
      const nextQ = this.getQ(nextKey);
      const maxNextQ = Math.max(...nextQ);
      target = reward + this.gamma * maxNextQ;
    }

    // Q-learning update
    q[action] += this.lr * (target - q[action]);
  }

  /**
   * Decay epsilon after an episode.
   */
  decayEpsilon() {
    if (this.epsilon > this.epsilonMin) {
      this.epsilon *= this.epsilonDecay;
      if (this.epsilon < this.epsilonMin) {
        this.epsilon = this.epsilonMin;
      }
    }
  }

  /**
   * Record episode statistics.
   * @param {number} totalReward - Total reward for the episode
   */
  recordEpisode(totalReward) {
    this.stats.episodes++;
    this.stats.totalReward += totalReward;

    // Track recent rewards for moving average
    this.stats.recentRewards.push(totalReward);
    if (this.stats.recentRewards.length > 100) {
      this.stats.recentRewards.shift();
    }

    // Update averages
    this.stats.avgReward = this.stats.totalReward / this.stats.episodes;
    if (totalReward > this.stats.bestReward) {
      this.stats.bestReward = totalReward;
    }

    // Decay exploration
    this.decayEpsilon();
  }

  /**
   * Get recent average reward (last 100 episodes).
   * @returns {number} Recent average reward
   */
  getRecentAvgReward() {
    if (this.stats.recentRewards.length === 0) return 0;
    const sum = this.stats.recentRewards.reduce((a, b) => a + b, 0);
    return sum / this.stats.recentRewards.length;
  }

  /**
   * Get current training statistics.
   * @returns {Object} Training stats
   */
  getStats() {
    return {
      episodes: this.stats.episodes,
      epsilon: this.epsilon,
      avgReward: this.stats.avgReward,
      recentAvgReward: this.getRecentAvgReward(),
      bestReward: this.stats.bestReward,
      qTableSize: this.qTable.size,
    };
  }

  /**
   * Export Q-table to JSON-serializable format.
   * @returns {Object} Serializable Q-table data
   */
  exportQTable() {
    const data = {
      lr: this.lr,
      gamma: this.gamma,
      epsilon: this.epsilon,
      epsilonDecay: this.epsilonDecay,
      epsilonMin: this.epsilonMin,
      bins: this.bins,
      stats: { ...this.stats },
      qTable: {},
    };

    for (const [key, values] of this.qTable) {
      data.qTable[key] = Array.from(values);
    }

    return data;
  }

  /**
   * Import Q-table from serialized data.
   * @param {Object} data - Serialized Q-table data
   */
  importQTable(data) {
    this.lr = data.lr ?? this.lr;
    this.gamma = data.gamma ?? this.gamma;
    this.epsilon = data.epsilon ?? this.epsilon;
    this.epsilonDecay = data.epsilonDecay ?? this.epsilonDecay;
    this.epsilonMin = data.epsilonMin ?? this.epsilonMin;
    this.bins = data.bins ?? this.bins;

    if (data.stats) {
      this.stats = { ...data.stats };
    }

    this.qTable.clear();
    if (data.qTable) {
      for (const [key, values] of Object.entries(data.qTable)) {
        this.qTable.set(key, new Float32Array(values));
      }
    }
  }

  /**
   * Reset the agent (clear Q-table and stats).
   */
  reset() {
    this.qTable.clear();
    this.epsilon = 1.0;
    this.stats = {
      episodes: 0,
      totalReward: 0,
      avgReward: 0,
      bestReward: -Infinity,
      recentRewards: [],
    };
  }
}
