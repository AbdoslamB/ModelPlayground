<!--
  The Decision Tree graph: the days on a chart, cut into rectangles by the
  tree's questions, and the tree itself underneath. Each rectangle is a leaf,
  tinted with its answer. The node in focus has a dashed outline, and its
  split line can be dragged (or moved with the arrow keys).
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { TreeNode } from '../math';
  import type { TreeLab } from '../store.svelte';

  import Axes from '../../../charts/Axes.svelte';
  import { formatNumber } from '../../../lib/format';
  import { oncePerFrame } from '../../../lib/raf';
  import { scaleLinear } from '../../../lib/scales';
  import { THRESHOLD_STEP } from '../store.svelte';

  let { lab }: { lab: TreeLab } = $props();

  let frame: HTMLDivElement | undefined = $state();
  let svg: SVGSVGElement | undefined = $state();
  let width = $state(560);
  let height = $state(560);
  let pointsFocused = $state(false);
  let treeFocused = $state(false);
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
  const selectedId = $derived(lab.selectedRow?.id ?? null);
  const selectedLeaf = $derived(
    lab.selectedRow ? lab.leafById[lab.selectedRow.id] : undefined,
  );
  const focusNode = $derived(lab.focusNode);
  const internal = $derived(lab.nodes.filter((n) => n.split));
  const focusRect = $derived(rect(focusNode));

  function rect(node: TreeNode) {
    const x0 = x(node.box.x[0]);
    const x1 = x(node.box.x[1]);
    const y0 = y(node.box.y[1]);
    const y1 = y(node.box.y[0]);
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  /** The split line of a node, across its own box. */
  function splitLine(node: TreeNode) {
    const split = node.split;
    if (!split) return null;
    if (split.feature === 'x') {
      const at = x(split.threshold);
      return { x1: at, x2: at, y1: y(node.box.y[1]), y2: y(node.box.y[0]) };
    }
    const at = y(split.threshold);
    return { x1: x(node.box.x[0]), x2: x(node.box.x[1]), y1: at, y2: at };
  }

  const handle = $derived.by(() => {
    const line = splitLine(focusNode);
    return line
      ? { x: (line.x1 + line.x2) / 2, y: (line.y1 + line.y2) / 2 }
      : null;
  });

  // ── The tree diagram, laid out by hand: leaves evenly across, each parent
  // halfway between its children.
  const levelH = $derived(narrow ? 50 : 56);
  const treeH = $derived(lab.depth * levelH + 44);
  const nodePos = $derived.by(() => {
    const slot = plot.width / Math.max(1, lab.leaves.length);
    const pos: Record<string, { x: number; y: number }> = {};
    const place = (node: TreeNode): number => {
      const at =
        node.left && node.right
          ? (place(node.left) + place(node.right)) / 2
          : plot.x + ((lab.leafNumber[node.path] ?? 1) - 0.5) * slot;
      pos[node.path] = { x: at, y: 20 + node.depth * levelH };
      return at;
    };
    place(lab.tree);
    return pos;
  });

  function question(node: TreeNode): string {
    const split = node.split;
    if (!split) return '';
    const col = split.feature === 'x' ? xCol : yCol;
    const t = formatNumber(split.threshold, 1);
    return narrow
      ? `≤ ${t} ${col?.unit ?? ''}`
      : `${col?.short ?? split.feature} ≤ ${t} ${col?.unit ?? ''}`;
  }

  /** Paths from the root down to the selected day's leaf. */
  const onPath = $derived(
    selectedLeaf
      ? Array.from({ length: selectedLeaf.path.length + 1 }, (_, i) =>
          selectedLeaf.path.slice(0, i),
        )
      : [],
  );

  // Screen-reader summary, refreshed at most once per second.
  $effect(() => {
    const text = `The tree has ${lab.leaves.length} leaves and gets ${lab.right} of ${lab.rows.length} days right. ${
      focusNode.split
        ? `The node in focus asks: ${question(focusNode)}?`
        : 'The node in focus is a leaf.'
    }`;
    const timer = setTimeout(() => {
      summary = text;
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  });

  onMount(() => {
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

  // Dragging the split line of the node in focus. Clicking elsewhere on the
  // chart puts the leaf under the pointer in focus.
  let box: DOMRect | null = null;
  let dragging = $state(false);

  function toData(clientX: number, clientY: number, r: DOMRect) {
    return {
      x: x.invert(((clientX - r.left) / r.width) * width),
      y: y.invert(((clientY - r.top) / r.height) * height),
    };
  }

  const move = oncePerFrame((clientX: number, clientY: number) => {
    const split = focusNode.split;
    if (!box || !split) return;
    const point = toData(clientX, clientY, box);
    lab.setThreshold(point[split.feature]);
  });

  function begin(event: PointerEvent) {
    if (!svg || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-id]')) return;
    const line = target?.closest('[data-split]')?.getAttribute('data-split');
    if (line !== null && line !== undefined) {
      event.preventDefault();
      lab.focusOn(line);
      svg.setPointerCapture(event.pointerId);
      box = svg.getBoundingClientRect();
      dragging = true;
      return;
    }
    const r = svg.getBoundingClientRect();
    const point = toData(event.clientX, event.clientY, r);
    const inside =
      point.x >= axes.x[0] &&
      point.x <= axes.x[1] &&
      point.y >= axes.y[0] &&
      point.y <= axes.y[1];
    if (inside) {
      lab.focusOn(
        lab.leaves.find(
          (leaf) =>
            point.x >= leaf.box.x[0] &&
            point.x <= leaf.box.x[1] &&
            point.y >= leaf.box.y[0] &&
            point.y <= leaf.box.y[1],
        )?.path ?? '',
      );
    }
  }

  function end() {
    move.cancel();
    box = null;
    dragging = false;
  }

  // Keyboard on the split handle: arrows move it half a unit (Shift: 2).
  function handleKey(event: KeyboardEvent) {
    const split = focusNode.split;
    if (!split) return;
    const step = event.shiftKey ? 2 : THRESHOLD_STEP;
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? step
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -step
          : 0;
    if (!delta) return;
    event.preventDefault();
    lab.setThreshold(split.threshold + delta);
  }

  // Keyboard on the days: ←/→ walk through them, Esc clears.
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
    const order = [...lab.rows].sort((p, q) => p.x - q.x || p.y - q.y);
    const index = order.findIndex((r) => r.id === selectedId);
    const next =
      order[
        index === -1
          ? 0
          : Math.min(order.length - 1, Math.max(0, index + direction))
      ];
    if (next) lab.select({ kind: 'item', id: next.id, source: 'graph' });
  }

  // Keyboard on the tree: ↑ parent, ↓ the "yes" child, ←/→ along a level.
  function treeKey(event: KeyboardEvent) {
    const path = focusNode.path;
    const level = lab.nodes
      .filter((n) => n.depth === focusNode.depth)
      .map((n) => n.path);
    const at = level.indexOf(path);
    const moves: Record<string, string | undefined> = {
      ArrowUp: path.slice(0, -1),
      ArrowDown: focusNode.left ? `${path}L` : undefined,
      ArrowLeft: level[at - 1],
      ArrowRight: level[at + 1],
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = moves[event.key];
    if (next !== undefined) lab.focusOn(next);
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
</script>

<div
  class="graph"
  role="group"
  aria-label={`Days on a chart of ${yCol?.label.toLowerCase() ?? 'y'} against ${xCol?.label.toLowerCase() ?? 'x'}, cut into rectangles by the tree, with the tree below`}
  aria-describedby="tree-graph-summary"
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
        <clipPath id="tree-plot-clip">
          <rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} />
        </clipPath>
      </defs>

      <!-- Each leaf's rectangle, tinted with its answer -->
      {#if lab.showAreas}
        <g class="areas" aria-hidden="true">
          {#each lab.leaves as leaf (leaf.path)}
            {@const r = rect(leaf)}
            <rect
              class={`area area--${lab.classIndex(leaf.prediction)}`}
              x={r.x}
              y={r.y}
              width={Math.max(0, r.width)}
              height={Math.max(0, r.height)}
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

      <g clip-path="url(#tree-plot-clip)">
        <!-- The selected day's leaf, and the node in focus -->
        {#if selectedLeaf}
          {@const r = rect(selectedLeaf)}
          <rect
            class="leaf-mark"
            x={r.x}
            y={r.y}
            width={Math.max(0, r.width)}
            height={Math.max(0, r.height)}
            aria-hidden="true"
          />
        {/if}
        <rect
          class="focus-box"
          x={focusRect.x + 1}
          y={focusRect.y + 1}
          width={Math.max(0, focusRect.width - 2)}
          height={Math.max(0, focusRect.height - 2)}
          aria-hidden="true"
        />
        <!-- Split lines: each one cuts its own node's rectangle -->
        {#each internal as node (node.path)}
          {@const line = splitLine(node)}
          {#if line}
            <g
              class="split"
              class:split--focus={node === focusNode}
              data-split={node.path}
            >
              <line class="split__hit" {...line} />
              <line class="split__line" {...line} />
            </g>
          {/if}
        {/each}
      </g>

      <!-- Days: one tab stop, arrow keys walk through them -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <g
        class="points"
        role="group"
        aria-label={`${lab.rows.length} days. Use the left and right arrow keys to move between them.`}
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
          {@const wrong = lab.leafById[row.id]?.prediction !== row.label}
          {#if lab.classInfo(row.label)?.shape === 'triangle'}
            <path
              class={`point point--${index}`}
              class:point--wrong={wrong}
              d={triangle(x(row.x), y(row.y), r)}
              data-id={row.id}
              data-selected={row.id === selectedId ? '' : undefined}
            />
          {:else}
            <circle
              class={`point point--${index}`}
              class:point--wrong={wrong}
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
            r="12"
            data-id={row.id}
          />
        {/each}
      </g>

      <!-- The handle on the split line of the node in focus -->
      {#if handle && focusNode.split}
        <g
          class="handle"
          role="slider"
          tabindex="0"
          aria-label={`Split of the node in focus: ${question(focusNode)}. Arrow keys move it.`}
          aria-valuemin={focusNode.box[focusNode.split.feature][0]}
          aria-valuemax={focusNode.box[focusNode.split.feature][1]}
          aria-valuenow={focusNode.split.threshold}
          aria-orientation={focusNode.split.feature === 'x'
            ? 'horizontal'
            : 'vertical'}
          data-split={focusNode.path}
          onkeydown={handleKey}
        >
          <circle class="handle__ring" cx={handle.x} cy={handle.y} r="11" />
          <path
            class="handle__arrows"
            d={focusNode.split.feature === 'x'
              ? `M${handle.x - 5},${handle.y} h10 M${handle.x - 5},${handle.y} l3,-3 M${handle.x - 5},${handle.y} l3,3 M${handle.x + 5},${handle.y} l-3,-3 M${handle.x + 5},${handle.y} l-3,3`
              : `M${handle.x},${handle.y - 5} v10 M${handle.x},${handle.y - 5} l-3,3 M${handle.x},${handle.y - 5} l3,3 M${handle.x},${handle.y + 5} l-3,-3 M${handle.x},${handle.y + 5} l3,-3`}
          />
        </g>
      {/if}
    </svg>
  </div>

  <!-- The tree: questions in the boxes, answers in the leaves -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <svg
    class="tree"
    viewBox={`0 0 ${width} ${treeH}`}
    width="100%"
    height={treeH}
    role="group"
    aria-label={`The tree, ${lab.leaves.length} leaves. Arrow keys move the focus: up to the parent, down to the yes side, left and right along a level.`}
    tabindex="0"
    onkeydown={treeKey}
    onfocus={() => {
      treeFocused = true;
    }}
    onblur={() => {
      treeFocused = false;
    }}
  >
    {#each internal as node (node.path)}
      {@const from = nodePos[node.path]}
      {#each [node.left, node.right] as child, side (side)}
        {@const to = child ? nodePos[child.path] : undefined}
        {#if from && to}
          <line
            class="edge"
            class:edge--path={onPath.includes(child?.path ?? '-')}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
          />
          <text
            class="edge__label"
            x={(from.x + to.x) / 2 + (side === 0 ? -6 : 6)}
            y={(from.y + to.y) / 2 - 2}
            text-anchor={side === 0 ? 'end' : 'start'}
            >{side === 0 ? 'yes' : 'no'}</text
          >
        {/if}
      {/each}
    {/each}
    {#each lab.nodes as node (node.path)}
      {@const at = nodePos[node.path]}
      {#if at}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <g
          class="node"
          class:node--focus={node === focusNode}
          class:node--path={onPath.includes(node.path)}
          onclick={() => {
            lab.focusOn(node.path);
          }}
        >
          {#if node.split}
            {@const label = question(node)}
            {@const w = label.length * (narrow ? 6.4 : 7.2) + 14}
            <rect
              class="node__box"
              x={at.x - w / 2}
              y={at.y - 12}
              width={w}
              height="24"
              rx="12"
            />
            <text class="node__text" x={at.x} y={at.y + 4.5}>{label}</text>
          {:else}
            {@const index = lab.classIndex(node.prediction)}
            <rect
              class={`node__leaf node__leaf--${index}`}
              x={at.x - 17}
              y={at.y - 12}
              width="34"
              height="24"
              rx="6"
            />
            <text class="node__count num" x={at.x} y={at.y + 4.5}
              >{lab.leafNumber[node.path]}</text
            >
            <text class="node__days num" x={at.x} y={at.y + 26}
              >{node.rows.length}
              {node.rows.length === 1 ? 'day' : 'days'}</text
            >
          {/if}
        </g>
      {/if}
    {/each}
    {#if treeFocused}
      <rect
        class="tree__focus"
        x="2"
        y="2"
        width={width - 4}
        height={treeH - 4}
        rx="6"
      />
    {/if}
  </svg>
  <p class="visually-hidden" id="tree-graph-summary">{summary}</p>
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
    cursor: pointer;
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

  .leaf-mark {
    fill: var(--c-highlight);
    opacity: 0.7;
  }

  .focus-box {
    fill: none;
    stroke: var(--c-focus);
    stroke-width: 2;
    stroke-dasharray: 6 4;
    pointer-events: none;
  }

  .split__hit {
    stroke: transparent;
    stroke-width: 16;
    cursor: pointer;
  }

  .split__line {
    stroke: var(--c-text);
    stroke-width: 1.5;
    opacity: 0.6;
    pointer-events: none;
  }

  .split--focus .split__line {
    stroke-width: 3;
    opacity: 1;
  }

  .split--focus .split__hit {
    cursor: col-resize;
  }

  .graph[data-dragging] svg {
    cursor: grabbing;
  }

  .points {
    outline: none;
  }

  .points__focus,
  .tree__focus {
    fill: none;
    stroke: var(--c-focus);
    stroke-width: 2;
    stroke-dasharray: 6 4;
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

  /* Days the tree gets wrong get a dark ring. */
  .point--wrong {
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

  .handle {
    cursor: grab;
    outline: none;
  }

  .handle__ring {
    fill: var(--c-surface);
    stroke: var(--c-text);
    stroke-width: 2;
  }

  .handle__arrows {
    fill: none;
    stroke: var(--c-text);
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  .handle:focus-visible .handle__ring {
    stroke: var(--c-focus);
    stroke-width: 4;
  }

  .tree {
    display: block;
    margin-block-start: var(--s-3);
    overflow: visible;
    outline: none;
  }

  .edge {
    stroke: var(--c-control-edge);
    stroke-width: 1.5;
  }

  .edge--path {
    stroke: var(--c-text);
    stroke-width: 3;
  }

  .edge__label {
    fill: var(--c-muted);
    font-size: 11px;
  }

  .node {
    cursor: pointer;
  }

  .node__box {
    fill: var(--c-surface);
    stroke: var(--c-control-edge);
    stroke-width: 1.5;
  }

  .node__text,
  .node__count {
    fill: var(--c-text);
    font-size: 13px;
    font-weight: 600;
    text-anchor: middle;
  }

  .node__days {
    fill: var(--c-muted);
    font-size: 11px;
    text-anchor: middle;
  }

  .node__leaf--1 {
    fill: color-mix(in srgb, var(--c-class-1) 25%, var(--c-bg));
    stroke: var(--c-class-1);
    stroke-width: 2;
  }

  .node__leaf--2 {
    fill: color-mix(in srgb, var(--c-class-2) 25%, var(--c-bg));
    stroke: var(--c-class-2);
    stroke-width: 2;
  }

  .node--path .node__box {
    stroke: var(--c-text);
    stroke-width: 2.5;
  }

  .node--focus .node__box,
  .node--focus .node__leaf--1,
  .node--focus .node__leaf--2 {
    stroke: var(--c-focus);
    stroke-dasharray: 5 3;
    stroke-width: 2.5;
  }

  @container lab (width < 520px) {
    .node__text,
    .node__count {
      font-size: 12px;
    }
  }
</style>
