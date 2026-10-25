<!--
  The k-Means graph: people in the park, coloured and shaped by the stand
  they walk to; the stands as lettered rings you can drag; dashed arrows to
  where each stand moves next. On request, lines from people to their stand
  and the area each stand serves. The plot is square with one scale.
-->
<script lang="ts">
  import type { KmeansLab } from '../store.svelte';

  import Axes from '../../../charts/Axes.svelte';
  import { formatNumber } from '../../../lib/format';
  import { oncePerFrame } from '../../../lib/raf';
  import { scaleLinear } from '../../../lib/scales';
  import { AREA_GRID, STAND_NAMES } from '../store.svelte';

  let { lab }: { lab: KmeansLab } = $props();

  let frame: HTMLDivElement | undefined = $state();
  let svg: SVGSVGElement | undefined = $state();
  let width = $state(560);
  let height = $state(560);
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
  const xTicks = $derived(x.ticks(5));
  const yTicks = $derived(y.ticks(5));
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
    w: plot.width / AREA_GRID.columns,
    h: plot.height / AREA_GRID.lines,
  });
  const strips = $derived.by(() => {
    const result: {
      line: number;
      start: number;
      length: number;
      group: number;
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
            group: at(start) ?? 0,
          });
          start = column;
        }
      }
    }
    return result;
  });

  $effect(() => {
    const text = `${lab.rows.length} people and ${lab.k} stands. ${lab.centres
      .map(
        (c, i) =>
          `Stand ${STAND_NAMES[i] ?? ''} at ${formatNumber(c.x, 0)}, ${formatNumber(c.y, 0)} serves ${lab.groupSizes[i] ?? 0} people`,
      )
      .join(
        '; ',
      )}. Typical walk ${formatNumber(lab.typicalWalk, 1)} metres${lab.settled ? ', settled' : ''}.`;
    const timer = setTimeout(() => {
      summary = text;
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  });

  $effect(() => {
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

  // Dragging a stand. The SVG's position is read once per drag.
  let drag: { index: number; rect: DOMRect } | null = null;
  let dragging = $state<number | null>(null);

  const move = oncePerFrame((clientX: number, clientY: number) => {
    if (!drag) return;
    const { rect, index } = drag;
    lab.setCentre(
      index,
      x.invert(((clientX - rect.left) / rect.width) * width),
      y.invert(((clientY - rect.top) / rect.height) * height),
    );
  });

  function begin(event: PointerEvent, index: number) {
    if (!svg || event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    drag = { index, rect: svg.getBoundingClientRect() };
    dragging = index;
  }

  function end() {
    move.flush();
    drag = null;
    dragging = null;
  }

  // Keyboard on a stand: arrows move it 1 m (Shift: 5 m).
  function standKey(event: KeyboardEvent, index: number) {
    const step = event.shiftKey ? 5 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const delta = moves[event.key];
    const centre = lab.centres[index];
    if (!delta || !centre) return;
    event.preventDefault();
    lab.setCentre(index, centre.x + delta[0], centre.y + delta[1]);
  }

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
    const order = [...lab.rows].sort((p, q) => p.x - q.x || p.id - q.id);
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

  /** A marker shape per group, so groups differ by more than colour. */
  function shape(group: number, cx: number, cy: number, r: number): string {
    if (group === 1) {
      const h = r * 1.15;
      return `M${cx},${cy - h} L${cx + h * 0.95},${cy + h * 0.6} L${cx - h * 0.95},${cy + h * 0.6} Z`;
    }
    if (group === 2)
      return `M${cx - r},${cy - r} h${2 * r} v${2 * r} h${-2 * r} Z`;
    if (group === 3)
      return `M${cx},${cy - r * 1.2} L${cx + r * 1.2},${cy} L${cx},${cy + r * 1.2} L${cx - r * 1.2},${cy} Z`;
    return `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`;
  }

  const tooltip = $derived.by(() => {
    const row = lab.selectedRow;
    if (!row) return null;
    const group = lab.labelById[row.id] ?? 0;
    const top = (y(row.y) / height) * 100;
    return {
      row,
      group,
      left: Math.min(85, Math.max(15, (x(row.x) / width) * 100)),
      top,
      below: top < 22,
    };
  });
</script>

<div
  class="graph"
  role="group"
  aria-label="Map of the park: people and ice-cream stands"
  aria-describedby="kmeans-graph-summary"
  data-view="graph"
  data-dragging={dragging === null ? undefined : ''}
>
  <div class="graph__frame" bind:this={frame}>
    <svg
      bind:this={svg}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      onpointermove={(event) => {
        if (dragging !== null) move(event.clientX, event.clientY);
      }}
      onpointerup={end}
      onpointercancel={end}
    >
      <defs>
        <clipPath id="kmeans-plot-clip">
          <rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} />
        </clipPath>
        <marker
          id="kmeans-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 Z" class="arrow-head" />
        </marker>
      </defs>

      {#if lab.showAreas}
        <g class="areas" aria-hidden="true">
          {#each strips as strip (`${strip.line}-${strip.start}`)}
            <rect
              class={`area area--${strip.group + 1}`}
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

      <g clip-path="url(#kmeans-plot-clip)" aria-hidden="true">
        <!-- Walks: from each person to their stand -->
        {#if lab.showLines}
          {#each lab.rows as row, i (row.id)}
            {@const centre = lab.centres[lab.labels[i] ?? 0]}
            {#if centre}
              <line
                class={`walk walk--${(lab.labels[i] ?? 0) + 1}`}
                class:walk--selected={row.id === selectedId}
                x1={x(row.x)}
                y1={y(row.y)}
                x2={x(centre.x)}
                y2={y(centre.y)}
              />
            {/if}
          {/each}
        {/if}
        <!-- Where each stand moves next -->
        {#if !lab.settled}
          {#each lab.centres as centre, i (i)}
            {@const target = lab.next[i]}
            {#if target && Math.hypot(target.x - centre.x, target.y - centre.y) > 1}
              <line
                class="next"
                x1={x(centre.x)}
                y1={y(centre.y)}
                x2={x(target.x)}
                y2={y(target.y)}
                marker-end="url(#kmeans-arrow)"
              />
            {/if}
          {/each}
        {/if}
      </g>

      <!-- People: one tab stop, arrow keys walk through them -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <g
        class="points"
        role="group"
        aria-label={`${lab.rows.length} people in the park. Use the left and right arrow keys to move between them.`}
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
        {#each lab.rows as row, i (row.id)}
          {@const group = lab.labels[i] ?? 0}
          <path
            class={`point point--${group + 1}`}
            d={shape(
              group,
              x(row.x),
              y(row.y),
              row.id === selectedId ? 7.5 : 5.5,
            )}
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

      <!-- Stands: drag them, or move them with the arrow keys -->
      {#each lab.centres as centre, i (i)}
        <g
          class={`stand stand--${i + 1}`}
          role="button"
          tabindex="0"
          aria-roledescription="movable stand"
          aria-label={`Stand ${STAND_NAMES[i] ?? ''} at ${formatNumber(centre.x, 0)} m east, ${formatNumber(centre.y, 0)} m north, serving ${lab.groupSizes[i] ?? 0} people. Arrow keys move it.`}
          data-dragging={dragging === i ? '' : undefined}
          onpointerdown={(event) => {
            begin(event, i);
          }}
          onkeydown={(event) => {
            standKey(event, i);
          }}
        >
          <circle class="stand__hit" cx={x(centre.x)} cy={y(centre.y)} r="24" />
          <circle
            class="stand__ring"
            cx={x(centre.x)}
            cy={y(centre.y)}
            r="14"
          />
          <text
            class="stand__name"
            x={x(centre.x)}
            y={y(centre.y) + 5}
            text-anchor="middle"
          >
            {STAND_NAMES[i]}
          </text>
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
        <strong>Person {tooltip.row.id}</strong>
        <span
          >{formatNumber(tooltip.row.x, 0)} m east, {formatNumber(
            tooltip.row.y,
            0,
          )} m north</span
        >
        <span class={`sym-class-${tooltip.group + 1}`}
          >walks {formatNumber(lab.walks[tooltip.row.id] ?? NaN, 1)} m to stand {STAND_NAMES[
            tooltip.group
          ]}</span
        >
      </div>
    {/if}
  </div>
  <p class="visually-hidden" id="kmeans-graph-summary">{summary}</p>
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

  .area--3 {
    fill: color-mix(in srgb, var(--c-class-3) 12%, var(--c-bg));
  }

  .area--4 {
    fill: color-mix(in srgb, var(--c-class-4) 12%, var(--c-bg));
  }

  .walk {
    stroke-width: 1.2;
    opacity: 0.45;
  }

  .walk--1 {
    stroke: var(--c-class-1);
  }

  .walk--2 {
    stroke: var(--c-class-2);
  }

  .walk--3 {
    stroke: var(--c-class-3);
  }

  .walk--4 {
    stroke: var(--c-class-4);
  }

  .walk--selected {
    stroke-width: 3;
    opacity: 1;
  }

  :global(.lab[data-highlight='J']) .walk {
    stroke-width: 2.5;
    opacity: 0.8;
  }

  .next {
    stroke: var(--c-text);
    stroke-width: 2;
    stroke-dasharray: 5 4;
    opacity: 0.7;
  }

  .arrow-head {
    fill: var(--c-text);
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
    transition: fill var(--dur-ui);
  }

  .point--1 {
    fill: var(--c-class-1);
  }

  .point--2 {
    fill: var(--c-class-2);
  }

  .point--3 {
    fill: var(--c-class-3);
  }

  .point--4 {
    fill: var(--c-class-4);
  }

  .point[data-selected] {
    stroke: var(--c-text);
    stroke-width: 2.5;
  }

  .point__hit {
    fill: transparent;
    cursor: pointer;
  }

  .stand {
    cursor: grab;
    outline: none;
  }

  .stand[data-dragging] {
    cursor: grabbing;
  }

  .stand__hit {
    fill: transparent;
  }

  .stand__ring {
    fill: var(--c-bg);
    stroke-width: 4;
  }

  .stand--1 .stand__ring {
    stroke: var(--c-class-1);
  }

  .stand--2 .stand__ring {
    stroke: var(--c-class-2);
  }

  .stand--3 .stand__ring {
    stroke: var(--c-class-3);
  }

  .stand--4 .stand__ring {
    stroke: var(--c-class-4);
  }

  .stand:focus-visible .stand__ring {
    stroke: var(--c-focus);
    stroke-width: 5;
  }

  .stand__name {
    fill: var(--c-text);
    font-size: 15px;
    font-weight: 800;
    pointer-events: none;
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
