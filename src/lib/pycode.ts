/**
 * Writing the Lab's values into Python source: numbers without trailing
 * zeros (and never "−"), lists of them, and quoted text.
 */

/** A Python number literal, to at most `digits` decimals. */
export function pyNumber(value: number, digits = 6): string {
  const rounded = Number(value.toFixed(digits));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** A Python list of numbers. */
export function pyList(values: readonly number[], digits = 6): string {
  return `[${values.map((v) => pyNumber(v, digits)).join(', ')}]`;
}

/** A Python string literal (JSON's escapes are valid Python). */
export function pyString(text: string): string {
  return JSON.stringify(text);
}
