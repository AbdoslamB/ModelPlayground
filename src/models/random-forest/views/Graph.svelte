<!--
  The Random Forest graph: the seeds on a chart, shaded by the forest's vote
  (stronger where more trees agree), and the new seed as a diamond in the
  colour of the forest's answer. Below, every tree as a small map. Picking a
  tree shows its own rectangles on the big chart, and the seeds it drew:
  seeds it never drew are hollow, seeds drawn more than once are marked ×2.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { TreeNode } from '../math';
  import type { ForestLab } from '../store.svelte';

  import Axes from '../../../charts/Axes.svelte';
  import { formatNumber } from '../../../lib/format';
  import { oncePerFrame } from '../../../lib/raf';
  import { scaleLinear } from '../../../lib/scales';
  import { readFlag, writeFlag } from '../../../lib/storage';
  import { leaves } from '../math';
  import { AREA_GRID } from '../store.svelte';

  let { lab }: { lab: ForestLab } = $props();

  let frame: HTMLDivElement | undefined = $state();
  let svg: SVGSVGElement | undefined = $state();
  let width = $state(560);
  let height = $state(560);
  let hintSeen = $state(true);
  let treesFocused = $state(false);
  let summary = $state('');

  const narrow = $derived(width < 480);
  const margin = $derived(
    narrow
      ? { top: 28, right: 14, bottom: 40, left: 38 }
      : { top: 34, right: 18, bottom: 50, left: 52 },
  );
  const axes = $derived(lab.dataset.axes);
  const x = $derived(scaleLinear(axes.x, [margin.left, width - margin.right]));
  const y = $derived(scaleLinear(axes.y, [height - margin.bottom, margin.top]));
  const xTicks = $derived(x.ticks(narrow ? 5 : 8));
  const yTicks = $derived(y.ticks(narrow ? 5 : 8));
  const plot = $derived({
    x: margin.left,
    y: margin.top,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  });
  const xCol = $derived(lab.xColumn);
  const yCol = $derived(lab.yColumn);
  const tree = $derived(lab.selectedTree);
  const predicted = $derived(lab.classIndex(lab.prediction));
  const predictedName = $derived(lab.classInfo(lab.prediction)?.name ?? '');
  const cell = $derived({
    w: plot.width / AREA_GRID.columns,
    h: plot.height / AREA_GRID.lines,
  });

  /** Tint strength from a vote share: stronger where more trees agree. */
  function level(share: number): { side: number; strength: number } {
    const margin = Math.abs(share - 0.5) * 2;
    return {
      side: share > 0.5 ? 2 : 1,
      strength: [6, 10, 14, 18][Math.min(3, Math.floor(margin * 4))] ?? 6,
    };
  }

  // The vote as horizontal strips: neighbouring cells with the same tint are
  // drawn as one rectangle, so no seams show.
  const strips = $derived.by(() => {
    const result: {
      line: number;
      start: number;
      length: number;
      side: number;
      strength: number;
    }[] = [];
    for (let line = 0; line < AREA_GRID.lines; line++) {
      let start = 0;
      const at = (c: number) =>
        level(lab.areas[line * AREA_GRID.columns + c] ?? 0);
      for (let column = 1; column <= AREA_GRID.columns; column++) {
        const a = at(start);
        const b = column < AREA_GRID.columns ? at(column) : null;
        if (b?.side !== a.side || b.strength !== a.strength) {
          result.push({ line, start, length: column - start, ...a });
          start = column;
        }
      }
    }
    return result;
  });

  function box(node: TreeNode, sx = x, sy = y) {
    const x0 = sx(node.box.x[0]);
    const x1 = sx(node.box.x[1]);
    const y0 = sy(node.box.y[1]);
    const y1 = sy(node.box.y[0]);
    return {
      x: x0,
      y: y0,
      width: Math.max(0, x1 - x0),
      height: Math.max(0, y1 - y0),
    };
  }

  // ── Small maps, one per tree.
  const columns = $derived(narrow ? 5 : 7);
  const gap = 8;
  const thumb = $derived((width - gap * (columns - 1)) / columns);
  const thumbsH = $derived(
    Math.ceil(lab.trees.length / columns) * (thumb + gap),
  );
  function thumbAt(index: number) {
    return {
      x: (index % columns) * (thumb + gap),
      y: Math.floor(index / columns) * (thumb + gap),
    };
  }
  const tx = $derived(scaleLinear(axes.x, [4, thumb - 4]));
  const ty = $derived(scaleLinear(axes.y, [thumb - 4, 4]));

  // Screen-reader summary, refreshed at most once per second.
  $effect(() => {
    const [first = 0, second = 0] = lab.tally.counts;
    const text = `New seed at ${formatNumber(lab.query.x, 1)} ${xCol?.unit ?? ''} and ${formatNumber(lab.query.y, 1)} ${yCol?.unit ?? ''}. ${second} of ${lab.trees.length} trees say it ${lab.classInfo(lab.classes[1] ?? '')?.name ?? ''}, ${first} say it ${lab.classInfo(lab.classes[0] ?? '')?.name ?? ''}.`;
    const timer = setTimeout(() => {
      summary = text;
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  });

  onMount(() => {
    hintSeen = readFlag('hint-forest') === 'seen';
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width = Math.max(260, Math.round(entry.contentRect.width));
      height = Math.max(260, Math.round(entry.contentRect.height));
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  });

  function dismissHint() {
    if (hintSeen) return;
    hintSeen = true;
    writeFlag('hint-forest', 'seen');
  }

  // Dragging the new seed, or tapping anywhere on the chart to place it.
  let rect: DOMRect | null = null;
  let dragging = $state(false);

  function toData(clientX: number, clientY: number, r: DOMRect) {
    return {
      x: x.invert(((clientX - r.left) / r.width) * width),
      y: y.invert(((clientY - r.top) / r.height) * height),
    };
  }

  const move = oncePerFrame((clientX: number, clientY: number) => {
    if (!rect) return;
    const point = toData(clientX, clientY, rect);
    lab.setQuery(point.x, point.y);
  });

  function begin(event: PointerEvent) {
    if (!svg || event.button !== 0) return;
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

  // Keyboard on the new seed: arrows move it half a unit (Shift: 2).
  function queryKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 2 : 0.5;
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

  // Keyboard on the trees: ←/→ walk through them, Esc clears.
  function treesKey(event: KeyboardEvent) {
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
    const index = lab.trees.findIndex((t) => t.id === tree?.id);
    const next =
      lab.trees[
        index === -1
          ? 0
          : Math.min(lab.trees.length - 1, Math.max(0, index + direction))
      ];
    if (next) lab.select({ kind: 'item', id: next.id, source: 'graph' });
  }

  function treeId(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    return id ? Number(id) : null;
  }

  function triangle(cx: number, cy: number, r: number): string {
    const h = r * 1.15;
    return `M${cx},${cy - h} L${cx + h * 0.95},${cy + h * 0.6} L${cx - h * 0.95},${cy + h * 0.6} Z`;
  }

  function diamond(cx: number, cy: number, r: number): string {
    return `M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`;
  }
</script>

<div
  class="graph"
  role="group"
  aria-label={`Seeds on a chart of ${yCol?.label.toLowerCase() ?? 'y'} against ${xCol?.label.toLowerCase() ?? 'x'}, shaded by the forest's vote, with every tree below`}
  aria-describedby="forest-graph-summary"
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
      <!-- The forest's vote, or the picked tree's own rectangles -->
      {#if tree}
        <g aria-hidden="true">
          {#each leaves(tree.root) as leaf (leaf.path)}
            {@const r = box(leaf)}
            <rect
              class={`leaf leaf--${lab.classIndex(leaf.prediction)}`}
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
            />
          {/each}
        </g>
      {:else if lab.showAreas}
        <g class="areas" aria-hidden="true">
          {#each strips as strip (`${strip.line}-${strip.start}`)}
            <rect
              class="area"
              style:fill={`color-mix(in srgb, var(--c-class-${strip.side}) ${strip.strength}%, var(--c-bg))`}
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

      <!-- The seeds; with a tree picked, the ones it drew -->
      <g aria-hidden="true">
        {#each lab.rows as row (row.id)}
          {@const index = lab.classIndex(row.label)}
          {@const drawn = lab.draws[row.id] ?? 0}
          {@const unseen = tree !== undefined && drawn === 0}
          {#if lab.classInfo(row.label)?.shape === 'triangle'}
            <path
              class={`point point--${index}`}
              class:point--unseen={unseen}
              d={triangle(x(row.x), y(row.y), 6.5)}
            />
          {:else}
            <circle
              class={`point point--${index}`}
              class:point--unseen={unseen}
              cx={x(row.x)}
              cy={y(row.y)}
              r="6.5"
            />
          {/if}
          {#if drawn > 1}
            <text class="draws num" x={x(row.x) + 9} y={y(row.y) - 7}
              >×{drawn}</text
            >
          {/if}
        {/each}
      </g>

      <!-- The new seed -->
      <g
        class="query"
        role="button"
        tabindex="0"
        aria-roledescription="movable point"
        aria-label={`New seed, ${formatNumber(lab.query.x, 1)} ${xCol?.unit ?? ''} and ${formatNumber(lab.query.y, 1)} ${yCol?.unit ?? ''}: the forest says it ${predictedName}. Arrow keys move it.`}
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
      </g>
    </svg>
  </div>

  <!-- Every tree as a small map: one tab stop, arrow keys walk through them -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <svg
    class="trees"
    viewBox={`0 0 ${width} ${Math.max(1, thumbsH)}`}
    width="100%"
    height={Math.max(1, thumbsH)}
    role="group"
    aria-label={`${lab.trees.length} trees. Use the arrow keys to move between them.`}
    tabindex="0"
    onkeydown={treesKey}
    onfocus={() => {
      treesFocused = true;
    }}
    onblur={() => {
      treesFocused = false;
    }}
    onpointerover={(event) => {
      const id = treeId(event);
      if (id !== null && event.pointerType === 'mouse') {
        lab.select({ kind: 'item', id, source: 'graph' });
      }
    }}
    onpointerout={(event) => {
      const id = treeId(event);
      if (id !== null && event.pointerType === 'mouse') lab.release('item', id);
    }}
    onclick={(event) => {
      const id = treeId(event);
      if (id === null) return;
      if (tree?.id === id && event.pointerType !== 'mouse') lab.select(null);
      else lab.select({ kind: 'item', id, source: 'graph' });
    }}
  >
    {#each lab.trees as t, i (t.id)}
      {@const at = thumbAt(i)}
      {@const vote = lab.classIndex(lab.votes[t.id] ?? '')}
      <g
        class="thumb"
        transform={`translate(${at.x} ${at.y})`}
        data-id={t.id}
        data-selected={t.id === tree?.id ? '' : undefined}
      >
        <rect class="thumb__bg" width={thumb} height={thumb} rx="4" />
        {#each leaves(t.root) as leaf (leaf.path)}
          {@const r = box(leaf, tx, ty)}
          <rect
            class={`thumb__leaf leaf--${lab.classIndex(leaf.prediction)}`}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
          />
        {/each}
        <path
          class={`thumb__query query__mark--${vote}`}
          d={diamond(tx(lab.query.x), ty(lab.query.y), 5)}
        />
        <rect
          class={`thumb__frame thumb__frame--${vote}`}
          width={thumb}
          height={thumb}
          rx="4"
        />
        <text class="thumb__id num" x="6" y="15">{t.id}</text>
      </g>
    {/each}
    {#if treesFocused}
      <rect
        class="trees__focus"
        x="-3"
        y="-3"
        width={width + 6}
        height={thumbsH - gap + 6}
        rx="6"
      />
    {/if}
  </svg>
  <p class="visually-hidden" id="forest-graph-summary">{summary}</p>
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

  .graph__frame svg {
    position: absolute;
    inset: 0;
    overflow: visible;
    cursor: crosshair;
  }

  .area {
    shape-rendering: crispedges;
  }

  .leaf {
    stroke: var(--c-text);
    stroke-opacity: 0.35;
  }

  .leaf--1 {
    fill: color-mix(in srgb, var(--c-class-1) 16%, var(--c-bg));
  }

  .leaf--2 {
    fill: color-mix(in srgb, var(--c-class-2) 16%, var(--c-bg));
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

  /* Seeds the picked tree never drew: hollow. */
  .point--unseen {
    fill: var(--c-bg);
    stroke-width: 2;
  }

  .point--unseen.point--1 {
    stroke: var(--c-class-1);
  }

  .point--unseen.point--2 {
    stroke: var(--c-class-2);
  }

  .draws {
    fill: var(--c-text);
    font-size: 11px;
    font-weight: 700;
    paint-order: stroke;
    stroke: var(--c-bg);
    stroke-width: 3px;
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

  .trees {
    display: block;
    margin-block-start: var(--s-4);
    overflow: visible;
    outline: none;
  }

  .trees__focus {
    fill: none;
    stroke: var(--c-focus);
    stroke-width: 2;
    stroke-dasharray: 6 4;
  }

  .thumb {
    cursor: pointer;
  }

  .thumb__bg {
    fill: var(--c-bg);
  }

  .thumb__leaf {
    stroke: var(--c-bg);
    stroke-width: 1;
  }

  .thumb__leaf.leaf--1 {
    fill: color-mix(in srgb, var(--c-class-1) 30%, var(--c-bg));
  }

  .thumb__leaf.leaf--2 {
    fill: color-mix(in srgb, var(--c-class-2) 30%, var(--c-bg));
  }

  .thumb__query {
    stroke: var(--c-text);
    stroke-width: 1.5;
  }

  .thumb__frame {
    fill: none;
    stroke-width: 2;
  }

  .thumb__frame--1 {
    stroke: var(--c-class-1);
  }

  .thumb__frame--2 {
    stroke: var(--c-class-2);
  }

  .thumb[data-selected] .thumb__frame {
    stroke: var(--c-text);
    stroke-width: 4;
  }

  .thumb__id {
    fill: var(--c-text);
    font-size: 11px;
    font-weight: 700;
    paint-order: stroke;
    stroke: var(--c-bg);
    stroke-width: 3px;
  }
</style>
