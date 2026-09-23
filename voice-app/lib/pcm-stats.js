/**
 * PCM audio statistics (dependency-free).
 *
 * Extracted from audio-fork.js so it can be unit-tested without loading ws.
 * Computes RMS, peak, and near-zero ratio over a 16-bit PCM buffer.
 */

function pcmStats(buf, endian = 'LE') {
  const sampleCount = Math.floor(buf.length / 2);
  if (sampleCount <= 0) {
    return { sampleCount: 0, rms: 0, maxAbs: 0, nearZeroRatio: 1 };
  }

  let sumSquares = 0;
  let maxAbs = 0;
  let nearZero = 0;
  const read = endian === 'BE' ? Buffer.prototype.readInt16BE : Buffer.prototype.readInt16LE;

  for (let i = 0; i < sampleCount; i++) {
    const sample = read.call(buf, i * 2);
    const abs = Math.abs(sample);
    sumSquares += abs * abs;
    if (abs > maxAbs) maxAbs = abs;
    if (abs < 200) nearZero++;
  }

  const rms = Math.sqrt(sumSquares / sampleCount);
  return { sampleCount, rms, maxAbs, nearZeroRatio: nearZero / sampleCount };
}

module.exports = { pcmStats };
