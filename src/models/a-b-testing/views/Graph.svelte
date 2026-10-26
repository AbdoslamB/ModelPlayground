<!--
  The A/B Testing graph. Above: the lift so far after each day (the line and
  its dots), with its 95% interval as a band, a solid line at 0 (no effect)
  and a dashed line at the MDE. Drag the today handle to move through the
  test, or the MDE line to change the plan. Below: the p-value each day, on a
  log scale, with a line at α: peeking shows as dots that dip under it and
  come back. "Many tests" adds 20 simulated A/A tests and their 95% funnel.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { AbLab } from '../store.svelte';

  import Axes from '../../../charts/Axes.svelte';
  import { formatNumber } from '../../../lib/format';
  import { scaleLinear } from '../../../lib/scales';
  import { designSe, mdeText } from '../math';

  let { lab }: { lab: AbLab } = $props();

  let frame: HTMLDivElement | undefined = $state();
  let svg: SVGSVGElement | undefined = $state();
  let width = $state(640);
  let focused = $state(false);
  let dragging = $state<'day' | 'mde' | null>(null);

  const narrow = $derived(width < 520);
  const margin = $derived({
    top: 34,
    right: narrow ? 50 : 66,
    left: narrow ? 40 : 48,
  });
  const mainH = $derived(narrow ? 190 : 230);
  const plot = $derived({
    x: margin.left,
    y: margin.top,
    width: width - margin.left - margin.right,
    height: mainH,
  });
  const stripTop = $derived(plot.y + plot.height + 58);
  const stripH = 70;
  const height = $derived(stripTop + stripH + 34);

  const days = $derived(lab.lastDay);
  const x = $derived(
    scaleLinear([0.5, days + 0.5], [plot.x, plot.x + plot.width]),
  );
  const y = $derived(
    scaleLinear(
      [lab.range[0] * 100, lab.range[1] * 100],
      [plot.y + plot.height, plot.y],
    ),
  );
  const xTicks = $derived(
    narrow ? [1, 7, days] : Array.from({ length: days }, (_, i) => i + 1),
  );
  const yTicks = $derived(y.ticks(narrow ? 5 : 7));

  /** The p strip: p = 1 at the top, 0.0001 (or less) at the bottom. */
  const py = (p: number) =>
    stripTop + (Math.min(4, -Math.log10(Math.max(p, 1e-4))) / 4) * stripH;

  const sofar = $derived(lab.daily.slice(0, lab.today));
  const line = (points: [number, number][]) =>
    points.map(([px, v], i) => `${i === 0 ? 'M' : 'L'}${px},${v}`).join('');
  const liftLine = $derived(
    line(sofar.map((r, i) => [x(i + 1), y(r.lift * 100)])),
  );
  const band = $derived(
    sofar.length > 1
      ? `${line(sofar.map((r, i) => [x(i + 1), y(r.hi * 100)]))}${sofar
          .map((r, i) => [x(i + 1), y(r.lo * 100)] as [number, number])
          .reverse()
          .map(([px, v]) => `L${px},${v}`)
          .join('')}Z`
      : '',
  );
  const pLine = $derived(line(sofar.map((r, i) => [x(i + 1), py(r.p)])));

  // "Many tests": A/A paths, as lifts at the test's planned size.
  const se = (day: number) =>
    designSe(
      day,
      lab.perGroupPerDay,
      lab.dataset.history.mean,
      lab.dataset.history.sd,
    ) * 100;
  const crit = $derived(lab.result?.crit ?? 1.96);
  const funnel = $derived(
    Array.from({ length: days }, (_, i) => i + 1).map(
      (d) => [x(d), y(crit * se(d))] as [number, number],
    ),
  );
  const funnelLow = $derived(
    Array.from({ length: days }, (_, i) => i + 1).map(
      (d) => [x(d), y(-crit * se(d))] as [number, number],
    ),
  );
  const aaPaths = $derived(
    lab.many
      ? lab.runs.paths.map((path) =>
          line(path.map((z, i) => [x(i + 1), y(z * se(i + 1))])),
        )
      : [],
  );

  const todayX = $derived(x(lab.today));
  const mdeY = $derived(y(lab.mde));
  const selected = $derived(lab.selectedDay);

  onMount(() => {
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width = Math.max(280, Math.round(entry.contentRect.width));
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  });

  function local(event: PointerEvent): { px: number; py: number } {
    const box = svg?.getBoundingClientRect();
    if (!box) return { px: 0, py: 0 };
    return {
      px: ((event.clientX - box.left) / box.width) * width,
      py: ((event.clientY - box.top) / box.height) * height,
    };
  }

  function startDrag(event: PointerEvent, what: 'day' | 'mde') {
    event.preventDefault();
    dragging = what;
    svg?.setPointerCapture(event.pointerId);
    moveDrag(event);
  }

  function moveDrag(event: PointerEvent) {
    if (!dragging) return;
    const { px, py: at } = local(event);
    if (dragging === 'day') lab.setDay(x.invert(px));
    else lab.set('mde', y.invert(at));
  }

  function endDrag(event: PointerEvent) {
    if (!dragging) return;
    dragging = null;
    if (svg?.hasPointerCapture(event.pointerId))
      svg.releasePointerCapture(event.pointerId);
  }

  function dayAt(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    return id ? Number(id) : null;
  }

  // Keyboard on the days: ←/→ walk through the days so far, Esc clears.
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      lab.select(null);
      return;
    }
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!direction) return;
    event.preventDefault();
    const next =
      selected === null
        ? 1
        : Math.min(lab.today, Math.max(1, selected + direction));
    lab.select({ kind: 'item', id: next, source: 'graph' });
  }
</script>

<div
  class="graph"
  role="group"
  aria-label="The lift so far after each day of the test, with its 95% interval, the MDE, and the p-value each day"
  data-view="graph"
>
  <div class="graph__frame" bind:this={frame} style:height={`${height}px`}>
    <svg
      bind:this={svg}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      {height}
      class:is-dragging={dragging !== null}
      onpointermove={moveDrag}
      onpointerup={endDrag}
      onpointercancel={endDrag}
    >
      <defs>
        <clipPath id="ab-plot">
          <rect x={plot.x} y={plot.y} width={plot.width} height={plot.height}
          ></rect>
        </clipPath>
      </defs>

      <Axes
        {x}
        {y}
        {xTicks}
        {yTicks}
        {plot}
        {height}
        {margin}
        {narrow}
        xTitle="Day of the test"
        yTitle="Lift so far (% of control)"
        xAxisAt={y.domain[0]}
      />

      <g clip-path="url(#ab-plot)" aria-hidden="true">
        {#if lab.end < days}
          <rect
            class="after"
            x={x(lab.end + 0.5)}
            y={plot.y}
            width={plot.x + plot.width - x(lab.end + 0.5)}
            height={plot.height}
          ></rect>
          <text class="after__label" x={x(lab.end + 0.5) + 6} y={plot.y + 16}
            >after the plan</text
          >
        {/if}

        {#if lab.many}
          <path class="funnel" d={line(funnel)}></path>
          <path class="funnel" d={line(funnelLow)}></path>
          {#each aaPaths as d, i (i)}
            <path class="aa" {d}></path>
          {/each}
        {/if}

        {#if band}
          <path class="band" d={band}></path>
        {/if}
        <line
          class="zero"
          x1={plot.x}
          x2={plot.x + plot.width}
          y1={y(0)}
          y2={y(0)}
        ></line>
        <line
          class="mde"
          x1={plot.x}
          x2={plot.x + plot.width}
          y1={mdeY}
          y2={mdeY}
        ></line>
        <path class="lift" d={liftLine}></path>
        {#if lab.result}
          <g class="whisker">
            <line
              x1={todayX}
              x2={todayX}
              y1={y(lab.result.lo * 100)}
              y2={y(lab.result.hi * 100)}
            ></line>
            <line
              x1={todayX - 6}
              x2={todayX + 6}
              y1={y(lab.result.lo * 100)}
              y2={y(lab.result.lo * 100)}
            ></line>
            <line
              x1={todayX - 6}
              x2={todayX + 6}
              y1={y(lab.result.hi * 100)}
              y2={y(lab.result.hi * 100)}
            ></line>
          </g>
        {/if}
      </g>

      <!-- Labels outside the plot, at the right -->
      <g class="labels" aria-hidden="true">
        <text class="mde__label" x={plot.x + plot.width + 6} y={mdeY + 4}
          >MDE {mdeText(lab.mdeFraction)}</text
        >
        <text class="zero__label" x={plot.x + plot.width + 6} y={y(0) + 4}
          >none</text
        >
      </g>

      <!-- The MDE line can be dragged up and down -->
      <line
        class="mde__hit"
        role="presentation"
        x1={plot.x}
        x2={plot.x + plot.width + margin.right}
        y1={mdeY}
        y2={mdeY}
        onpointerdown={(event) => {
          startDrag(event, 'mde');
        }}
      ></line>

      <!-- The today handle can be dragged left and right -->
      <g
        class="today"
        role="presentation"
        onpointerdown={(event) => {
          startDrag(event, 'day');
        }}
      >
        <rect
          class="today__hit"
          x={todayX - 12}
          y={plot.y - 24}
          width="24"
          height={plot.height + 24}
        ></rect>
        <line
          class="today__line"
          x1={todayX}
          x2={todayX}
          y1={plot.y - 8}
          y2={plot.y + plot.height}
        ></line>
        <rect
          class="today__knob"
          x={todayX - 22}
          y={plot.y - 26}
          width="44"
          height="18"
          rx="9"
        ></rect>
        <text
          class="today__text"
          x={todayX}
          y={plot.y - 13}
          text-anchor="middle">day {lab.today}</text
        >
      </g>

      <!-- The days so far: one tab stop, arrow keys walk through them -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <g
        class="days"
        role="group"
        aria-label={`The lift after each of the ${lab.today} days so far. Use the left and right arrow keys to move between days.`}
        tabindex="0"
        onkeydown={onKey}
        onfocus={() => {
          focused = true;
        }}
        onblur={() => {
          focused = false;
        }}
        onpointerover={(event) => {
          const id = dayAt(event);
          if (id !== null && event.pointerType === 'mouse') {
            lab.select({ kind: 'item', id, source: 'graph' });
          }
        }}
        onpointerout={(event) => {
          const id = dayAt(event);
          if (id !== null && event.pointerType === 'mouse')
            lab.release('item', id);
        }}
        onclick={(event) => {
          const id = dayAt(event);
          if (id === null) return;
          if (selected === id && event.pointerType !== 'mouse')
            lab.select(null);
          else lab.select({ kind: 'item', id, source: 'graph' });
        }}
      >
        {#if focused}
          <rect
            class="days__focus"
            x={plot.x + 2}
            y={plot.y + 2}
            width={Math.max(0, x(lab.today + 0.5) - plot.x - 4)}
            height={plot.height - 4}
            rx="6"
          ></rect>
        {/if}
        {#each sofar as r, i (i)}
          <g
            class="dot"
            data-id={i + 1}
            data-selected={selected === i + 1 ? '' : undefined}
          >
            <circle class="dot__hit" cx={x(i + 1)} cy={y(r.lift * 100)} r="12"
            ></circle>
            <circle class="dot__mark" cx={x(i + 1)} cy={y(r.lift * 100)} r="4"
            ></circle>
          </g>
        {/each}
      </g>

      <!-- The p-value each day -->
      <g class="strip" aria-hidden="true">
        <text class="strip__title" x={plot.x} y={stripTop - 12}
          >p-value each day (lower: stronger evidence)</text
        >
        <rect
          class="strip__frame"
          x={plot.x}
          y={stripTop}
          width={plot.width}
          height={stripH}
        ></rect>
        {#each [1, 0.01, 0.0001] as tick (tick)}
          <text class="strip__tick num" x={plot.x - 6} y={py(tick) + 4}
            >{formatNumber(tick, tick === 1 ? 0 : tick === 0.01 ? 2 : 4)}</text
          >
        {/each}
        <line
          class="alpha"
          x1={plot.x}
          x2={plot.x + plot.width}
          y1={py(lab.alpha)}
          y2={py(lab.alpha)}
        ></line>
        <text
          class="alpha__label"
          x={plot.x + plot.width + 6}
          y={py(lab.alpha) + 4}>α {formatNumber(lab.alpha, 2)}</text
        >
        <path class="p" d={pLine}></path>
        {#each sofar as r, i (i)}
          <circle
            class="p__dot"
            class:p__dot--low={r.p < lab.alpha}
            class:p__dot--selected={selected === i + 1}
            cx={x(i + 1)}
            cy={py(r.p)}
            r={selected === i + 1 ? 5 : 3.5}
          ></circle>
        {/each}
      </g>
    </svg>
  </div>
</div>

<style>
  .graph {
    width: 100%;
  }

  .graph__frame {
    position: relative;
    user-select: none;
    touch-action: pan-y;
  }

  svg {
    position: absolute;
    inset: 0;
    overflow: visible;
  }

  svg.is-dragging {
    cursor: grabbing;
  }

  .after {
    fill: var(--c-surface-sunken);
  }

  .after__label {
    fill: var(--c-muted);
    font-size: 12px;
  }

  .band {
    fill: color-mix(in srgb, var(--c-line) 18%, transparent);
    stroke: color-mix(in srgb, var(--c-line) 45%, transparent);
    stroke-width: 1;
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

  :global(.lab[data-highlight='mde']) .mde {
    stroke-width: 4.5;
  }

  .mde__hit {
    stroke: transparent;
    stroke-width: 18;
    cursor: ns-resize;
    touch-action: none;
  }

  .labels text {
    font-size: 12px;
    font-weight: 600;
  }

  .mde__label {
    fill: var(--c-a-ink);
  }

  .zero__label {
    fill: var(--c-muted);
  }

  .lift {
    fill: none;
    stroke: var(--c-line);
    stroke-width: 2.5;
    stroke-linejoin: round;
  }

  .whisker line {
    stroke: var(--c-line);
    stroke-width: 3;
    stroke-linecap: round;
  }

  .funnel {
    fill: none;
    stroke: var(--c-muted);
    stroke-width: 1.5;
    stroke-dasharray: 3 4;
  }

  .aa {
    fill: none;
    stroke: var(--c-muted);
    stroke-width: 1;
    opacity: 0.55;
  }

  .today {
    cursor: ew-resize;
    touch-action: none;
  }

  .today__hit {
    fill: transparent;
  }

  .today__line {
    stroke: var(--c-text);
    stroke-width: 1.5;
    stroke-dasharray: 2 3;
  }

  :global(.lab[data-highlight='day']) .today__line {
    stroke-width: 3;
    stroke-dasharray: none;
  }

  .today__knob {
    fill: var(--c-text);
  }

  .today__text {
    fill: var(--c-bg);
    font-size: 11px;
    font-weight: 700;
  }

  .days {
    outline: none;
  }

  .days__focus {
    fill: none;
    stroke: var(--c-focus);
    stroke-width: 2;
    stroke-dasharray: 6 4;
  }

  .dot {
    cursor: pointer;
  }

  .dot__hit {
    fill: transparent;
  }

  .dot__mark {
    fill: var(--c-line);
    stroke: var(--c-bg);
    stroke-width: 1.5;
  }

  .dot[data-selected] .dot__mark {
    r: 7px;
    fill: var(--c-bg);
    stroke: var(--c-text);
    stroke-width: 3;
  }

  .strip__title {
    fill: var(--c-muted);
    font-size: 13px;
    font-weight: 600;
  }

  .strip__frame {
    fill: none;
    stroke: var(--c-hairline);
  }

  .strip__tick {
    fill: var(--c-muted);
    font-size: 11px;
    text-anchor: end;
  }

  .alpha {
    stroke: var(--c-error);
    stroke-width: 1.5;
    stroke-dasharray: 5 4;
  }

  :global(.lab[data-highlight='alpha']) .alpha {
    stroke-width: 3.5;
  }

  .alpha__label {
    fill: var(--c-error-ink);
    font-size: 12px;
    font-weight: 600;
  }

  .p {
    fill: none;
    stroke: var(--c-muted);
    stroke-width: 1.5;
  }

  .p__dot {
    fill: var(--c-bg);
    stroke: var(--c-muted);
    stroke-width: 1.5;
  }

  /* Under α: filled, so the dip shows by shape as well as color. */
  .p__dot--low {
    fill: var(--c-error);
    stroke: var(--c-error);
  }

  .p__dot--selected {
    stroke: var(--c-text);
    stroke-width: 2.5;
  }
</style>
