export const PERFORMANCE_MONITOR_STORAGE_KEY = "catmoon.performanceMonitorEnabled.v1";
export const PERFORMANCE_MONITOR_DEFAULTS = Object.freeze({
  historySize: 60,
  displayIntervalMs: 200,
  smoothingAlpha: 0.15,
  maxFrameGapMs: 250
});

export function normalizeFrameDelta(deltaMs, maxFrameGapMs = PERFORMANCE_MONITOR_DEFAULTS.maxFrameGapMs) {
  return Number.isFinite(deltaMs) && deltaMs > 0 && deltaMs <= maxFrameGapMs ? deltaMs : null;
}

export function smoothValue(previous, current, alpha = PERFORMANCE_MONITOR_DEFAULTS.smoothingAlpha) {
  if (!Number.isFinite(current)) return Number.isFinite(previous) ? previous : 0;
  if (!Number.isFinite(previous)) return current;
  const weight = Math.min(1, Math.max(0, alpha));
  return previous + ((current - previous) * weight);
}

export function createFrameTimeHistory(limit = PERFORMANCE_MONITOR_DEFAULTS.historySize) {
  const capacity = Math.max(1, Math.floor(limit));
  const values = new Float64Array(capacity);
  let cursor = 0;
  let count = 0;
  let total = 0;

  return {
    add(value) {
      if (!Number.isFinite(value) || value <= 0) return;
      if (count === capacity) total -= values[cursor];
      else count += 1;
      values[cursor] = value;
      total += value;
      cursor = (cursor + 1) % capacity;
    },
    average() {
      return count ? total / count : 0;
    },
    clear() {
      cursor = 0;
      count = 0;
      total = 0;
    },
    forEach(callback) {
      const start = (cursor - count + capacity) % capacity;
      for (let index = 0; index < count; index += 1) {
        callback(values[(start + index) % capacity], index, count);
      }
    },
    get size() {
      return count;
    },
    get capacity() {
      return capacity;
    }
  };
}

export function formatRendererStats(renderer) {
  const renderStats = renderer?.info?.render || {};
  return {
    drawCalls: Number.isFinite(renderStats.calls) ? renderStats.calls : 0,
    triangles: Number.isFinite(renderStats.triangles) ? renderStats.triangles : 0,
    points: Number.isFinite(renderStats.points) ? renderStats.points : 0
  };
}

function formatNumber(value, decimals = 1) {
  return Number.isFinite(value) ? value.toFixed(decimals) : "—";
}

function formatCount(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : "—";
}

export function createPerformanceMonitor({
  container,
  graphCanvas,
  currentFpsEl,
  smoothedFpsEl,
  frameTimeEl,
  averageFrameTimeEl,
  cameraDistanceEl,
  drawCallsEl,
  trianglesEl,
  pointsEl,
  defaults = PERFORMANCE_MONITOR_DEFAULTS
} = {}) {
  const history = createFrameTimeHistory(defaults.historySize);
  const graphContext = graphCanvas?.getContext?.("2d") || null;
  let enabled = false;
  let previousTimestamp = null;
  let lastDisplayTimestamp = -Infinity;
  let currentFps = 0;
  let smoothedFps = 0;
  let frameTimeMs = 0;
  let cameraDistance = null;
  let rendererStats = { drawCalls: 0, triangles: 0, points: 0 };

  function setOverlayVisibility(visible) {
    if (container) {
      container.hidden = !visible;
      container.setAttribute?.("aria-hidden", visible ? "false" : "true");
    }
  }

  function drawGraph() {
    if (!graphContext || !graphCanvas) return;
    const width = graphCanvas.width;
    const height = graphCanvas.height;
    graphContext.clearRect(0, 0, width, height);
    graphContext.fillStyle = "rgba(255, 105, 180, 0.16)";
    graphContext.fillRect(0, 0, width, height);
    if (!history.size) return;

    graphContext.beginPath();
    let first = true;
    history.forEach((sample, index, count) => {
      const x = count <= 1 ? 0 : (index / (count - 1)) * width;
      const y = height - (Math.min(sample, 50) / 50) * height;
      if (first) {
        graphContext.moveTo(x, y);
        first = false;
      } else {
        graphContext.lineTo(x, y);
      }
    });
    graphContext.strokeStyle = "rgba(255, 220, 240, 0.92)";
    graphContext.lineWidth = 1;
    graphContext.stroke();
  }

  function updateDisplay(renderer) {
    rendererStats = formatRendererStats(renderer);
    if (currentFpsEl) currentFpsEl.textContent = formatNumber(currentFps);
    if (smoothedFpsEl) smoothedFpsEl.textContent = formatNumber(smoothedFps);
    if (frameTimeEl) frameTimeEl.textContent = formatNumber(frameTimeMs, 2);
    if (averageFrameTimeEl) averageFrameTimeEl.textContent = formatNumber(history.average(), 2);
    if (cameraDistanceEl) cameraDistanceEl.textContent = formatNumber(cameraDistance, 2);
    if (drawCallsEl) drawCallsEl.textContent = formatCount(rendererStats.drawCalls);
    if (trianglesEl) trianglesEl.textContent = formatCount(rendererStats.triangles);
    if (pointsEl) pointsEl.textContent = formatCount(rendererStats.points);
    drawGraph();
  }

  function resetSamples(timestamp = null) {
    history.clear();
    previousTimestamp = timestamp;
    lastDisplayTimestamp = timestamp ?? -Infinity;
    currentFps = 0;
    smoothedFps = 0;
    frameTimeMs = 0;
  }

  setOverlayVisibility(false);

  return {
    get enabled() {
      return enabled;
    },
    getSnapshot() {
      return {
        currentFps,
        smoothedFps,
        frameTimeMs,
        cameraDistance,
        averageFrameTimeMs: history.average(),
        sampleCount: history.size,
        rendererStats: { ...rendererStats }
      };
    },
    setEnabled(nextEnabled) {
      enabled = Boolean(nextEnabled);
      resetSamples();
      cameraDistance = null;
      setOverlayVisibility(enabled);
      if (enabled) updateDisplay(null);
      return enabled;
    },
    update(timestamp, renderer, nextCameraDistance = null) {
      if (!enabled || !Number.isFinite(timestamp)) return;
      cameraDistance = Number.isFinite(nextCameraDistance) ? nextCameraDistance : null;
      if (previousTimestamp === null) {
        previousTimestamp = timestamp;
        return;
      }

      const deltaMs = timestamp - previousTimestamp;
      previousTimestamp = timestamp;
      const validDelta = normalizeFrameDelta(deltaMs, defaults.maxFrameGapMs);
      if (validDelta === null) {
        resetSamples(timestamp);
        updateDisplay(renderer);
        return;
      }

      frameTimeMs = validDelta;
      currentFps = 1000 / validDelta;
      smoothedFps = smoothValue(smoothedFps || null, currentFps, defaults.smoothingAlpha);
      history.add(validDelta);
      if (timestamp - lastDisplayTimestamp >= defaults.displayIntervalMs) {
        lastDisplayTimestamp = timestamp;
        updateDisplay(renderer);
      }
    },
    resize() {
      if (!graphCanvas) return;
      const devicePixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
      const width = graphCanvas.clientWidth || graphCanvas.width;
      const height = graphCanvas.clientHeight || graphCanvas.height;
      if (width > 0 && height > 0) {
        graphCanvas.width = Math.round(width * devicePixelRatio);
        graphCanvas.height = Math.round(height * devicePixelRatio);
      }
      if (enabled) drawGraph();
    },
    dispose() {
      enabled = false;
      resetSamples();
      setOverlayVisibility(false);
    }
  };
}
