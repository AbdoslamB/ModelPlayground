<!--
  Gridlines, axis lines, tick labels and axis titles for a 2D chart. Shared by
  every model's graph; place it first inside the <svg>, under the data.
-->
<svelte:options namespace="svg" />

<script lang="ts">
  import type { LinearScale } from '../lib/scales';

  import { formatNumber } from '../lib/format';

  interface Props {
    x: LinearScale;
    y: LinearScale;
    xTicks: number[];
    yTicks: number[];
    plot: { x: number; y: number; width: number; height: number };
    /** Full SVG height, for placing the x-axis title. */
    height: number;
    margin: { top: number; left: number };
    xTitle: string;
    yTitle: string;
    /** Where the horizontal axis line sits, in data units (default: bottom). */
    xAxisAt?: number;
    /** Phones: tighter label offsets and smaller text. */
    narrow?: boolean;
    decimals?: number;
  }

  let {
    x,
    y,
    xTicks,
    yTicks,
    plot,
    height,
    margin,
    xTitle,
    yTitle,
    xAxisAt,
    narrow = false,
    decimals = 0,
  }: Props = $props();

  const axisY = $derived(y(xAxisAt ?? y.domain[0]));
</script>

<g class="grid" aria-hidden="true">
  {#each xTicks as tick (tick)}
    <line x1={x(tick)} x2={x(tick)} y1={plot.y} y2={plot.y + plot.height} />
  {/each}
  {#each yTicks as tick (tick)}
    <line x1={plot.x} x2={plot.x + plot.width} y1={y(tick)} y2={y(tick)} />
  {/each}
</g>
<g class="axis" class:axis--narrow={narrow} aria-hidden="true">
  <line
    class="axis__line"
    x1={plot.x}
    x2={plot.x + plot.width}
    y1={axisY}
    y2={axisY}
  />
  <line
    class="axis__line"
    x1={plot.x}
    x2={plot.x}
    y1={plot.y}
    y2={plot.y + plot.height}
  />
  {#each xTicks as tick (tick)}
    <text
      class="axis__tick num"
      x={x(tick)}
      y={plot.y + plot.height + (narrow ? 15 : 18)}
      text-anchor="middle"
    >
      {formatNumber(tick, decimals)}
    </text>
  {/each}
  {#each yTicks as tick (tick)}
    <text
      class="axis__tick num"
      x={plot.x - 8}
      y={y(tick) + 4}
      text-anchor="end"
    >
      {formatNumber(tick, decimals)}
    </text>
  {/each}
  <text
    class="axis__title"
    x={plot.x + plot.width / 2}
    y={height - (narrow ? 6 : 10)}
    text-anchor="middle"
  >
    {xTitle}
  </text>
  <text class="axis__title" x={plot.x - margin.left + 6} y={margin.top - 14}>
    {yTitle}
  </text>
</g>

<style>
  .grid line {
    stroke: var(--c-grid);
    stroke-width: 1;
  }

  .axis__line {
    stroke: var(--c-control-edge);
    stroke-width: 1;
  }

  .axis__tick {
    fill: var(--c-muted);
    font-size: 12px;
  }

  .axis__title {
    fill: var(--c-muted);
    font-size: 13px;
    font-weight: 600;
  }

  .axis--narrow .axis__tick {
    font-size: 11px;
  }

  .axis--narrow .axis__title {
    font-size: 12px;
  }
</style>
