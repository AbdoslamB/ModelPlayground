<!--
  The Linear Regression graph: data points, your line, its drag handles, the
  intercept marker, the rise/run triangle, and on request the misses and the
  best line. Axes are fixed by the dataset, so
  the graph never rescales under the learner's hand. Pointer input is written
  to the state at most once per animation frame.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { LinearRegressionLab } from '../store.svelte';

  import Axes from '../../../charts/Axes.svelte';
  import { decimalsForStep, formatNumber } from '../../../lib/format';
  import { oncePerFrame } from '../../../lib/raf';
  import { scaleLinear } from '../../../lib/scales';
  import { readFlag, writeFlag } from '../../../lib/storage';

  let { lab }: { lab: LinearRegressionLab } = $props();

  let frame: HTMLDivElement | undefined = $state();
  let svg: SVGSVGElement | undefined = $state();
  let width = $state(640);
  let height = $state(400);
  // Narrow graphs (phones) get tighter margins and smaller axis text, so the
  // plot itself keeps as much of the space as possible.
  const narrow = $derived(width < 480);
  const margin = $derived(
    narrow
      ? { top: 28, right: 12, bottom: 40, left: 38 }
      : { top: 34, right: 20, bottom: 50, left: 52 },
  );
  let hintSeen = $state(true);
  let pointsFocused = $state(false);
  let summary = $state('');

  const ds = $derived(lab.dataset);
  const xCol = $derived(lab.xColumn);
  const yCol = $derived(lab.yColumn);
  const x = $derived(
    scaleLinear(lab.axes.x, [margin.left, width - margin.right]),
  );
  const y = $derived(
    scaleLinear(lab.axes.y, [height - margin.bottom, margin.top]),
  );
  const xTicks = $derived(x.ticks(Math.max(4, Math.round(width / 90))));
  const yTicks = $derived(y.ticks(Math.max(4, Math.round(height / 60))));
  const selectedId = $derived(lab.selectedRow?.id ?? null);
  const byX = $derived([...lab.rows].sort((p, q) => p.x - q.x || p.id - q.id));
  const plot = $derived({
    x: margin.left,
    y: margin.top,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  });
  const aDecimals = $derived(decimalsForStep(ds.params.a.step));
  const bDecimals = $derived(decimalsForStep(ds.params.b.step));

  // The line, drawn across the whole x-axis and clipped to the plot.
  const [x0, x1] = $derived(lab.axes.x);
  const handles = $derived(lab.handles);
  const slope = $derived.by(() => {
    const start = handles[0];
    if (!start) return null;
    return { x: start.x, y: start.y, x2: start.x + 1, y2: lab.at(start.x + 1) };
  });
  const showHint = $derived(!hintSeen);
  const interceptVisible = $derived(
    lab.a >= lab.axes.y[0] && lab.a <= lab.axes.y[1],
  );

  // Screen-reader summary, refreshed at most once per second.
  $effect(() => {
    const text = `${lab.rows.length} ${ds.words.rows}, listed in the table below. Your line: ŷ = ${formatNumber(lab.a, aDecimals)} + ${formatNumber(lab.b, bDecimals)}x. Typical miss ${formatNumber(lab.typicalMiss, 1)} ${yCol?.unit ?? ''}, ${lab.meter.label.toLowerCase()}.`;
    const timer = setTimeout(() => {
      summary = text;
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  });

  onMount(() => {
    hintSeen = readFlag('hint-line') === 'seen';
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width = Math.max(240, Math.round(entry.contentRect.width));
      height = Math.max(180, Math.round(entry.contentRect.height));
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  });

  function dismissHint() {
    if (hintSeen) return;
    hintSeen = true;
    writeFlag('hint-line', 'seen');
  }

  // Dragging. The SVG's position is read once per drag, never per move.
  let drag: {
    kind: 'handle' | 'line';
    rect: DOMRect;
    handleX: number;
    pivotX: number;
    pivotY: number;
    startA: number;
    startY: number;
  } | null = null;
  let dragging = $state<'handle-0' | 'handle-1' | 'line' | null>(null);

  function dataY(clientY: number, rect: DOMRect): number {
    return y.invert(((clientY - rect.top) / rect.height) * height);
  }

  function begin(event: PointerEvent, kind: 'handle-0' | 'handle-1' | 'line') {
    if (!svg || event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const rect = svg.getBoundingClientRect();
    const index = kind === 'handle-1' ? 1 : 0;
    const handle = handles[index];
    const pivot = handles[1 - index];
    if (!handle || !pivot) return;
    drag = {
      kind: kind === 'line' ? 'line' : 'handle',
      rect,
      handleX: handle.x,
      pivotX: pivot.x,
      pivotY: pivot.y,
      startA: lab.a,
      startY: dataY(event.clientY, rect),
    };
    dragging = kind;
    dismissHint();
  }

  const move = oncePerFrame((clientY: number) => {
    if (!drag) return;
    const pointerY = dataY(clientY, drag.rect);
    if (drag.kind === 'line') {
      lab.setLine(drag.startA + (pointerY - drag.startY), lab.b);
    } else {
      lab.pivot(drag.pivotX, drag.pivotY, drag.handleX, pointerY);
    }
  });

  function end() {
    move.cancel();
    drag = null;
    dragging = null;
  }

  // Keyboard on a handle: ↑/↓ move it one step (Shift: ten), pivoting the line.
  function handleKey(event: KeyboardEvent, index: number) {
    const direction =
      event.key === 'ArrowUp' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    if (!direction) return;
    event.preventDefault();
    const handle = handles[index];
    const pivot = handles[1 - index];
    if (!handle || !pivot) return;
    const step =
      ((lab.axes.y[1] - lab.axes.y[0]) / 100) * (event.shiftKey ? 10 : 1);
    lab.pivot(pivot.x, pivot.y, handle.x, handle.y + direction * step);
    dismissHint();
  }

  // Keyboard on the points: ←/→ walk through them in x order, Esc clears.
  function pointsKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      lab.select(null);
      return;
    }
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0;
    if (!direction) return;
    event.preventDefault();
    const index = byX.findIndex((r) => r.id === selectedId);
    const next =
      byX[
        index === -1
          ? 0
          : Math.min(byX.length - 1, Math.max(0, index + direction))
      ];
    if (next) lab.select({ kind: 'item', id: next.id, source: 'graph' });
  }

  function pointId(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    return id ? Number(id) : null;
  }

  function fmtX(value: number) {
    return formatNumber(value, xCol?.decimals ?? 1);
  }

  function fmtY(value: number) {
    return formatNumber(value, yCol?.decimals ?? 1);
  }

  const tooltip = $derived.by(() => {
    const row = lab.selectedRow;
    if (!row) return null;
    const left = (x(row.x) / width) * 100;
    const top = (y(row.y) / height) * 100;
    return {
      row,
      left: Math.min(88, Math.max(12, left)),
      top,
      below: top < 22,
    };
  });
</script>

<div
  class="graph"
  role="group"
  aria-label={`Scatter plot: ${yCol?.label.toLowerCase() ?? 'y'} against ${xCol?.label.toLowerCase() ?? 'x'}`}
  aria-describedby="graph-summary"
  data-view="graph"
  data-dragging={dragging ?? undefined}
  data-narrow={narrow ? '' : undefined}
>
  <div class="graph__frame" bind:this={frame}>
    <svg
      bind:this={svg}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      aria-hidden="false"
    >
      <defs>
        <clipPath id="plot-clip">
          <rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} />
        </clipPath>
      </defs>

      <!-- Grid and axes -->
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
        xAxisAt={Math.max(lab.axes.y[0], Math.min(0, lab.axes.y[1]))}
      />

      <!-- Misses: from each point straight to the line -->
      <g class="misses" aria-hidden="true" clip-path="url(#plot-clip)">
        {#each lab.rows as row (row.id)}
          {#if lab.showMisses || row.id === selectedId}
            <line
              class="miss"
              x1={x(row.x)}
              x2={x(row.x)}
              y1={y(row.y)}
              y2={y(lab.predictions[row.id] ?? row.y)}
            />
          {/if}
        {/each}
      </g>

      <g clip-path="url(#plot-clip)">
        <!-- The best line, dashed, when asked for -->
        {#if lab.showBest && lab.best}
          <line
            class="best"
            x1={x(x0)}
            y1={y(lab.bestAt(x0))}
            x2={x(x1)}
            y2={y(lab.bestAt(x1))}
          />
        {/if}

        <!-- Your line -->
        <line
          class="line"
          x1={x(x0)}
          y1={y(lab.at(x0))}
          x2={x(x1)}
          y2={y(lab.at(x1))}
        />
        <line
          class="line__hit"
          x1={x(x0)}
          y1={y(lab.at(x0))}
          x2={x(x1)}
          y2={y(lab.at(x1))}
          onpointerdown={(event) => {
            begin(event, 'line');
          }}
          onpointermove={(event) => {
            move(event.clientY);
          }}
          onpointerup={end}
          onpointercancel={end}
        />
      </g>

      <!-- Rise/run triangle: one unit across, b up -->
      {#if slope}
        <g class="slope" aria-hidden="true" clip-path="url(#plot-clip)">
          <path
            d={`M${x(slope.x)},${y(slope.y)} H${x(slope.x2)} V${y(slope.y2)}`}
          />
          <text
            class="slope__run"
            x={(x(slope.x) + x(slope.x2)) / 2}
            y={y(slope.y) + (lab.b >= 0 ? 16 : -8)}
            text-anchor="middle"
          >
            1 {xCol?.unit.replace(/s$/, '')}
          </text>
          <text
            class="slope__rise num"
            x={x(slope.x2) + 6}
            y={(y(slope.y) + y(slope.y2)) / 2 + 4}
          >
            b
          </text>
        </g>
      {/if}

      <!-- Intercept: where the line crosses x = 0 -->
      {#if interceptVisible}
        <g class="intercept" aria-hidden="true">
          <circle cx={x(0)} cy={y(lab.a)} r="6" />
          <text class="num" x={x(0) + 10} y={y(lab.a) - 10}> a </text>
        </g>
      {/if}

      <!-- Data points: one tab stop, arrow keys walk through them -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <g
        class="points"
        role="group"
        aria-label={`${lab.rows.length} ${ds.words.rows}. Use the left and right arrow keys to move between them.`}
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
          // A mouse already selected the point on hover; a tap toggles it.
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
          <circle
            class="point"
            cx={x(row.x)}
            cy={y(row.y)}
            r={row.id === selectedId ? 7 : 5}
            data-id={row.id}
            data-selected={row.id === selectedId ? '' : undefined}
          />
          <circle
            class="point__hit"
            cx={x(row.x)}
            cy={y(row.y)}
            r="12"
            data-id={row.id}
          />
        {/each}
      </g>

      <!-- Drag handles -->
      {#each handles as handle, index (index)}
        <g
          class="handle"
          role="slider"
          tabindex="0"
          aria-label={index === 0
            ? 'Left handle of your line'
            : 'Right handle of your line'}
          aria-orientation="vertical"
          aria-valuemin={lab.axes.y[0]}
          aria-valuemax={lab.axes.y[1]}
          aria-valuenow={Math.round(handle.y * 10) / 10}
          aria-valuetext={`Line height at ${fmtX(handle.x)} ${xCol?.unit ?? ''}: ${formatNumber(handle.y, 1)} ${yCol?.unit ?? ''}`}
          data-dragging={dragging === `handle-${index}` ? '' : undefined}
          onpointerdown={(event) => {
            begin(event, index === 0 ? 'handle-0' : 'handle-1');
          }}
          onpointermove={(event) => {
            move(event.clientY);
          }}
          onpointerup={end}
          onpointercancel={end}
          onkeydown={(event) => {
            handleKey(event, index);
          }}
        >
          {#if showHint}
            <circle
              class="handle__pulse"
              cx={x(handle.x)}
              cy={y(handle.y)}
              r="10"
            />
          {/if}
          <circle
            class="handle__hit"
            cx={x(handle.x)}
            cy={y(handle.y)}
            r="22"
          />
          <circle class="handle__dot" cx={x(handle.x)} cy={y(handle.y)} r="8" />
        </g>
      {/each}
    </svg>

    {#if tooltip}
      <div
        class="tooltip num"
        class:tooltip--below={tooltip.below}
        style:left={`${tooltip.left}%`}
        style:top={`${tooltip.top}%`}
        aria-hidden="true"
      >
        <strong
          >{ds.words.row[0]?.toUpperCase()}{ds.words.row.slice(1)}
          {tooltip.row.id}</strong
        >
        <span
          >{xCol?.short}
          {fmtX(tooltip.row.x)}
          {xCol?.unit} · {yCol?.short}
          {fmtY(tooltip.row.y)}
          {yCol?.unit}</span
        >
        <span class="sym-line"
          >ŷ = {formatNumber(lab.predictions[tooltip.row.id] ?? NaN, 1)}
          {yCol?.unit}</span
        >
        <span class="sym-error"
          >e = {formatNumber(lab.misses[tooltip.row.id] ?? NaN, 1)}
          {yCol?.unit}</span
        >
      </div>
    {/if}
  </div>
  <p class="visually-hidden" id="graph-summary">{summary}</p>
</div>

<style>
  /* Like a figure on a book page: at most 680 px wide, the full width on
     phones, and on short windows small enough that the tools, graph,
     equations and sliders fit on screen together (16:10, so height ×1.6). */
  .graph {
    position: relative;
    width: min(100%, max(360px, min(680px, calc((100dvh - 320px) * 1.6))));
    margin-inline: auto;
  }

  /* Short screens (phones held sideways): use the screen height, minus the
     top bar, instead of shrinking to make room for the sliders. */
  @media (height < 560px) {
    .graph {
      width: min(100%, 680px, calc((100dvh - 96px) * 1.6));
    }
  }

  .graph__frame {
    position: relative;
    aspect-ratio: 16 / 10;
    touch-action: pan-y;
    user-select: none;
  }

  /* Phones in portrait: a square graph at full width, which gives the plot
     far more height than 4:3, but never taller than the screen allows with
     the tools above it and the equation below it. */
  @container lab (width < 520px) {
    .graph {
      width: min(100%, calc(100dvh - 180px));
    }

    .graph__frame {
      aspect-ratio: 1;
    }
  }

  /* Absolutely placed so the frame's aspect-ratio alone sets the size;
     otherwise Safari sizes the frame from the SVG and the resize observer
     feeds that size back in. */
  svg {
    position: absolute;
    inset: 0;
    overflow: visible;
  }

  /* Labels keep a halo in the card color so they stay readable over points. */
  .slope text,
  .intercept text {
    paint-order: stroke;
    stroke: var(--c-bg);
    stroke-width: 4px;
    stroke-linejoin: round;
  }

  .line {
    stroke: var(--c-line);
    stroke-width: 3;
    stroke-linecap: round;
    transition: stroke-width var(--dur-ui);
  }

  :global(.lab[data-highlight='line']) .line {
    stroke-width: 5;
  }

  .line__hit {
    stroke: transparent;
    stroke-width: 26;
    cursor: ns-resize;
    touch-action: none;
  }

  .slope path {
    fill: none;
    stroke: var(--c-b);
    stroke-width: 2;
    stroke-dasharray: 4 3;
  }

  :global(.lab[data-highlight='b']) .slope path {
    stroke-width: 3.5;
    stroke-dasharray: none;
  }

  .slope__run {
    fill: var(--c-muted);
    font-size: 12px;
  }

  .slope__rise {
    fill: var(--c-b-ink);
    font-family: 'KaTeX_Math', 'Times New Roman', serif;
    font-size: 18px;
    font-style: italic;
  }

  .intercept circle {
    fill: var(--c-bg);
    stroke: var(--c-a);
    stroke-width: 3;
    transition: r var(--dur-ui);
  }

  :global(.lab[data-highlight='a']) .intercept circle {
    r: 9;
  }

  .intercept text {
    fill: var(--c-a-ink);
    font-family: 'KaTeX_Math', 'Times New Roman', serif;
    font-size: 18px;
    font-style: italic;
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
    fill: var(--c-data);
    fill-opacity: 0.85;
    stroke: var(--c-bg);
    stroke-width: 1;
    transition: r var(--dur-ui);
  }

  .point[data-selected] {
    fill-opacity: 1;
    stroke: var(--c-text);
    stroke-width: 2.5;
  }

  .point__hit {
    fill: transparent;
    cursor: pointer;
  }

  .handle {
    cursor: grab;
    outline: none;
    touch-action: none;
  }

  .handle[data-dragging] {
    cursor: grabbing;
  }

  .handle__hit {
    fill: transparent;
  }

  .handle__dot {
    fill: var(--c-bg);
    stroke: var(--c-line);
    stroke-width: 3;
    transition: r var(--dur-ui);
  }

  .handle:hover .handle__dot,
  .handle[data-dragging] .handle__dot {
    r: 10;
  }

  .handle:focus-visible .handle__dot {
    stroke: var(--c-focus);
    stroke-width: 4;
    r: 10;
  }

  .handle__pulse {
    fill: none;
    stroke: var(--c-line);
    stroke-width: 2;
    transform-box: fill-box;
    transform-origin: center;
    animation: pulse 1.6s var(--ease-out) infinite;
  }

  @keyframes pulse {
    from {
      opacity: 0.7;
      transform: scale(1);
    }

    to {
      opacity: 0;
      transform: scale(2.4);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .handle__pulse {
      animation: none;
      opacity: 0.5;
    }
  }

  .miss {
    stroke: var(--c-error);
    stroke-width: 2;
    stroke-dasharray: 2 3;
    stroke-linecap: round;
  }

  :global(.lab[data-highlight='error']) .miss {
    stroke-width: 3.5;
  }

  .best {
    stroke: var(--c-best);
    stroke-width: 2;
    stroke-dasharray: 8 6;
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
