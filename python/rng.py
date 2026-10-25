"""mulberry32, the seeded random number generator in src/lib/rng.ts.

The same seed gives the same numbers in Python and on the page, so random
models (bootstrap samples, random features) can be checked against fixtures.
"""

from __future__ import annotations

from collections.abc import Callable

MASK = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    """32-bit multiply, as JavaScript's Math.imul (result as unsigned)."""
    return (a * b) & MASK


def mulberry32(seed: int) -> Callable[[], float]:
    state = seed & MASK

    def next_value() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & MASK
        a = state
        t = _imul(a ^ (a >> 15), 1 | a)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & MASK) ^ t
        return ((t ^ (t >> 14)) & MASK) / 4294967296

    return next_value
