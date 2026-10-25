/**
 * A small seeded random number generator (mulberry32). The same seed always
 * gives the same numbers, here and in the Python data scripts, so random
 * models can be checked against fixtures.
 */
export function mulberry32(seed: number): () => number {
  return resumable(seed).random;
}

/**
 * The same generator, with its inner state readable, so a long random run
 * can be saved part-way and carried on later from exactly the same place.
 */
export function resumable(state: number): {
  random: () => number;
  state: () => number;
} {
  let a = state | 0;
  return {
    random: () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => a,
  };
}
