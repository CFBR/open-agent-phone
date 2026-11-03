/**
 * Minimal Prometheus-style metrics registry.
 *
 * The voice app runs one process per container, so in-memory counters are
 * enough. Names are rendered with stable label ordering so scrapes diff
 * cleanly.
 */

const counters = new Map();
const gauges = new Map();

function escapeLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatLabels(labels = {}) {
  const entries = Object.entries(labels)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return '';
  return `{${entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(',')}}`;
}

function keyFor(name, labels) {
  return `${name}${formatLabels(labels)}`;
}

function inc(name, value = 1, labels = {}) {
  const key = keyFor(name, labels);
  counters.set(key, (counters.get(key) || 0) + value);
}

function set(name, value, labels = {}) {
  gauges.set(keyFor(name, labels), value);
}

function get(name, labels = {}) {
  return gauges.get(keyFor(name, labels)) || 0;
}

function incGauge(name, value = 1, labels = {}) {
  set(name, get(name, labels) + value, labels);
}

function decGauge(name, value = 1, labels = {}) {
  incGauge(name, -value, labels);
}

function render() {
  const lines = [];
  for (const [key, value] of [...counters.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`${key} ${value}`);
  }
  for (const [key, value] of [...gauges.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`${key} ${value}`);
  }
  return lines.length ? `${lines.join('\n')}\n` : '';
}

function snapshot() {
  return {
    counters: Object.fromEntries(counters),
    gauges: Object.fromEntries(gauges),
  };
}

function reset() {
  counters.clear();
  gauges.clear();
}

module.exports = {
  inc,
  set,
  get,
  incGauge,
  decGauge,
  render,
  snapshot,
  reset,
  formatLabels,
};
