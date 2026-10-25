<!--
  The k-NN graph: the known fruits (apples as circles, pears as triangles), the
  new fruit as a diamond in the colour of its prediction, lines to its k
  nearest fruits, and a dashed circle around them. On request, the areas each
  kind of fruit would win are shaded. Both axes use the same scale (the plot
  is square), so distances on screen are true distances.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { KnnLab } from '../store.svelte';

  import Axes from '../../../charts/Axes.svelte';
  import { formatNumber } from '../../../lib/format';
  import { oncePerFrame } from '../../../lib/raf';
  import { scaleLinear } from '../../../lib/scales';
  import { readFlag, writeFlag } from '../../../lib/storage';
  import { AREA_GRID } from '../store.svelte';

  let { lab }: { lab: KnnLab } = $props();

  let frame: HTMLDivElement | undefined = $state();
  let svg: SVGSVGElement | undefined = $state();
  let width = $state(560);
  let height = $state(560);
  let hintSeen = $state(true);
  let pointsFocused = $state(false);
  let summary = $state('');

  const narrow = $derived(width < 480);
  // Equal left+right and top+bottom margins keep the plot square, so 1 cm
  // is as long across as it is up.
  const margin = $derived(
    narrow
      ? { top: 28, right: 30, bottom: 40, left: 38 }
      : { top: 34, right: 32, bottom: 50, left: 52 },
  );
  const axes = $derived(lab.dataset.axes);
  const x = $derived(scaleLinear(axes.x, [margin.left, width - margin.right]));
  const y = $derived(scaleLinear(axes.y, [height - margin.bottom, margin.top]));
  const pxPerUnit = $derived(
    (width - margin.left - margin.right) / (axes.x[1] - axes.x[0]),
  );
  const xTicks = $derived(x.ticks(axes.x[1] - axes.x[0]));
  const yTicks = $derived(y.ticks(axes.y[1] - axes.y[0]));
  const plot = $derived({
    x: margin.left,
    y: margin.top,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  });
  const xCol = $derived(lab.xColumn);
  const yCol = $derived(lab.yColumn);
  const selectedId = $derived(lab.selectedRow?.id ?? null);
  const voterIds = $derived(lab.voters.map((v) => v.row.id));
  const predicted = $derived(lab.classIndex(lab.prediction));
  const predictedName = $derived(lab.classInfo(lab.prediction)?.name ?? '');
  const cell = $derived({
    w: plot.width / AREA_GRID.columns,
    h: plot.height / AREA_GRID.lines,
  });
  // The areas as horizontal strips: neighbouring cells of the same kind are
  // drawn as one rectangle, so no seams show between cells.
  const strips = $derived.by(() => {
    const result: {
      line: number;
      start: number;
      length: number;
      label: string;
    }[] = [];
    for (let line = 0; line < AREA_GRID.lines; line++) {
      let start = 0;
      for (let column = 1; column <= AREA_GRID.columns; column++) {
        const at = (c: number) => lab.areas[line * AREA_GRID.columns + c];
        if (column === AREA_GRID.columns || at(column) !== at(start)) {
          result.push({
            line,
            start,
            length: column - start,
            label: at(start) ?? '',
          });
          start = column;
        }
      }
    }
    return result;
  });

  // Screen-reader summary, refreshed at most once per second.
  $effect(() => {
    const counts = Object.entries(lab.vote.counts)
      .map(
        ([id, n]) =>
          `${n} ${n === 1 ? lab.classInfo(id)?.name : lab.classInfo(id)?.plural}`,
      )
      .join(' and ');
    const text = `New fruit at ${formatNumber(lab.query.x, 1)} by ${formatNumber(lab.query.y, 1)} cm. Its ${lab.k} nearest fruits are ${counts}, so it is predicted to be a ${predictedName}.`;
    const timer = setTimeout(() => {
      summary = text;
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  });

  onMount(() => {
    hintSeen = readFlag('hint-knn') === 'seen';
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width = Math.max(240, Math.round(entry.contentRect.width));
      height = Math.max(240, Math.round(entry.contentRect.height));
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  });

  function dismissHint() {
    if (hintSeen) return;
    hintSeen = true;
    writeFlag('hint-knn', 'seen');
  }

  // Dragging the new fruit, or tapping anywhere on the plot to place it.
  // The SVG's position is read once per drag, never per move.
  let rect: DOMRect | null = null;
  let dragging = $state(false);

  function toData(clientX: number, clientY: number, box: DOMRect) {
    return {
      x: x.invert(((clientX - box.left) / box.width) * width),
      y: y.invert(((clientY - box.top) / box.height) * height),
    };
  }

  const move = oncePerFrame((clientX: number, clientY: number) => {
    if (!rect) return;
    const point = toData(clientX, clientY, rect);
    lab.setQuery(point.x, point.y);
  });

  function begin(event: PointerEvent) {
    if (!svg || event.button !== 0) return;
    // Points keep their own hover and tap; only the plot and the fruit drag.
    if (event.target instanceof Element && event.target.closest('[data-id]')) {
      return;
    }
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    rect = svg.getBoundingClientRect();
    dragging = true;
    dismissHint();
    const point = toData(event.clientX, event.clientY, rect);
    lab.setQuery(point.x, point.y);
  }

  function end() {
    move.flush();
    rect = null;
    dragging = false;
  }

  // Keyboard on the new fruit: arrows move it 0.1 cm (Shift: 0.5 cm).
  function queryKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 0.5 : 0.1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const delta = moves[event.key];
    if (!delta) return;
    event.preventDefault();
    lab.setQuery(lab.query.x + delta[0], lab.query.y + delta[1]);
    dismissHint();
  }

  // Keyboard on the fruits: ←/→ walk through them, nearest first; Esc clears.
  function pointsKey(event: KeyboardEvent) {
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
    const order = lab.ranked.map((r) => r.row);
    const index = order.findIndex((r) => r.id === selectedId);
    const next =
      order[
        index === -1
          ? 0
          : Math.min(order.length - 1, Math.max(0, index + direction))
      ];
    if (next) lab.select({ kind: 'item', id: next.id, source: 'graph' });
  }

  function pointId(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    return id ? Number(id) : null;
  }

  /** A triangle pointing up, centred on (cx, cy). */
  function triangle(cx: number, cy: number, r: number): string {
    const h = r * 1.15;
    return `M${cx},${cy - h} L${cx + h * 0.95},${cy + h * 0.6} L${cx - h * 0.95},${cy + h * 0.6} Z`;
  }

  /** A diamond centred on (cx, cy). */
  function diamond(cx: number, cy: number, r: number): string {
    return `M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`;
  }

  const tooltip = $derived.by(() => {
    const row = lab.selectedRow;
    if (!row) return null;
    const ranked = lab.rankById[row.id];
    const left = (x(row.x) / width) * 100;
    const top = (y(row.y) / height) * 100;
    return {
      row,
      ranked,
      left: Math.min(85, Math.max(15, left)),
      top,
      below: top < 22,
    };
  });
</script>

<div
  class="graph"
  role="group"
  aria-label={`Scatter plot of fruits: ${yCol?.label.toLowerCase() ?? 'y'} against ${xCol?.label.toLowerCase() ?? 'x'}`}
  aria-describedby="knn-graph-summary"
  data-view="graph"
  data-dragging={dragging ? '' : undefined}
>
  <div class="graph__frame" bind:this={frame}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <svg
      bind:this={svg}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      onpointerdown={begin}
      onpointermove={(event) => {
        if (dragging) move(event.clientX, event.clientY);
      }}
      onpointerup={end}
      onpointercancel={end}
    >
      <defs>
        <clipPath id="knn-plot-clip">
          <rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} />
        </clipPath>
      </defs>

      <!-- Areas each kind would win, under everything else -->
      {#if lab.showAreas}
        <g class="areas" aria-hidden="true">
          {#each strips as strip (`${strip.line}-${strip.start}`)}
            <rect
              class={`area area--${lab.classIndex(strip.label)}`}
              x={plot.x + strip.start * cell.w}
              y={plot.y + strip.line * cell.h}
              width={strip.length * cell.w}
              height={cell.h + 0.6}
            />
          {/each}
        </g>
      {/if}

      <Axes
        {x}
        {y}
        {xTicks}
        {yTicks}
        {plot}
        {height}
        {margin}
        {narrow}
        xTitle={`${xCol?.label ?? 'x'} (${xCol?.unit ?? ''})`}
        yTitle={`${yCol?.label ?? 'y'} (${yCol?.unit ?? ''})`}
      />

      <g clip-path="url(#knn-plot-clip)" aria-hidden="true">
        <!-- The neighbourhood: a circle through the k-th nearest fruit -->
        <circle
          class="reach"
          cx={x(lab.query.x)}
          cy={y(lab.query.y)}
          r={lab.radius * pxPerUnit}
        />
        <!-- Lines from the new fruit to the k nearest -->
        {#each lab.voters as voter (voter.row.id)}
          <line
            class="link"
            class:link--selected={voter.row.id === selectedId}
            x1={x(lab.query.x)}
            y1={y(lab.query.y)}
            x2={x(voter.row.x)}
            y2={y(voter.row.y)}
          />
        {/each}
        {#if lab.selectedRow && !voterIds.includes(lab.selectedRow.id)}
          <line
            class="link link--other"
            x1={x(lab.query.x)}
            y1={y(lab.query.y)}
            x2={x(lab.selectedRow.x)}
            y2={y(lab.selectedRow.y)}
          />
        {/if}
      </g>

      <!-- Fruits: one tab stop, arrow keys walk through them, nearest first -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <g
        class="points"
        role="group"
        aria-label={`${lab.rows.length} known fruits. Use the left and right arrow keys to move between them, nearest first.`}
        tabindex="0"
        onkeydown={pointsKey}
        onfocus={() => {
          pointsFocused = true;
        }}
        onblur={() => {
          pointsFocused = false;
        }}
        onpointerover={(event) => {
          const id = pointId(event);
          if (id !== null && event.pointerType === 'mouse') {
            lab.select({ kind: 'item', id, source: 'graph' });
          }
        }}
        onpointerout={(event) => {
          const id = pointId(event);
          if (id !== null && event.pointerType === 'mouse')
            lab.release('item', id);
        }}
        onclick={(event) => {
          const id = pointId(event);
          if (id === null) return;
          // A mouse already selected the fruit on hover; a tap toggles it.
          if (selectedId === id && event.pointerType !== 'mouse')
            lab.select(null);
          else lab.select({ kind: 'item', id, source: 'graph' });
        }}
      >
        {#if pointsFocused}
          <rect
            class="points__focus"
            x={plot.x + 2}
            y={plot.y + 2}
            width={plot.width - 4}
            height={plot.height - 4}
            rx="6"
          />
        {/if}
        {#each lab.rows as row (row.id)}
          {@const index = lab.classIndex(row.label)}
          {@const r = row.id === selectedId ? 8 : 6.5}
          {#if lab.classInfo(row.label)?.shape === 'triangle'}
            <path
              class={`point point--${index}`}
              class:point--voter={voterIds.includes(row.id)}
              d={triangle(x(row.x), y(row.y), r)}
              data-id={row.id}
              data-selected={row.id === selectedId ? '' : undefined}
            />
          {:else}
            <circle
              class={`point point--${index}`}
              class:point--voter={voterIds.includes(row.id)}
              cx={x(row.x)}
              cy={y(row.y)}
              {r}
              data-id={row.id}
              data-selected={row.id === selectedId ? '' : undefined}
            />
          {/if}
          <circle
            class="point__hit"
            cx={x(row.x)}
            cy={y(row.y)}
            r="13"
            data-id={row.id}
          />
        {/each}
      </g>

      <!-- The new fruit -->
      <g
        class="query"
        role="button"
        tabindex="0"
        aria-roledescription="movable point"
        aria-label={`New fruit, ${formatNumber(lab.query.x, 1)} cm wide and ${formatNumber(lab.query.y, 1)} cm tall, predicted ${predictedName}. Arrow keys move it.`}
        onkeydown={queryKey}
      >
        {#if !hintSeen}
          <circle
            class="query__pulse"
            cx={x(lab.query.x)}
            cy={y(lab.query.y)}
            r="14"
          />
        {/if}
        <path
          class={`query__mark query__mark--${predicted}`}
          d={diamond(x(lab.query.x), y(lab.query.y), 11)}
        />
        <text
          class={`query__label sym-class-${predicted}`}
          x={x(lab.query.x) + 16}
          y={y(lab.query.y) - 12}
        >
          {predictedName}?
        </text>
      </g>
    </svg>

    {#if tooltip}
      <div
        class="tooltip num"
        class:tooltip--below={tooltip.below}
        style:left={`${tooltip.left}%`}
        style:top={`${tooltip.top}%`}
        aria-hidden="true"
      >
        <strong class={`sym-class-${lab.classIndex(tooltip.row.label)}`}
          >{lab.classInfo(tooltip.row.label)?.name} {tooltip.row.id}</strong
        >
        <span
          >{formatNumber(tooltip.row.x, 1)} × {formatNumber(tooltip.row.y, 1)}
          cm</span
        >
        {#if tooltip.ranked}
          <span class="sym-line"
            >d = {formatNumber(tooltip.ranked.distance, 2)} cm · {tooltip.ranked
              .rank <= lab.k
              ? 'votes'
              : 'too far to vote'}</span
          >
        {/if}
      </div>
    {/if}
  </div>
  <p class="visually-hidden" id="knn-graph-summary">{summary}</p>
</div>

<style>
  /* Square, like a figure on a book page: at most 560 px, the full width on
     phones, and small enough on short windows to leave room for k. */
  .graph {
    position: relative;
    width: min(100%, max(320px, min(560px, calc(100dvh - 300px))));
    margin-inline: auto;
  }

  @media (height < 560px) {
    .graph {
      width: min(100%, calc(100dvh - 96px));
    }
  }

  @container lab (width < 520px) {
    .graph {
      width: min(100%, calc(100dvh - 180px));
    }
  }

  .graph__frame {
    position: relative;
    aspect-ratio: 1;
    touch-action: none;
    user-select: none;
  }

  svg {
    position: absolute;
    inset: 0;
    overflow: visible;
    cursor: crosshair;
  }

  /* Solid tints (not transparency), so overlapping strips never show seams. */
  .area {
    shape-rendering: crispedges;
  }

  .area--1 {
    fill: color-mix(in srgb, var(--c-class-1) 12%, var(--c-bg));
  }

  .area--2 {
    fill: color-mix(in srgb, var(--c-class-2) 12%, var(--c-bg));
  }

  .reach {
    fill: none;
    stroke: var(--c-text);
    stroke-width: 1.5;
    stroke-dasharray: 5 5;
    opacity: 0.45;
  }

  .link {
    stroke: var(--c-text);
    stroke-width: 1.5;
    opacity: 0.55;
  }

  .link--selected {
    stroke-width: 3;
    opacity: 0.9;
  }

  .link--other {
    stroke-dasharray: 2 4;
    opacity: 0.5;
  }

  :global(.lab[data-highlight='d']) .link {
    stroke-width: 3;
    opacity: 0.9;
  }

  :global(.lab[data-highlight='k']) .reach {
    stroke-width: 3;
    opacity: 0.8;
  }

  .points {
    outline: none;
  }

  .points__focus {
    fill: none;
    stroke: var(--c-focus);
    stroke-width: 2;
    stroke-dasharray: 6 4;
  }

  .point {
    stroke: var(--c-bg);
    stroke-width: 1.5;
    transition: r var(--dur-ui);
  }

  .point--1 {
    fill: var(--c-class-1);
  }

  .point--2 {
    fill: var(--c-class-2);
  }

  /* The fruits that vote get a dark ring. */
  .point--voter {
    stroke: var(--c-text);
    stroke-width: 2.5;
  }

  .point[data-selected] {
    stroke: var(--c-text);
    stroke-width: 3;
  }

  .point__hit {
    fill: transparent;
    cursor: pointer;
  }

  .query {
    cursor: grab;
    outline: none;
  }

  .graph[data-dragging] .query {
    cursor: grabbing;
  }

  .query__mark {
    stroke: var(--c-text);
    stroke-width: 2.5;
    transition: fill var(--dur-ui);
  }

  .query__mark--1 {
    fill: var(--c-class-1);
  }

  .query__mark--2 {
    fill: var(--c-class-2);
  }

  .query:focus-visible .query__mark {
    stroke: var(--c-focus);
    stroke-width: 4;
  }

  .query__label {
    fill: currentcolor;
    font-size: 15px;
    font-weight: 700;
    paint-order: stroke;
    stroke: var(--c-bg);
    stroke-width: 4px;
    stroke-linejoin: round;
  }

  .query__pulse {
    fill: none;
    stroke: var(--c-text);
    stroke-width: 2;
    transform-box: fill-box;
    transform-origin: center;
    animation: pulse 1.6s var(--ease-out) infinite;
  }

  @keyframes pulse {
    from {
      opacity: 0.6;
      transform: scale(1);
    }

    to {
      opacity: 0;
      transform: scale(2.2);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .query__pulse {
      animation: none;
      opacity: 0.4;
    }
  }

  .tooltip {
    position: absolute;
    display: grid;
    gap: 2px;
    padding: 6px 10px;
    border: 1px solid var(--c-hairline);
    border-radius: var(--radius-control);
    background: var(--c-surface);
    box-shadow: var(--shadow-float);
    font-size: var(--fs-12);
    white-space: nowrap;
    pointer-events: none;
    transform: translate(-50%, calc(-100% - 14px));
  }

  .tooltip--below {
    transform: translate(-50%, 14px);
  }
</style>
