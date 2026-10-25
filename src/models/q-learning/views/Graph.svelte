<!--
  The Q-Learning graph: the maze, with each square cut into four triangles,
  one per move, tinted by its Q-value (green: good, orange: bad). An arrow
  shows each square's best move, a dashed line the path the mouse would take
  if it always picked its best move, and the triangle just updated is
  outlined. Clicking a square (or Enter) turns it into a wall, then a cat,
  then back.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { QLab } from '../store.svelte';

  import { ACTIONS, best } from '../math';

  let { lab }: { lab: QLab } = $props();

  let frame: HTMLDivElement | undefined = $state();
  let width = $state(560);
  let focused = $state(false);
  let cursor = $state<number | null>(null);

  const columns = $derived(lab.world.columns);
  const rows = $derived(lab.world.rows);
  const pad = 22;
  const size = $derived((width - pad - 4) / columns);
  const height = $derived(pad + rows * size + 4);
  const selectedCell = $derived(lab.selectedSquare?.cell ?? null);
  const scale = $derived(Math.max(1, lab.dataset.rewards.goal));

  function corner(cell: number) {
    return {
      x: pad + (cell % columns) * size,
      y: pad + Math.floor(cell / columns) * size,
    };
  }

  function centre(cell: number) {
    const c = corner(cell);
    return { x: c.x + size / 2, y: c.y + size / 2 };
  }

  /** The triangle of a square for one move: from the centre to that edge. */
  function wedge(cell: number, action: number): string {
    const { x, y } = corner(cell);
    const m = { x: x + size / 2, y: y + size / 2 };
    const points = [
      [x, y, x + size, y],
      [x + size, y, x + size, y + size],
      [x + size, y + size, x, y + size],
      [x, y + size, x, y],
    ][action] ?? [0, 0, 0, 0];
    return `M${m.x},${m.y}L${points[0]},${points[1]}L${points[2]},${points[3]}Z`;
  }

  /** Tint for a Q-value: green for good, orange for bad, stronger when bigger. */
  function tint(value: number): string {
    const strength = Math.round(Math.min(1, Math.abs(value) / scale) * 12) * 5;
    if (strength === 0) return 'var(--c-bg)';
    const role = value > 0 ? 'var(--c-class-2)' : 'var(--c-class-1)';
    return `color-mix(in srgb, ${role} ${strength}%, var(--c-bg))`;
  }

  /** The arrow for a square's best move, or nothing if all moves tie. */
  function arrow(cell: number): string | null {
    const q = lab.Q[cell] ?? [0, 0, 0, 0];
    const top = best(q);
    if (q.every((v) => v === top)) return null;
    const a = q.indexOf(top);
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

  const pathLine = $derived(
    lab.path.cells
      .map((cell, i) => {
        const c = centre(cell);
        return `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`;
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

  function selectCell(cell: number) {
    cursor = cell;
    const square = lab.squares.find((s) => s.cell === cell);
    lab.select(
      square ? { kind: 'item', id: square.id, source: 'graph' } : null,
    );
  }

  function cellAt(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const cell = target.closest('[data-cell]')?.getAttribute('data-cell');
    return cell ? Number(cell) : null;
  }

  // Keyboard: arrows move around the maze, Enter or Space changes the
  // square (wall, cat, open), Esc clears the selection.
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      lab.select(null);
      return;
    }
    const at = cursor ?? selectedCell;
    if ((event.key === 'Enter' || event.key === ' ') && at !== null) {
      event.preventDefault();
      lab.cycle(at);
      selectCell(at);
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowRight: [0, 1],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
    };
    const delta = moves[event.key];
    if (!delta) return;
    event.preventDefault();
    if (at === null) {
      selectCell(lab.world.start);
      return;
    }
    const row = Math.min(
      rows - 1,
      Math.max(0, Math.floor(at / columns) + delta[0]),
    );
    const col = Math.min(columns - 1, Math.max(0, (at % columns) + delta[1]));
    selectCell(row * columns + col);
  }
</script>

<div
  class="graph"
  role="group"
  aria-label="The maze, each square split into four moves tinted by their Q-values"
  data-view="graph"
>
  <div class="graph__frame" bind:this={frame} style:height={`${height}px`}>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      {height}
      role="group"
      aria-label={`Maze of ${columns} by ${rows} squares. Arrow keys move between squares; Enter turns a square into a wall, a cat, or back.`}
      tabindex="0"
      onkeydown={onKey}
      onfocus={() => {
        focused = true;
      }}
      onblur={() => {
        focused = false;
      }}
      onpointerover={(event) => {
        const cell = cellAt(event);
        if (cell !== null && event.pointerType === 'mouse') {
          const square = lab.squares.find((s) => s.cell === cell);
          if (square)
            lab.select({ kind: 'item', id: square.id, source: 'graph' });
        }
      }}
      onpointerout={(event) => {
        const cell = cellAt(event);
        if (cell !== null && event.pointerType === 'mouse')
          lab.release('item', cell + 1);
      }}
      onclick={(event) => {
        const cell = cellAt(event);
        if (cell === null) return;
        lab.cycle(cell);
        selectCell(cell);
      }}
    >
      <!-- Column letters and row numbers -->
      <g class="labels" aria-hidden="true">
        {#each Array.from({ length: columns }, (_, i) => i) as col (col)}
          <text x={pad + (col + 0.5) * size} y={pad - 7} text-anchor="middle"
            >{String.fromCharCode(65 + col)}</text
          >
        {/each}
        {#each Array.from({ length: rows }, (_, i) => i) as row (row)}
          <text x={pad - 7} y={pad + (row + 0.5) * size + 4} text-anchor="end"
            >{row + 1}</text
          >
        {/each}
      </g>

      {#each Array.from({ length: columns * rows }, (_, i) => i) as cell (cell)}
        {@const kind = lab.kind(cell)}
        {@const c = corner(cell)}
        {@const square = kind === 'open' || kind === 'start'}
        <g
          class={`cell cell--${kind}`}
          data-cell={cell}
          data-id={square ? cell + 1 : undefined}
          data-selected={square && cell === selectedCell ? '' : undefined}
        >
          {#if square}
            {#each ACTIONS as action, a (action)}
              <path
                class="wedge"
                class:wedge--last={lab.last?.cell === cell &&
                  lab.last.action === a}
                d={wedge(cell, a)}
                style:fill={tint(lab.Q[cell]?.[a] ?? 0)}
              />
            {/each}
            {@const d = arrow(cell)}
            {#if d}
              <path class="arrow" {d} />
            {/if}
          {:else}
            <rect class="block" x={c.x} y={c.y} width={size} height={size} />
          {/if}
          {#if kind === 'goal'}
            <path
              class="icon icon--goal"
              d={`M${c.x + size * 0.25},${c.y + size * 0.68} L${c.x + size * 0.75},${c.y + size * 0.68} L${c.x + size * 0.75},${c.y + size * 0.42} Z`}
            />
          {:else if kind === 'cat'}
            <path
              class="icon icon--cat"
              d={`M${c.x + size * 0.3},${c.y + size * 0.7} L${c.x + size * 0.3},${c.y + size * 0.3} L${c.x + size * 0.42},${c.y + size * 0.42} L${c.x + size * 0.58},${c.y + size * 0.42} L${c.x + size * 0.7},${c.y + size * 0.3} L${c.x + size * 0.7},${c.y + size * 0.7} Z`}
            />
          {:else if kind === 'start'}
            <text class="start" x={c.x + 5} y={c.y + 14}>start</text>
          {/if}
          <rect class="outline" x={c.x} y={c.y} width={size} height={size} />
        </g>
      {/each}

      <path class="path" d={pathLine} aria-hidden="true" />

      <!-- The mouse -->
      {#if lab.training.position !== undefined}
        {@const m = centre(lab.training.position)}
        <g class="mouse" aria-hidden="true">
          <circle
            cx={m.x - size * 0.11}
            cy={m.y - size * 0.12}
            r={size * 0.07}
          />
          <circle
            cx={m.x + size * 0.11}
            cy={m.y - size * 0.12}
            r={size * 0.07}
          />
          <circle cx={m.x} cy={m.y} r={size * 0.13} />
        </g>
      {/if}

      {#if cursor !== null && focused}
        {@const c = corner(cursor)}
        <rect
          class="cursor"
          x={c.x + 2}
          y={c.y + 2}
          width={size - 4}
          height={size - 4}
          rx="3"
        />
      {/if}
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
    outline: none;
  }

  .labels text {
    fill: var(--c-muted);
    font-size: 12px;
    font-weight: 600;
  }

  .cell {
    cursor: pointer;
  }

  .cell--start,
  .cell--goal {
    cursor: default;
  }

  .wedge {
    stroke: var(--c-hairline);
    stroke-width: 1;
    transition: fill var(--dur-ui);
  }

  .wedge--last {
    stroke: var(--c-focus);
    stroke-width: 3;
    stroke-linejoin: round;
  }

  .block {
    fill: var(--c-bg);
  }

  .cell--wall .block {
    fill: var(--c-muted);
  }

  .cell--goal .block {
    fill: color-mix(in srgb, var(--c-class-2) 30%, var(--c-bg));
  }

  .cell--cat .block {
    fill: color-mix(in srgb, var(--c-class-1) 30%, var(--c-bg));
  }

  .icon--goal {
    fill: var(--c-class-2);
    stroke: var(--c-text);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }

  .icon--cat {
    fill: var(--c-class-1);
    stroke: var(--c-text);
    stroke-width: 1.5;
    stroke-linejoin: round;
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
    pointer-events: none;
  }

  .cell[data-selected] .outline {
    stroke: var(--c-text);
    stroke-width: 3;
  }

  .arrow {
    fill: none;
    stroke: var(--c-text);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none;
  }

  .path {
    fill: none;
    stroke: var(--c-line);
    stroke-width: 3;
    stroke-dasharray: 6 5;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.8;
    pointer-events: none;
  }

  :global(.lab[data-highlight='n']) .path {
    stroke-width: 5;
  }

  .mouse circle {
    fill: var(--c-text);
    stroke: var(--c-bg);
    stroke-width: 1.5;
  }

  .cursor {
    fill: none;
    stroke: var(--c-focus);
    stroke-width: 2;
    stroke-dasharray: 5 3;
    pointer-events: none;
  }
</style>
