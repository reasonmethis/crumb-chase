/**
 * Tests for core game logic.
 * Run with: node tests/test-core.js
 */

const core = require('../src/core.js');

// Simple test framework
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertClose(actual, expected, epsilon = 0.001, message) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(message || `Expected ~${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(message || `Expected ${expectedStr}, got ${actualStr}`);
  }
}

// ============================================
// Grid Utilities Tests
// ============================================

console.log('\n--- Grid Utilities ---');

test('idx: converts (0,0) to 0', () => {
  assertEqual(core.idx(0, 0, 10), 0);
});

test('idx: converts (5,0) to 5 in 10-col grid', () => {
  assertEqual(core.idx(5, 0, 10), 5);
});

test('idx: converts (0,1) to 10 in 10-col grid', () => {
  assertEqual(core.idx(0, 1, 10), 10);
});

test('idx: converts (3,2) to 23 in 10-col grid', () => {
  assertEqual(core.idx(3, 2, 10), 23);
});

test('inBounds: (0,0) is in bounds for 10x10', () => {
  assert(core.inBounds(0, 0, 10, 10));
});

test('inBounds: (9,9) is in bounds for 10x10', () => {
  assert(core.inBounds(9, 9, 10, 10));
});

test('inBounds: (-1,0) is out of bounds', () => {
  assert(!core.inBounds(-1, 0, 10, 10));
});

test('inBounds: (10,0) is out of bounds for 10x10', () => {
  assert(!core.inBounds(10, 0, 10, 10));
});

test('inBounds: (0,-1) is out of bounds', () => {
  assert(!core.inBounds(0, -1, 10, 10));
});

test('inBounds: (0,10) is out of bounds for 10x10', () => {
  assert(!core.inBounds(0, 10, 10, 10));
});

test('cellAt: pixel (0,0) maps to cell (0,0)', () => {
  assertDeepEqual(core.cellAt(0, 0, 20), { c: 0, r: 0 });
});

test('cellAt: pixel (19,19) maps to cell (0,0) with tile=20', () => {
  assertDeepEqual(core.cellAt(19, 19, 20), { c: 0, r: 0 });
});

test('cellAt: pixel (20,20) maps to cell (1,1) with tile=20', () => {
  assertDeepEqual(core.cellAt(20, 20, 20), { c: 1, r: 1 });
});

test('cellAt: pixel (45,65) maps to cell (2,3) with tile=20', () => {
  assertDeepEqual(core.cellAt(45, 65, 20), { c: 2, r: 3 });
});

test('centerOf: cell (0,0) center is (10,10) with tile=20', () => {
  assertDeepEqual(core.centerOf(0, 0, 20), { x: 10, y: 10 });
});

test('centerOf: cell (2,3) center is (50,70) with tile=20', () => {
  assertDeepEqual(core.centerOf(2, 3, 20), { x: 50, y: 70 });
});

// ============================================
// Turn Helpers Tests
// ============================================

console.log('\n--- Turn Helpers ---');

test('nearestColumnCenter: at center stays at center', () => {
  const center = core.nearestColumnCenter(10, 0, 20); // x=10 is center of col 0
  assertEqual(center, 10);
});

test('nearestColumnCenter: slightly off center, stationary, snaps to current', () => {
  const center = core.nearestColumnCenter(12, 0, 20);
  assertEqual(center, 10);
});

test('nearestColumnCenter: moving right, closer to next center', () => {
  const center = core.nearestColumnCenter(28, 1, 20); // Moving right, x=28, centers at 10, 30
  assertEqual(center, 30);
});

test('canTurnVertical: at center can turn', () => {
  assert(core.canTurnVertical(10, 0, 20, 7)); // x=10, turnEps=7
});

test('canTurnVertical: within epsilon can turn', () => {
  assert(core.canTurnVertical(14, 0, 20, 7)); // x=14, eps=7, center=10
});

test('canTurnVertical: outside epsilon cannot turn', () => {
  assert(!core.canTurnVertical(18, 0, 20, 7)); // x=18, eps=7, center=10
});

test('canTurnHorizontal: at center can turn', () => {
  assert(core.canTurnHorizontal(10, 0, 20, 7)); // y=10
});

// ============================================
// Random Utilities Tests
// ============================================

console.log('\n--- Random Utilities ---');

test('randInt: returns value in range', () => {
  for (let i = 0; i < 100; i++) {
    const val = core.randInt(5, 10);
    assert(val >= 5 && val <= 10, `randInt(5,10) returned ${val}`);
  }
});

test('randRange: returns value in range', () => {
  for (let i = 0; i < 100; i++) {
    const val = core.randRange(0.5, 1.5);
    assert(val >= 0.5 && val < 1.5, `randRange(0.5,1.5) returned ${val}`);
  }
});

test('randomFromSet: returns null for empty set', () => {
  assertEqual(core.randomFromSet(new Set()), null);
});

test('randomFromSet: returns element from set', () => {
  const set = new Set([1, 2, 3]);
  for (let i = 0; i < 20; i++) {
    const val = core.randomFromSet(set);
    assert(set.has(val), `randomFromSet returned ${val} not in set`);
  }
});

// ============================================
// Pathfinding Tests
// ============================================

console.log('\n--- Pathfinding ---');

test('heuristic: same point returns 0', () => {
  assertEqual(core.heuristic(5, 5, 5, 5), 0);
});

test('heuristic: manhattan distance horizontal', () => {
  assertEqual(core.heuristic(0, 0, 5, 0), 5);
});

test('heuristic: manhattan distance vertical', () => {
  assertEqual(core.heuristic(0, 0, 0, 7), 7);
});

test('heuristic: manhattan distance diagonal', () => {
  assertEqual(core.heuristic(0, 0, 3, 4), 7);
});

test('aStar: start equals goal returns empty path', () => {
  const path = core.aStar(5, 5, 5, 5, 10, 10, () => 1);
  assertDeepEqual(path, []);
});

test('aStar: adjacent horizontal path', () => {
  const path = core.aStar(0, 0, 1, 0, 10, 10, () => 1);
  assertDeepEqual(path, [{ c: 1, r: 0 }]);
});

test('aStar: adjacent vertical path', () => {
  const path = core.aStar(0, 0, 0, 1, 10, 10, () => 1);
  assertDeepEqual(path, [{ c: 0, r: 1 }]);
});

test('aStar: straight horizontal path', () => {
  const path = core.aStar(0, 0, 3, 0, 10, 10, () => 1);
  assertEqual(path.length, 3);
  assertDeepEqual(path[path.length - 1], { c: 3, r: 0 });
});

test('aStar: finds path around obstacle', () => {
  // Grid: start at (0,0), goal at (2,0), wall at (1,0)
  const getCost = (c, r) => (c === 1 && r === 0) ? Infinity : 1;
  const path = core.aStar(0, 0, 2, 0, 5, 5, getCost);
  assert(path.length > 0, 'Should find a path');
  assertDeepEqual(path[path.length - 1], { c: 2, r: 0 });
  // Path should not go through (1,0)
  const throughWall = path.some(p => p.c === 1 && p.r === 0);
  assert(!throughWall, 'Path should not go through wall');
});

test('aStar: returns empty for unreachable goal', () => {
  // Surround goal with walls
  const getCost = (c, r) => {
    if (c === 4 && r === 4) return 1; // goal
    if (c >= 3 && c <= 5 && r >= 3 && r <= 5) return Infinity; // walls around
    return 1;
  };
  const path = core.aStar(0, 0, 4, 4, 10, 10, getCost);
  assertDeepEqual(path, []);
});

test('aStar: prefers lower cost paths', () => {
  // Make direct path expensive, alternative cheaper
  const getCost = (c, r) => {
    if (r === 0 && c > 0 && c < 5) return 10; // expensive along row 0
    return 1;
  };
  const path = core.aStar(0, 0, 5, 0, 10, 10, getCost);
  // Path should go around (via row 1) rather than through expensive row 0
  const usesRow1 = path.some(p => p.r === 1);
  assert(usesRow1, 'Should prefer cheaper path through row 1');
});

// ============================================
// Crumb Grid Tests
// ============================================

console.log('\n--- Crumb Grid ---');

test('createCrumbGrid: creates grid with correct dimensions', () => {
  const grid = core.createCrumbGrid(10, 8);
  assertEqual(grid.cols, 10);
  assertEqual(grid.rows, 8);
  assertEqual(grid.data.length, 80);
});

test('createCrumbGrid: initializes to zeros', () => {
  const grid = core.createCrumbGrid(5, 5);
  for (let i = 0; i < grid.data.length; i++) {
    assertEqual(grid.data[i], 0);
  }
});

test('hasCrumb: returns false for empty cell', () => {
  const grid = core.createCrumbGrid(10, 10);
  assert(!core.hasCrumb(grid, 5, 5));
});

test('hasCrumb: returns true for out of bounds', () => {
  const grid = core.createCrumbGrid(10, 10);
  assert(core.hasCrumb(grid, -1, 0));
  assert(core.hasCrumb(grid, 10, 0));
});

test('addCrumb: adds crumb to cell', () => {
  const grid = core.createCrumbGrid(10, 10);
  core.addCrumb(grid, 3, 4, 2);
  assert(core.hasCrumb(grid, 3, 4));
  assertEqual(grid.data[core.idx(3, 4, 10)], 2);
});

test('addCrumb: takes max of existing and new strength', () => {
  const grid = core.createCrumbGrid(10, 10);
  core.addCrumb(grid, 3, 4, 2);
  core.addCrumb(grid, 3, 4, 1); // Should not reduce
  assertEqual(grid.data[core.idx(3, 4, 10)], 2);
  core.addCrumb(grid, 3, 4, 5); // Should increase
  assertEqual(grid.data[core.idx(3, 4, 10)], 5);
});

test('removeCrumb: removes crumb completely', () => {
  const grid = core.createCrumbGrid(10, 10);
  core.addCrumb(grid, 3, 4, 5);
  core.removeCrumb(grid, 3, 4);
  assert(!core.hasCrumb(grid, 3, 4));
});

test('weakenCrumb: reduces strength', () => {
  const grid = core.createCrumbGrid(10, 10);
  core.addCrumb(grid, 3, 4, 5);
  core.weakenCrumb(grid, 3, 4, 2);
  assertEqual(grid.data[core.idx(3, 4, 10)], 3);
});

test('weakenCrumb: does not go below zero', () => {
  const grid = core.createCrumbGrid(10, 10);
  core.addCrumb(grid, 3, 4, 2);
  core.weakenCrumb(grid, 3, 4, 10);
  assertEqual(grid.data[core.idx(3, 4, 10)], 0);
});

test('countCrumbs: counts correctly', () => {
  const grid = core.createCrumbGrid(10, 10);
  assertEqual(core.countCrumbs(grid), 0);
  core.addCrumb(grid, 1, 1, 1);
  core.addCrumb(grid, 2, 2, 1);
  core.addCrumb(grid, 3, 3, 1);
  assertEqual(core.countCrumbs(grid), 3);
});

// ============================================
// Collision Tests
// ============================================

console.log('\n--- Collision ---');

test('circlesOverlap: overlapping circles', () => {
  assert(core.circlesOverlap(0, 0, 10, 5, 0, 10));
});

test('circlesOverlap: non-overlapping circles', () => {
  assert(!core.circlesOverlap(0, 0, 10, 100, 0, 10));
});

test('circlesOverlap: just touching (with margin)', () => {
  // Circles at distance 20, each radius 10, margin 0.75
  // Combined radius * margin = 20 * 0.75 = 15
  // Distance 20 > 15, so should not overlap
  assert(!core.circlesOverlap(0, 0, 10, 20, 0, 10, 0.75));
});

test('distance: horizontal', () => {
  assertEqual(core.distance(0, 0, 10, 0), 10);
});

test('distance: vertical', () => {
  assertEqual(core.distance(0, 0, 0, 10), 10);
});

test('distance: diagonal (3-4-5 triangle)', () => {
  assertEqual(core.distance(0, 0, 3, 4), 5);
});

// ============================================
// Level Config Tests
// ============================================

console.log('\n--- Level Config ---');

test('getLevelConfig: level 1', () => {
  const cfg = core.getLevelConfig(1);
  assertEqual(cfg.cats, 1);
  assertClose(cfg.speedFactor, 0.55);
});

test('getLevelConfig: level 5', () => {
  const cfg = core.getLevelConfig(5);
  assertEqual(cfg.cats, 2);
  assertClose(cfg.speedFactor, 1.2);
});

test('getLevelConfig: level 10', () => {
  const cfg = core.getLevelConfig(10);
  assertEqual(cfg.cats, 4);
  assertClose(cfg.speedFactor, 1.2);
});

test('getLevelConfig: clamps level 0 to 1', () => {
  const cfg = core.getLevelConfig(0);
  assertEqual(cfg.cats, 1);
});

test('getLevelConfig: clamps level 99 to max', () => {
  const cfg = core.getLevelConfig(99);
  assertEqual(cfg.cats, 4); // Same as level 10
});

// ============================================
// Movement Tests
// ============================================

console.log('\n--- Movement ---');

test('moveWithCollision: moves freely in open space', () => {
  const result = core.moveWithCollision(100, 100, 5, 0, 20, 40, 25, null);
  assertEqual(result.x, 105);
  assertEqual(result.y, 100);
});

test('moveWithCollision: blocked by boundary (right)', () => {
  // At far right edge, trying to move right
  const result = core.moveWithCollision(790, 100, 20, 0, 20, 40, 25, null);
  // Should be clamped (40 cols * 20 = 800 width)
  assert(result.x <= 790, 'Should not exceed boundary');
});

test('moveWithCollision: blocked by crumb', () => {
  const isCrumb = (c, r) => c === 6 && r === 5; // Crumb at (6,5)
  // Start at center of (5,5) = (110, 110), try to move right into (6,5)
  const result = core.moveWithCollision(110, 110, 20, 0, 20, 40, 25, isCrumb);
  // Should be blocked at cell center
  assertEqual(result.x, 110);
});

// ============================================
// Summary
// ============================================

console.log('\n========================================');
console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log('========================================\n');

if (failed > 0) {
  console.log('Failed tests:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
} else {
  console.log('All tests passed!');
  process.exit(0);
}
