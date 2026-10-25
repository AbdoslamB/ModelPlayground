/**
 * Recurrent Neural Network math. Pure functions: no DOM, no state. Every
 * number the learner sees comes from here. The network was trained offline
 * (python/recurrent_neural_network.py); the page only runs it forward, and
 * math.test.ts checks every hidden state and probability against the
 * script's results for the same rounded weights.
 */

export interface Weights {
  /** Input weights: one column per character of the alphabet. */
  Wx: number[][];
  /** Recurrent weights: from the last hidden state to the new one. */
  Wh: number[][];
  b: number[];
  /** Output weights: from the hidden state to one score per character. */
  Wy: number[][];
  c: number[];
}

export interface Step {
  /** The character read at this step, and its place in the alphabet. */
  char: string;
  index: number;
  /** hₜ: the network's memory after reading this character. */
  hidden: number[];
  /** zₜ: one score per character of the alphabet, for the next character. */
  logits: number[];
}

/** One step: hₜ = tanh(Wₓ xₜ + Wₕ hₜ₋₁ + b), zₜ = W_y hₜ + c. */
export function step(
  W: Weights,
  index: number,
  previous: readonly number[],
): {
  hidden: number[];
  logits: number[];
} {
  const hidden = W.b.map((bias, r) =>
    Math.tanh(
      W.Wx[r][index] +
        W.Wh[r].reduce((t, w, k) => t + w * previous[k], 0) +
        bias,
    ),
  );
  const logits = W.c.map(
    (bias, r) => W.Wy[r].reduce((t, w, k) => t + w * hidden[k], 0) + bias,
  );
  return { hidden, logits };
}

/** Reads a list of character indexes from an empty memory. */
export function run(
  W: Weights,
  alphabet: string,
  indexes: readonly number[],
): Step[] {
  let previous = W.b.map(() => 0);
  return indexes.map((index) => {
    const out = step(W, index, previous);
    previous = out.hidden;
    return { char: alphabet[index], index, ...out };
  });
}

/**
 * Splits text into what the network can read: lower-cased characters of its
 * alphabet, at most `limit` of them. Other characters are skipped.
 */
export function encode(
  text: string,
  alphabet: string,
  limit = Infinity,
): { indexes: number[]; skipped: string[] } {
  const indexes: number[] = [];
  const skipped: string[] = [];
  for (const char of text.toLowerCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) skipped.push(char);
    else if (indexes.length < limit) indexes.push(index);
  }
  return { indexes, skipped };
}

/**
 * softmax(z / T): scores turned into chances that add up to 1. A low
 * temperature T sharpens them towards the top score; a high one flattens them.
 */
export function softmax(logits: readonly number[], temperature = 1): number[] {
  const top = Math.max(...logits);
  const e = logits.map((z) => Math.exp((z - top) / temperature));
  const total = e.reduce((t, v) => t + v, 0);
  return e.map((v) => v / total);
}

/** The k most likely characters, most likely first (ties by alphabet order). */
export function top(
  probabilities: readonly number[],
  alphabet: string,
  k: number,
): { char: string; index: number; p: number }[] {
  return probabilities
    .map((p, index) => ({ char: alphabet[index], index, p }))
    .sort((a, b) => b.p - a.p || a.index - b.index)
    .slice(0, k);
}

/** Surprise in bits: −log₂ p. 0 for a sure thing, 1 for a coin toss. */
export function surprise(p: number): number {
  return -Math.log2(p);
}

/** Picks a character at random, each as likely as its probability. */
export function sample(
  probabilities: readonly number[],
  random: number,
): number {
  let total = 0;
  for (let i = 0; i < probabilities.length; i++) {
    total += probabilities[i];
    if (random < total) return i;
  }
  return probabilities.length - 1;
}
