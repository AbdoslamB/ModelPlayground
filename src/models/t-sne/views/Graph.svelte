<!--
  The t-SNE graph: the map, with every point drawn as its own tiny picture,
  framed in the colour of its kind. The map has no units: only which
  pictures sit near each other matters, so the view zooms to fit. Picking a
  picture draws lines to its nearest pictures in pixels: solid if they are
  still among its nearest on the map, dashed if the map lost them.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { TsneLab } from '../store.svelte';

  import { scaleLinear } from '../../../lib/scales';

  let { lab }: { lab: TsneLab } = $props();

  let frame: HTMLDivElement | undefined = $state();
  let width = $state(560);
  let height = $state(560);
  let focused = $state(false);
  let summary = $state('');

  const narrow = $derived(width < 480);
  const thumb = $derived(narrow ? 18 : 24);
  const pad = $derived(thumb / 2 + 8);
  const size = $derived(lab.dataset.size);
  // Fit the map with the same scale across and up.
  const bounds = $derived.by(() => {
    const xs = lab.Y.map((p) => p[0]);
    const ys = lab.Y.map((p) => p[1]);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const half =
      Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
        1e-9,
      ) / 2;
    return {
      x: [cx - half, cx + half] as const,
      y: [cy - half, cy + half] as const,
    };
  });
  const x = $derived(scaleLinear(bounds.x, [pad, width - pad]));
  const y = $derived(scaleLinear(bounds.y, [height - pad, pad]));
  const selectedId = $derived(lab.selectedRow?.id ?? null);
  const links = $derived.by(() => {
    const row = lab.selectedRow;
    if (!row) return [];
    const i = lab.indexOf(row.id);
    return (lab.dataNearest[i] ?? []).map((j) => ({
      j,
      kept: lab.mapNearest[i]?.includes(j) ?? false,
    }));
  });

  /** The selected picture, enlarged beside its place on the map. */
  const tooltip = $derived.by(() => {
    const row = lab.selectedRow;
    if (!row) return null;
    const at = lab.Y[lab.indexOf(row.id)] ?? [0, 0];
    const left = (x(at[0]) / width) * 100;
    const top = (y(at[1]) / height) * 100;
    return {
      row,
      left: Math.min(82, Math.max(18, left)),
      top,
      below: top < 30,
    };
  });

  // Screen-reader summary, refreshed at most once per second.
  $effect(() => {
    const text = `Step ${lab.steps}. On average, ${Math.round(lab.keptShare * 100)}% of each picture's nearest pictures in pixels are also its nearest on the map.`;
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
      width = Math.max(240, Math.round(entry.contentRect.width));
      height = Math.max(240, Math.round(entry.contentRect.height));
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  });

  function pictureId(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    return id ? Number(id) : null;
  }

  // Keyboard: ←/→ walk through the pictures (left to right on the map),
  // Esc clears.
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
    const order = lab.rows
      .map((r, i) => ({ r, at: lab.Y[i] ?? [0, 0] }))
      .sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1])
      .map(({ r }) => r);
    const index = order.findIndex((r) => r.id === selectedId);
    const next =
      order[
        index === -1
          ? 0
          : Math.min(order.length - 1, Math.max(0, index + direction))
      ];
    if (next) lab.select({ kind: 'item', id: next.id, source: 'graph' });
  }
</script>

<div
  class="graph"
  role="group"
  aria-label="The t-SNE map: every tiny picture placed so that similar pictures sit close together"
  aria-describedby="tsne-graph-summary"
  data-view="graph"
>
  <div class="graph__frame" bind:this={frame}>
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
      <rect
        class="frame"
        x="0.5"
        y="0.5"
        width={width - 1}
        height={height - 1}
        rx="6"
      />

      <g aria-hidden="true">
        {#if lab.selectedRow}
          {@const from = lab.Y[lab.indexOf(lab.selectedRow.id)] ?? [0, 0]}
          {#each links as link (link.j)}
            {@const to = lab.Y[link.j] ?? [0, 0]}
            <line
              class="link"
              class:link--lost={!link.kept}
              x1={x(from[0])}
              y1={y(from[1])}
              x2={x(to[0])}
              y2={y(to[1])}
            />
          {/each}
        {/if}
      </g>

      <!-- Pictures: one tab stop, arrow keys walk through them -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <g
        class="points"
        role="group"
        aria-label={`${lab.rows.length} pictures. Use the left and right arrow keys to move between them.`}
        tabindex="0"
        onkeydown={onKey}
        onfocus={() => {
          focused = true;
        }}
        onblur={() => {
          focused = false;
        }}
        onpointerover={(event) => {
          const id = pictureId(event);
          if (id !== null && event.pointerType === 'mouse') {
            lab.select({ kind: 'item', id, source: 'graph' });
          }
        }}
        onpointerout={(event) => {
          const id = pictureId(event);
          if (id !== null && event.pointerType === 'mouse')
            lab.release('item', id);
        }}
        onclick={(event) => {
          const id = pictureId(event);
          if (id === null) return;
          if (selectedId === id && event.pointerType !== 'mouse')
            lab.select(null);
          else lab.select({ kind: 'item', id, source: 'graph' });
        }}
      >
        {#if focused}
          <rect
            class="points__focus"
            x="3"
            y="3"
            width={width - 6}
            height={height - 6}
            rx="6"
          />
        {/if}
        {#each lab.rows as row, i (row.id)}
          {@const at = lab.Y[i] ?? [0, 0]}
          {@const cell = thumb / size}
          <g
            class={`picture picture--${lab.kindIndex(row.kind)}`}
            transform={`translate(${x(at[0]) - thumb / 2} ${y(at[1]) - thumb / 2})`}
            data-id={row.id}
            data-selected={row.id === selectedId ? '' : undefined}
          >
            <rect class="picture__bg" width={thumb} height={thumb} />
            {#each row.pixels as value, p (p)}
              {#if value > 0}
                <rect
                  class="picture__ink"
                  x={(p % size) * cell}
                  y={Math.floor(p / size) * cell}
                  width={cell}
                  height={cell}
                  opacity={value / 16}
                />
              {/if}
            {/each}
            <rect class="picture__frame" width={thumb} height={thumb} />
          </g>
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
        <svg width="64" height="64" viewBox={`0 0 ${size} ${size}`}>
          <rect width={size} height={size} class="picture__bg" />
          {#each tooltip.row.pixels as value, p (p)}
            {#if value > 0}
              <rect
                class="picture__ink"
                x={p % size}
                y={Math.floor(p / size)}
                width="1"
                height="1"
                opacity={value / 16}
              />
            {/if}
          {/each}
        </svg>
        <span>
          <strong class={`sym-class-${lab.kindIndex(tooltip.row.kind)}`}
            >Picture {tooltip.row.id}</strong
          ><br />{lab.kindInfo(tooltip.row.kind)?.name}<br />kept {lab.kept[
            lab.indexOf(tooltip.row.id)
          ] ?? 0} of {lab.dataset.neighbours}
        </span>
      </div>
    {/if}
  </div>
  <p class="visually-hidden" id="tsne-graph-summary">{summary}</p>
</div>

<style>
  .graph {
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
    user-select: none;
  }

  svg {
    position: absolute;
    inset: 0;
    overflow: visible;
  }

  .frame {
    fill: none;
    stroke: var(--c-hairline);
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

  .link {
    stroke: var(--c-text);
    stroke-width: 2;
  }

  .link--lost {
    stroke-dasharray: 4 4;
    opacity: 0.6;
  }

  .picture {
    cursor: pointer;
  }

  .picture__bg {
    fill: var(--c-bg);
  }

  .picture__ink {
    fill: var(--c-text);
  }

  .picture__frame {
    fill: none;
    stroke-width: 2;
  }

  .picture--1 .picture__frame {
    stroke: var(--c-class-1);
  }

  .picture--2 .picture__frame {
    stroke: var(--c-class-2);
  }

  .picture--3 .picture__frame {
    stroke: var(--c-class-3);
  }

  .picture--4 .picture__frame {
    stroke: var(--c-class-4);
  }

  .picture[data-selected] .picture__frame {
    stroke: var(--c-text);
    stroke-width: 3.5;
  }

  .tooltip {
    position: absolute;
    display: flex;
    gap: var(--s-2);
    align-items: center;
    padding: 6px 10px 6px 6px;
    border: 1px solid var(--c-hairline);
    border-radius: var(--radius-control);
    background: var(--c-surface);
    box-shadow: var(--shadow-float);
    font-size: var(--fs-12);
    line-height: 1.4;
    white-space: nowrap;
    pointer-events: none;
    transform: translate(-50%, calc(-100% - 18px));
  }

  .tooltip svg {
    position: static;
    border: 1px solid var(--c-hairline);
    shape-rendering: crispedges;
  }

  .tooltip--below {
    transform: translate(-50%, 18px);
  }
</style>
