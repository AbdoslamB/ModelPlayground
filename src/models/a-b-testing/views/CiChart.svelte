<!--
  Step 6: the test's interval as one bar, with its point estimate, against a
  solid line at 0 (no effect) and a dashed line at the MDE. Where the bar
  sits decides the case (see step 7).
-->
<script lang="ts">
  import type { Result } from '../math';

  import { formatNumber } from '../../../lib/format';
  import { scaleLinear } from '../../../lib/scales';
  import { mdeText, percent } from '../math';

  interface Props {
    result: Result;
    mde: number;
    /** The axis range, as fractions. */
    range: [number, number];
    confidence: number;
  }

  let { result, mde, range, confidence }: Props = $props();

  const width = 600;
  const height = 120;
  const x = $derived(scaleLinear([range[0] * 100, range[1] * 100], [30, 570]));
  const ticks = $derived(x.ticks(8));
  const lo = $derived(x(result.lo * 100));
  const hi = $derived(x(result.hi * 100));
</script>

<svg
  class="ci"
  viewBox={`0 0 ${width} ${height}`}
  role="img"
  aria-label={`The ${confidence}% interval runs from ${percent(result.lo)} to ${percent(result.hi)}, against 0 and the ${mdeText(mde)} MDE.`}
>
  {#each ticks as tick (tick)}
    <line class="grid" x1={x(tick)} x2={x(tick)} y1="20" y2="86"></line>
    <text class="tick num" x={x(tick)} y="104" text-anchor="middle"
      >{formatNumber(tick, 0)}%</text
    >
  {/each}
  <line class="zero" x1={x(0)} x2={x(0)} y1="14" y2="92"></line>
  <text class="label" x={x(0)} y="10" text-anchor="middle">no effect</text>
  <line class="mde" x1={x(mde * 100)} x2={x(mde * 100)} y1="14" y2="92"></line>
  <text class="label label--mde" x={x(mde * 100)} y="10" text-anchor="middle"
    >MDE {mdeText(mde)}</text
  >
  <line class="bar" x1={lo} x2={hi} y1="54" y2="54"></line>
  <line class="cap" x1={lo} x2={lo} y1="44" y2="64"></line>
  <line class="cap" x1={hi} x2={hi} y1="44" y2="64"></line>
  <circle class="point" cx={x(result.lift * 100)} cy="54" r="6"></circle>
  <text class="value num" x={lo} y="36" text-anchor="middle"
    >{percent(result.lo)}</text
  >
  <text class="value num" x={hi} y="36" text-anchor="middle"
    >{percent(result.hi)}</text
  >
  <text class="axis" x="300" y="118" text-anchor="middle"
    >Lift (% of control)</text
  >
</svg>

<style>
  .ci {
    display: block;
    width: 100%;
    height: auto;
  }

  .grid {
    stroke: var(--c-grid);
  }

  .tick,
  .axis {
    fill: var(--c-muted);
    font-size: 12px;
  }

  .zero {
    stroke: var(--c-text);
    stroke-width: 1.5;
  }

  .mde {
    stroke: var(--c-a);
    stroke-width: 2.5;
    stroke-dasharray: 7 5;
  }

  .label {
    fill: var(--c-muted);
    font-size: 12px;
    font-weight: 600;
  }

  .label--mde {
    fill: var(--c-a-ink);
  }

  .bar {
    stroke: var(--c-line);
    stroke-width: 8;
    stroke-linecap: round;
    transition:
      x1 var(--dur-ui),
      x2 var(--dur-ui);
  }

  .cap {
    stroke: var(--c-line);
    stroke-width: 2.5;
  }

  .point {
    fill: var(--c-bg);
    stroke: var(--c-text);
    stroke-width: 2.5;
  }

  .value {
    fill: var(--c-line-ink);
    font-size: 12px;
    font-weight: 700;
  }
</style>
