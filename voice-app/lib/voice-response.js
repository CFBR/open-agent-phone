/**
 * Voice response helpers (shared across inbound, outbound, and query paths).
 *
 * Previously these were copy-pasted across conversation-loop.js, sip-handler.js,
 * and query-routes.js. This module is the single source of truth.
 */

const logger = require('./logger');

// Claude Code-style thinking phrases spoken while processing a turn
const THINKING_PHRASES = [
  'Pondering...',
  'Elucidating...',
  'Cogitating...',
  'Ruminating...',
  'Contemplating...',
  'Consulting the oracle...',
  'Summoning knowledge...',
  'Engaging neural pathways...',
  'Accessing the mainframe...',
  'Querying the void...',
  'Let me think about that...',
  'Processing...',
  'Hmm, interesting question...',
  'One moment...',
  'Searching my brain...',
];

function getRandomThinkingPhrase() {
  return THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)];
}

/**
 * Detect a goodbye / hang-up intent in a transcript.
 */
function isGoodbye(transcript) {
  const lower = (transcript || '').toLowerCase().trim();
  const goodbyePhrases = ['goodbye', 'good bye', 'bye', 'hang up', 'end call', "that's all", 'thats all'];
  return goodbyePhrases.some(phrase => {
    return lower === phrase || lower.includes(` ${phrase}`) ||
           lower.startsWith(`${phrase} `) || lower.endsWith(` ${phrase}`);
  });
}

/**
 * Clean markdown and formatting from text so it speaks naturally via TTS.
 */
function cleanForSpeech(text) {
  return text
    .replace(/\*+/g, '')                      // bold/italic markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [text](url) -> text
    .replace(/\[([^\]]+)\]/g, '$1')           // remaining [bracketed] text
    .trim();
}

/**
 * Extract a voice-friendly line from Claude's response.
 * Priority: VOICE_RESPONSE > CUSTOM COMPLETED > COMPLETED > first sentence > truncate
 */
function extractVoiceLine(response) {
  response = String(response || '');

  // Priority 1: VOICE_RESPONSE (voice-optimized content)
  const voiceMatch = response.match(/🗣️\s*VOICE_RESPONSE:\s*([^\n]+)/im);
  if (voiceMatch) {
    const text = cleanForSpeech(voiceMatch[1]);
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    if (text && wordCount <= 60) {
      return text;
    }
    logger.warn('VOICE_RESPONSE too long, falling back', { wordCount, maxWords: 60 });
  }

  // Priority 2: legacy CUSTOM COMPLETED
  const customMatch = response.match(/🗣️\s*CUSTOM\s+COMPLETED:\s*(.+?)(?:\n|$)/im);
  if (customMatch) {
    const text = cleanForSpeech(customMatch[1]);
    if (text && text.split(/\s+/).length <= 50) {
      return text;
    }
  }

  // Priority 3: standard COMPLETED
  const completedMatch = response.match(/🎯\s*COMPLETED:\s*(.+?)(?:\n|$)/im);
  if (completedMatch) {
    return cleanForSpeech(completedMatch[1]);
  }

  // Priority 4: first sentence
  const firstSentence = response.split(/[.!?]/)[0];
  if (firstSentence && firstSentence.trim().length > 0 && firstSentence.length < 500) {
    return firstSentence.trim();
  }

  // Last resort: truncate
  return response.substring(0, 500).trim();
}

module.exports = {
  THINKING_PHRASES,
  getRandomThinkingPhrase,
  isGoodbye,
  cleanForSpeech,
  extractVoiceLine,
};
