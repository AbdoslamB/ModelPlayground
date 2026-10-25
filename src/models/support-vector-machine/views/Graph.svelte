<!--
  The SVM graph: the students on a chart (passed as circles, failed as
  triangles), the border f(x) = 0 as a solid line, the two margin lines
  f(x) = ±1 dashed, and each side shaded. Support vectors have a ring. With a
  straight border, a short orange line shows each student's slack: how far
  they are past their own margin line. Students can be dragged.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { Point } from '../math';
  import type { SvmLab } from '../store.svelte';

  import Axes from '../../../charts/Axes.svelte';
  import { formatNumber } from '../../../lib/format';
  import { oncePerFrame } from '../../../lib/raf';
  import { scaleLinear } from '../../../lib/scales';
  import { readFlag, writeFlag } from '../../../lib/storage';
  import { stepTo } from '../math';
  import { GRID_SIZE } from '../store.svelte';

  let { lab }: { lab: SvmLab } = $props();

  let frame: HTMLDivElement | undefined = $state();
  let svg: SVGSVGElement | undefined = $state();
  let width = $state(560);
  let height = $state(560);
  let hintSeen = $state(true);
  let pointsFocused = $state(false);
  let summary = $state('');

  const narrow = $derived(width < 480);
  const margin = $derived(
    narrow
      ? { top: 28, right: 30, bottom: 40, left: 38 }
      : { top: 34, right: 32, bottom: 50, left: 52 },
  );
  const axes = $derived(lab.dataset.axes);
  const x = $derived(scaleLinear(axes.x, [margin.left, width - margin.right]));
  const y = $derived(scaleLinear(axes.y, [height - margin.bottom, margin.top]));
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
  const cell = $derived({
    w: plot.width / GRID_SIZE,
    h: plot.height / GRID_SIZE,
  });
  const positive = $derived(
    lab.dataset.classes.findIndex((c) => c.sign > 0) + 1,
  );
  const negative = $derived(positive === 1 ? 2 : 1);

  // The two sides as horizontal strips of cells, by the sign of f at each
  // cell's centre (the average of its corners). Drawn from the top down.
  const strips = $derived.by(() => {
    const result: {
      line: number;
      start: number;
      length: number;
      side: number;
    }[] = [];
    for (let line = 0; line < GRID_SIZE; line++) {
      const row = GRID_SIZE - 1 - line;
      const sideAt = (c: number) => {
        const s = lab.samples;
        const v =
          (s[row]?.[c] ?? 0) +
          (s[row]?.[c + 1] ?? 0) +
          (s[row + 1]?.[c] ?? 0) +
          (s[row + 1]?.[c + 1] ?? 0);
        return v >= 0 ? positive : negative;
      };
      let start = 0;
      for (let column = 1; column <= GRID_SIZE; column++) {
        if (column === GRID_SIZE || sideAt(column) !== sideAt(start)) {
          result.push({
            line,
            start,
            length: column - start,
            side: sideAt(start),
          });
          start = column;
        }
      }
    }
    return result;
  });

  function path(segments: [Point, Point][]): string {
    return segments
      .map(([a, b]) => `M${x(a.x)},${y(a.y)}L${x(b.x)},${y(b.y)}`)
      .join('');
  }

  /** Slack lines: from each student past their margin line, back to it. */
  const slackLines = $derived(
    lab.curved
      ? []
      : lab.points.flatMap((p, i) => {
          if ((lab.slacks[p.id] ?? 0) <= 1e-9) return [];
          const sign = lab.signs[i] ?? 1;
          return [{ id: p.id, from: p, to: stepTo(lab.machine, p, sign) }];
        }),
  );

  // Screen-reader summary, refreshed at most once per second.
  $effect(() => {
    const text = `${lab.supportIds.length} support vectors. ${lab.wrong} of ${lab.points.length} students are on the wrong side of the border.${
      lab.curved
        ? ''
        : ` The margin is ${formatNumber(lab.width, 2)} hours wide.`
    }`;
    const timer = setTimeout(() => {
      summary = text;
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  });

  onMount(() => {
    hintSeen = readFlag('hint-svm') === 'seen';
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
    writeFlag('hint-svm', 'seen');
  }

  // Dragging a student. The SVG's position is read once per drag.
  let rect: DOMRect | null = null;
  let dragId: number | null = null;
  let dragging = $state(false);

  const move = oncePerFrame((clientX: number, clientY: number) => {
    if (!rect || dragId === null) return;
    lab.movePoint(
      dragId,
      x.invert(((clientX - rect.left) / rect.width) * width),
      y.invert(((clientY - rect.top) / rect.height) * height),
    );
  });

  function begin(event: PointerEvent) {
    if (!svg || event.button !== 0) return;
    const id = pointId(event);
    if (id === null) return;
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    rect = svg.getBoundingClientRect();
    dragId = id;
    dragging = true;
    dismissHint();
    lab.select({ kind: 'item', id, source: 'graph' });
  }

  function end() {
    move.cancel();
    rect = null;
    dragId = null;
    dragging = false;
  }

  // Keyboard on the students: ←/→ walk through them, Shift + arrows move
  // the selected one, Esc clears.
  function pointsKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      lab.select(null);
      return;
    }
    const selected = lab.selectedRow;
    if (event.shiftKey && selected) {
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-0.2, 0],
        ArrowRight: [0.2, 0],
        ArrowUp: [0, 0.2],
        ArrowDown: [0, -0.2],
      };
      const delta = moves[event.key];
      if (!delta) return;
      event.preventDefault();
      lab.movePoint(selected.id, selected.x + delta[0], selected.y + delta[1]);
      dismissHint();
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
    const order = [...lab.points].sort((p, q) => p.x - q.x || p.y - q.y);
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

  function triangle(cx: number, cy: number, r: number): string {
    const h = r * 1.15;
    return `M${cx},${cy - h} L${cx + h * 0.95},${cy + h * 0.6} L${cx - h * 0.95},${cy + h * 0.6} Z`;
  }

  const tooltip = $derived.by(() => {
    const row = lab.selectedRow;
    if (!row) return null;
    const left = (x(row.x) / width) * 100;
    const top = (y(row.y) / height) * 100;
    return {
      row,
      left: Math.min(85, Math.max(15, left)),
      top,
      below: top < 22,
    };
  });
</script>

<div
  class="graph"
  role="group"
  aria-label={`Students on a chart of ${yCol?.label.toLowerCase() ?? 'y'} against ${xCol?.label.toLowerCase() ?? 'x'}, with the border and its margin`}
  aria-describedby="svm-graph-summary"
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
        <clipPath id="svm-plot-clip">
          <rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} />
        </clipPath>
      </defs>

      {#if lab.showAreas}
        <g class="areas" aria-hidden="true">
          {#each strips as strip (`${strip.line}-${strip.start}`)}
            <rect
              class={`area area--${strip.side}`}
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

      <g clip-path="url(#svm-plot-clip)" aria-hidden="true">
        <path class={`margin margin--${positive}`} d={path(lab.marginPlus)} />
        <path class={`margin margin--${negative}`} d={path(lab.marginMinus)} />
        <path class="border" d={path(lab.border)} />
        {#each slackLines as line (line.id)}
          <line
            class="slack"
            class:slack--selected={line.id === selectedId}
            x1={x(line.from.x)}
            y1={y(line.from.y)}
            x2={x(line.to.x)}
            y2={y(line.to.y)}
          />
        {/each}
      </g>

      <!-- Students: one tab stop, arrow keys walk through them -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <g
        class="points"
        role="group"
        aria-label={`${lab.points.length} students. Use the left and right arrow keys to move between them, and Shift with the arrow keys to move the selected student.`}
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
          if (id !== null && event.pointerType === 'mouse' && !dragging) {
            lab.select({ kind: 'item', id, source: 'graph' });
          }
        }}
        onpointerout={(event) => {
          const id = pointId(event);
          if (id !== null && event.pointerType === 'mouse' && !dragging)
            lab.release('item', id);
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
        {#each lab.points as row (row.id)}
          {@const index = lab.classIndex(row.label)}
          {@const r = row.id === selectedId ? 8 : 6.5}
          {#if lab.supportIds.includes(row.id)}
            <circle class="ring" cx={x(row.x)} cy={y(row.y)} r={r + 5} />
          {/if}
          {#if lab.classInfo(row.label)?.shape === 'triangle'}
            <path
              class={`point point--${index}`}
              d={triangle(x(row.x), y(row.y), r)}
              data-id={row.id}
              data-selected={row.id === selectedId ? '' : undefined}
            />
          {:else}
            <circle
              class={`point point--${index}`}
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
            r="14"
            data-id={row.id}
          />
          {#if !hintSeen && row.id === lab.points[0]?.id}
            <circle class="pulse" cx={x(row.x)} cy={y(row.y)} r="12" />
          {/if}
        {/each}
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
          >Student {tooltip.row.id}: {lab.classInfo(tooltip.row.label)
            ?.name}</strong
        >
        <span
          >{formatNumber(tooltip.row.x, 1)} h studied, {formatNumber(
            tooltip.row.y,
            1,
          )} h slept</span
        >
        <span
          >y·f(x) = {formatNumber(
            lab.margins[tooltip.row.id] ?? NaN,
            2,
          )}{lab.supportIds.includes(tooltip.row.id)
            ? ' · support vector'
            : ''}</span
        >
      </div>
    {/if}
  </div>
  <p class="visually-hidden" id="svm-graph-summary">{summary}</p>
</div>

<style>
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
  }

  .area {
    shape-rendering: crispedges;
  }

  .area--1 {
    fill: color-mix(in srgb, var(--c-class-1) 12%, var(--c-bg));
  }

  .area--2 {
    fill: color-mix(in srgb, var(--c-class-2) 12%, var(--c-bg));
  }

  .border {
    fill: none;
    stroke: var(--c-text);
    stroke-width: 2.5;
    stroke-linecap: round;
  }

  .margin {
    fill: none;
    stroke-width: 2;
    stroke-dasharray: 7 5;
  }

  .margin--1 {
    stroke: var(--c-class-1);
  }

  .margin--2 {
    stroke: var(--c-class-2);
  }

  :global(.lab[data-highlight='f']) .border {
    stroke-width: 4;
  }

  .slack {
    stroke: var(--c-error);
    stroke-width: 2;
  }

  .slack--selected,
  :global(.lab[data-highlight='xi']) .slack {
    stroke-width: 4;
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

  .ring {
    fill: none;
    stroke: var(--c-text);
    stroke-width: 1.5;
    pointer-events: none;
  }

  .point {
    stroke: var(--c-bg);
    stroke-width: 1.5;
  }

  .point--1 {
    fill: var(--c-class-1);
  }

  .point--2 {
    fill: var(--c-class-2);
  }

  .point[data-selected] {
    stroke: var(--c-text);
    stroke-width: 3;
  }

  .point__hit {
    fill: transparent;
    cursor: grab;
  }

  .graph[data-dragging] .point__hit {
    cursor: grabbing;
  }

  .pulse {
    fill: none;
    stroke: var(--c-text);
    stroke-width: 2;
    pointer-events: none;
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
    .pulse {
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
