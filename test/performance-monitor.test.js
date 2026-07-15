import test from "node:test";
import assert from "node:assert/strict";

import { loadBooleanSetting, saveBooleanSetting } from "../src/js/dom.js";
import {
  createFrameTimeHistory,
  createPerformanceMonitor,
  formatRendererStats,
  normalizeFrameDelta,
  PERFORMANCE_MONITOR_STORAGE_KEY,
  smoothValue
} from "../src/js/performance-monitor.js";

test("performance monitor frame calculations smooth and reject long gaps", () => {
  assert.equal(normalizeFrameDelta(16.67), 16.67);
  assert.equal(normalizeFrameDelta(0), null);
  assert.equal(normalizeFrameDelta(300), null);
  assert.equal(smoothValue(null, 60, 0.2), 60);
  assert.equal(smoothValue(60, 120, 0.5), 90);
});

test("frame-time history is bounded and keeps a rolling average", () => {
  const history = createFrameTimeHistory(3);
  history.add(10);
  history.add(20);
  history.add(30);
  history.add(40);
  const samples = [];
  history.forEach((sample) => samples.push(sample));
  assert.deepEqual(samples, [20, 30, 40]);
  assert.equal(history.size, 3);
  assert.equal(history.average(), 30);
  history.clear();
  assert.equal(history.size, 0);
  assert.equal(history.average(), 0);
});

test("performance monitor persistence defaults off and validates stored values", () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); }
  };

  assert.equal(loadBooleanSetting(storage, PERFORMANCE_MONITOR_STORAGE_KEY, false), false);
  values.set(PERFORMANCE_MONITOR_STORAGE_KEY, "unexpected");
  assert.equal(loadBooleanSetting(storage, PERFORMANCE_MONITOR_STORAGE_KEY, false), false);
  saveBooleanSetting(storage, PERFORMANCE_MONITOR_STORAGE_KEY, true);
  assert.equal(loadBooleanSetting(storage, PERFORMANCE_MONITOR_STORAGE_KEY, false), true);
});

test("renderer stats are safely formatted and monitor enable/disable stays in place", () => {
  assert.deepEqual(formatRendererStats({ info: { render: { calls: 4, triangles: 1200, points: 18 } } }), {
    drawCalls: 4,
    triangles: 1200,
    points: 18
  });
  assert.deepEqual(formatRendererStats(null), { drawCalls: 0, triangles: 0, points: 0 });

  const container = {
    hidden: false,
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  };
  const monitor = createPerformanceMonitor({ container });
  assert.equal(monitor.enabled, false);
  assert.equal(container.hidden, true);

  monitor.setEnabled(true);
  monitor.update(1000, null);
  monitor.update(1016, { info: { render: { calls: 2, triangles: 10, points: 3 } } });
  let snapshot = monitor.getSnapshot();
  assert.equal(snapshot.sampleCount, 1);
  assert.equal(snapshot.frameTimeMs, 16);
  assert.equal(snapshot.averageFrameTimeMs, 16);
  assert.deepEqual(snapshot.rendererStats, { drawCalls: 2, triangles: 10, points: 3 });

  monitor.update(2000, null);
  snapshot = monitor.getSnapshot();
  assert.equal(snapshot.sampleCount, 0);
  monitor.setEnabled(false);
  assert.equal(monitor.enabled, false);
  assert.equal(container.hidden, true);
  monitor.update(2016, null);
  assert.equal(monitor.getSnapshot().sampleCount, 0);
});
