<!--
  The DQN graph. Above: the field, each square cut into four triangles
  tinted by the network's Q-values (green good, orange bad), an arrow for the
  best move, the dashed greedy path, and the mouse. The moves drawn from the
  replay buffer for the last update are curved arrows from s to s′ (a ring
  when the mouse bumped into the edge). Below: the reward of every episode.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { DqnLab } from '../store.svelte';

  import { formatNumber } from '../../../lib/format';
  import { scaleLinear } from '../../../lib/scales';
  import { ACTIONS, argmax } from '../math';

  let { lab }: { lab: DqnLab } = $props();

  let frame: HTMLDivElement | undefined = $state();
  let width = $state(560);
  let focused = $state(false);

  const columns = $derived(lab.world.columns);
  const rows = $derived(lab.world.rows);
  const pad = 22;
  const size = $derived(Math.min(96, (width - pad - 4) / columns));
  const fieldW = $derived(pad + columns * size);
  const left = $derived((width - fieldW) / 2);
  const fieldH = $derived(pad + rows * size);
  const chartTop = $derived(fieldH + 28);
  const chartH = 110;
  const height = $derived(chartTop + chartH + 34);
  const selectedId = $derived(lab.selectedDraw?.id ?? null);
  const scale = $derived(Math.max(1, lab.dataset.rewards.goal));

  function corner(cell: number) {
    return {
      x: left + pad + (cell % columns) * size,
      y: pad + Math.floor(cell / columns) * size,
    };
  }

  function centre(cell: number) {
    const c = corner(cell);
    return { x: c.x + size / 2, y: c.y + size / 2 };
  }

  function wedge(cell: number, action: number): string {
    const { x, y } = corner(cell);
    const m = { x: x + size / 2, y: y + size / 2 };
    const p = [
      [x, y, x + size, y],
      [x + size, y, x + size, y + size],
      [x + size, y + size, x, y + size],
      [x, y + size, x, y],
    ][action] ?? [0, 0, 0, 0];
    return `M${m.x},${m.y}L${p[0]},${p[1]}L${p[2]},${p[3]}Z`;
  }

  function tint(value: number): string {
    const strength = Math.round(Math.min(1, Math.abs(value) / scale) * 12) * 5;
    if (strength === 0) return 'var(--c-bg)';
    const role = value > 0 ? 'var(--c-class-2)' : 'var(--c-class-1)';
    return `color-mix(in srgb, ${role} ${strength}%, var(--c-bg))`;
  }

  function arrow(cell: number): string {
    const a = argmax(lab.Q[cell] ?? [0, 0, 0, 0]);
    const { x, y } = centre(cell);
    const r = size * 0.2;
    const [dx, dy] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ][a] ?? [0, 0];
    const tip = { x: x + dx * r, y: y + dy * r };
    const tail = { x: x - dx * r, y: y - dy * r };
    const side = { x: -dy * r * 0.55, y: dx * r * 0.55 };
    const back = { x: tip.x - dx * r * 0.7, y: tip.y - dy * r * 0.7 };
    return `M${tail.x},${tail.y}L${tip.x},${tip.y}M${back.x + side.x},${back.y + side.y}L${tip.x},${tip.y}L${back.x - side.x},${back.y - side.y}`;
  }

  /** A replayed move: a curved arrow from s to s′, or a ring if it stayed put. */
  function drawPath(cell: number, next: number, index: number): string {
    const a = centre(cell);
    if (cell === next) {
      const r = size * 0.16;
      const cy = a.y - size * 0.22;
      return `M${a.x - r},${cy}a${r},${r} 0 1,1 ${2 * r},0a${r},${r} 0 1,1 ${-2 * r},0`;
    }
    const b = centre(next);
    // Bend each arrow a little differently, so repeats can be told apart.
    const bend = size * (0.12 + 0.03 * (index % 4));
    const mx = (a.x + b.x) / 2 + ((b.y - a.y) / size) * bend;
    const my = (a.y + b.y) / 2 - ((b.x - a.x) / size) * bend;
    return `M${a.x},${a.y}Q${mx},${my} ${b.x},${b.y}`;
  }

  const mouse = $derived(centre(lab.training.position));
  const pathLine = $derived(
    lab.path.cells
      .map((cell, i) => {
        const c = centre(cell);
        return `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`;
      })
      .join(''),
  );

  // ── Reward per episode, and its average over the last 10.
  const episodes = $derived(lab.training.episodes);
  const ex = $derived(
    scaleLinear(
      [0, Math.max(10, episodes.length)],
      [left + pad, left + fieldW],
    ),
  );
  const ey = $derived(
    scaleLinear(
      [Math.min(-50, ...episodes), lab.dataset.rewards.goal],
      [chartTop + chartH, chartTop],
    ),
  );
  const rewardLine = $derived(
    episodes
      .map((r, i) => `${i === 0 ? 'M' : 'L'}${ex(i + 1)},${ey(r)}`)
      .join(''),
  );
  const averageLine = $derived(
    episodes
      .map((_, i) => {
        const recent = episodes.slice(Math.max(0, i - 9), i + 1);
        const mean = recent.reduce((t, r) => t + r, 0) / recent.length;
        return `${i === 0 ? 'M' : 'L'}${ex(i + 1)},${ey(mean)}`;
      })
      .join(''),
  );

  onMount(() => {
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width = Math.max(260, Math.round(entry.contentRect.width));
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  });

  function drawId(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    return id ? Number(id) : null;
  }

  // Keyboard on the replayed moves: ←/→ walk through them, Esc clears.
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
    const index = lab.draws.findIndex((d) => d.id === selectedId);
    const next =
      lab.draws[
        index === -1
          ? 0
          : Math.min(lab.draws.length - 1, Math.max(0, index + direction))
      ];
    if (next) lab.select({ kind: 'item', id: next.id, source: 'graph' });
  }
</script>

<div
  class="graph"
  role="group"
  aria-label="The field, tinted by the network's Q-values, with the moves it just learned from, and the reward of every episode"
  data-view="graph"
>
  <div class="graph__frame" bind:this={frame} style:height={`${height}px`}>
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" {height}>
      <g class="labels" aria-hidden="true">
        {#each Array.from({ length: columns }, (_, i) => i) as col (col)}
          <text
            x={left + pad + (col + 0.5) * size}
            y={pad - 7}
            text-anchor="middle">{String.fromCharCode(65 + col)}</text
          >
        {/each}
        {#each Array.from({ length: rows }, (_, i) => i) as row (row)}
          <text
            x={left + pad - 7}
            y={pad + (row + 0.5) * size + 4}
            text-anchor="end">{row + 1}</text
          >
        {/each}
      </g>

      <g aria-hidden="true">
        {#each Array.from({ length: columns * rows }, (_, i) => i) as cell (cell)}
          {@const kind = lab.kind(cell)}
          {@const c = corner(cell)}
          {#if kind === 'open' || kind === 'start'}
            {#each ACTIONS as action, a (action)}
              <path
                class="wedge"
                d={wedge(cell, a)}
                style:fill={tint(lab.Q[cell]?.[a] ?? 0)}
              />
            {/each}
            <path class="arrow" d={arrow(cell)} />
            {#if kind === 'start'}
              <text class="start" x={c.x + 5} y={c.y + 14}>start</text>
            {/if}
          {:else}
            <rect
              class={`block block--${kind}`}
              x={c.x}
              y={c.y}
              width={size}
              height={size}
            />
            {#if kind === 'goal'}
              <path
                class="icon icon--goal"
                d={`M${c.x + size * 0.25},${c.y + size * 0.68} L${c.x + size * 0.75},${c.y + size * 0.68} L${c.x + size * 0.75},${c.y + size * 0.42} Z`}
              />
            {:else}
              <path
                class="icon icon--cat"
                d={`M${c.x + size * 0.3},${c.y + size * 0.7} L${c.x + size * 0.3},${c.y + size * 0.3} L${c.x + size * 0.42},${c.y + size * 0.42} L${c.x + size * 0.58},${c.y + size * 0.42} L${c.x + size * 0.7},${c.y + size * 0.3} L${c.x + size * 0.7},${c.y + size * 0.7} Z`}
              />
            {/if}
          {/if}
          <rect class="outline" x={c.x} y={c.y} width={size} height={size} />
        {/each}
        <path class="path" d={pathLine} />
        <g class="mouse">
          <circle
            cx={mouse.x - size * 0.11}
            cy={mouse.y - size * 0.12}
            r={size * 0.07}
          />
          <circle
            cx={mouse.x + size * 0.11}
            cy={mouse.y - size * 0.12}
            r={size * 0.07}
          />
          <circle cx={mouse.x} cy={mouse.y} r={size * 0.13} />
        </g>
      </g>

      <!-- The replayed moves: one tab stop, arrow keys walk through them -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <g
        class="draws"
        role="group"
        aria-label={`${lab.draws.length} moves drawn from memory for the last update. Use the left and right arrow keys to move between them.`}
        tabindex="0"
        onkeydown={onKey}
        onfocus={() => {
          focused = true;
        }}
        onblur={() => {
          focused = false;
        }}
        onpointerover={(event) => {
          const id = drawId(event);
          if (id !== null && event.pointerType === 'mouse') {
            lab.select({ kind: 'item', id, source: 'graph' });
          }
        }}
        onpointerout={(event) => {
          const id = drawId(event);
          if (id !== null && event.pointerType === 'mouse')
            lab.release('item', id);
        }}
        onclick={(event) => {
          const id = drawId(event);
          if (id === null) return;
          if (selectedId === id && event.pointerType !== 'mouse')
            lab.select(null);
          else lab.select({ kind: 'item', id, source: 'graph' });
        }}
      >
        {#if focused}
          <rect
            class="draws__focus"
            x={left + pad + 2}
            y={pad + 2}
            width={columns * size - 4}
            height={rows * size - 4}
            rx="6"
          />
        {/if}
        {#each lab.draws as d, i (d.id)}
          {@const p = drawPath(d.cell, d.next, i)}
          <g
            class="draw"
            data-id={d.id}
            data-selected={d.id === selectedId ? '' : undefined}
          >
            <path class="draw__hit" d={p} />
            <path class="draw__line" d={p} marker-end="url(#dqn-head)" />
          </g>
        {/each}
      </g>
      <defs>
        <marker
          id="dqn-head"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0L10,5L0,10Z" class="draw__head" />
        </marker>
      </defs>

      <!-- Reward per episode -->
      <g class="chart" aria-hidden="true">
        <text class="chart__title" x={left + pad} y={chartTop - 10}
          >Reward per episode ({episodes.length} episodes)</text
        >
        <line
          class="chart__zero"
          x1={left + pad}
          x2={left + fieldW}
          y1={ey(0)}
          y2={ey(0)}
        />
        <text
          class="chart__tick"
          x={left + pad - 6}
          y={ey(0) + 4}
          text-anchor="end">0</text
        >
        <text
          class="chart__tick"
          x={left + pad - 6}
          y={ey(lab.dataset.rewards.goal) + 4}
          text-anchor="end">+{lab.dataset.rewards.goal}</text
        >
        <text
          class="chart__tick"
          x={left + pad - 6}
          y={ey(ey.domain[0]) + 4}
          text-anchor="end">{formatNumber(ey.domain[0], 0)}</text
        >
        <path class="chart__line" d={rewardLine} />
        <path class="chart__average" d={averageLine} />
        <text
          class="chart__tick"
          x={left + fieldW}
          y={chartTop + chartH + 16}
          text-anchor="end">episode {episodes.length}</text
        >
      </g>
    </svg>
  </div>
</div>

<style>
  .graph {
    width: min(100%, 560px);
    margin-inline: auto;
  }

  .graph__frame {
    position: relative;
    user-select: none;
  }

  svg {
    position: absolute;
    inset: 0;
    overflow: visible;
  }

  .labels text {
    fill: var(--c-muted);
    font-size: 12px;
    font-weight: 600;
  }

  .wedge {
    stroke: var(--c-hairline);
    stroke-width: 1;
  }

  .block--goal {
    fill: color-mix(in srgb, var(--c-class-2) 30%, var(--c-bg));
  }

  .block--cat {
    fill: color-mix(in srgb, var(--c-class-1) 30%, var(--c-bg));
  }

  .icon {
    stroke: var(--c-text);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }

  .icon--goal {
    fill: var(--c-class-2);
  }

  .icon--cat {
    fill: var(--c-class-1);
  }

  .start {
    fill: var(--c-muted);
    font-size: 11px;
    font-weight: 600;
  }

  .outline {
    fill: none;
    stroke: var(--c-control-edge);
    stroke-width: 1;
  }

  .arrow {
    fill: none;
    stroke: var(--c-text);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.6;
  }

  .path {
    fill: none;
    stroke: var(--c-line);
    stroke-width: 3;
    stroke-dasharray: 6 5;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.8;
  }

  .mouse circle {
    fill: var(--c-text);
    stroke: var(--c-bg);
    stroke-width: 1.5;
  }

  .draws {
    outline: none;
  }

  .draws__focus {
    fill: none;
    stroke: var(--c-focus);
    stroke-width: 2;
    stroke-dasharray: 6 4;
  }

  .draw {
    cursor: pointer;
  }

  .draw__hit {
    fill: none;
    stroke: transparent;
    stroke-width: 14;
  }

  .draw__line {
    fill: none;
    stroke: var(--c-a);
    stroke-width: 2.5;
    stroke-linecap: round;
  }

  .draw__head {
    fill: var(--c-a);
  }

  .draw[data-selected] .draw__line {
    stroke: var(--c-text);
    stroke-width: 4;
  }

  :global(.lab[data-highlight='L']) .draw__line {
    stroke-width: 4;
  }

  .chart__title {
    fill: var(--c-muted);
    font-size: 13px;
    font-weight: 600;
  }

  .chart__tick {
    fill: var(--c-muted);
    font-size: 11px;
  }

  .chart__zero {
    stroke: var(--c-control-edge);
  }

  .chart__line {
    fill: none;
    stroke: var(--c-muted);
    stroke-width: 1;
    opacity: 0.6;
  }

  .chart__average {
    fill: none;
    stroke: var(--c-line);
    stroke-width: 2.5;
  }
</style>
