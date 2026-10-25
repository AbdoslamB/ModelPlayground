<!--
  The t-SNE Lab: the one island on the page. Graph, equation and table are
  linked through one selection (a picture), like every model's Lab.
-->
<script lang="ts">
  import type { TableColumn } from '../../ui/table';
  import type { Dataset, Picture } from './data';

  import LabShell from '../../lab/LabShell.svelte';
  import { formatNumber } from '../../lib/format';
  import DataTable from '../../ui/DataTable.svelte';
  import MetricCard from '../../ui/MetricCard.svelte';
  import Slider from '../../ui/Slider.svelte';
  import { TsneLab } from './store.svelte';
  import Graph from './views/Graph.svelte';

  interface Props {
    dataset: Dataset;
    /** KaTeX HTML of the KL cost, rendered at build time. */
    formula: string;
  }

  let { dataset, formula }: Props = $props();

  // svelte-ignore state_referenced_locally
  const lab = new TsneLab(dataset);

  const k = dataset.neighbours;
  const fmt = (value: number, decimals = 2) => formatNumber(value, decimals);

  // Play: five optimiser steps every 30 ms, until the end.
  $effect(() => {
    if (!lab.playing) return;
    const timer = setInterval(() => {
      lab.advanceBy(5);
    }, 30);
    return () => {
      clearInterval(timer);
    };
  });

  const ref = $derived(lab.reference);
  const refIndex = $derived(ref ? lab.indexOf(ref.id) : -1);
  const refNear = $derived(
    (lab.dataNearest[refIndex] ?? []).map((j) => ({
      id: lab.rows[j]?.id ?? 0,
      kept: lab.mapNearest[refIndex]?.includes(j) ?? false,
    })),
  );

  function pixelsApart(row: Picture) {
    return Math.sqrt(lab.D[refIndex]?.[lab.indexOf(row.id)] ?? NaN);
  }

  function mapApart(row: Picture) {
    const a = lab.Y[refIndex];
    const b = lab.Y[lab.indexOf(row.id)];
    return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : NaN;
  }

  const columns: TableColumn<Picture>[] = $derived([
    { key: 'id', header: '#', decimals: 0, value: (r: Picture) => r.id },
    {
      key: 'kind',
      header: 'Kind',
      decimals: 0,
      value: (r: Picture) => lab.kindIndex(r.kind),
      text: (r: Picture) => lab.kindInfo(r.kind)?.name ?? r.kind,
    },
    {
      key: 'kept',
      header: `Kept (of ${k})`,
      decimals: 0,
      role: 'sym-line',
      value: (r: Picture) => lab.kept[lab.indexOf(r.id)] ?? 0,
    },
    {
      key: 'pixels',
      header: `Pixels from #${ref?.id ?? ''}`,
      decimals: 1,
      value: (r: Picture) => pixelsApart(r),
    },
    {
      key: 'map',
      header: `Map from #${ref?.id ?? ''}`,
      decimals: 1,
      value: (r: Picture) => mapApart(r),
    },
  ]);
</script>

<LabShell label="t-SNE Lab" highlight={lab.highlight}>
  {#snippet key()}
    <ul class="key">
      {#each dataset.kinds as kind, i (kind.id)}
        <li>
          <span class={`key__swatch key__swatch--${i + 1}`} aria-hidden="true"
          ></span>{kind.name}
        </li>
      {/each}
      <li>
        <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true"
          ><line
            x1="1"
            y1="5"
            x2="21"
            y2="5"
            stroke="currentColor"
            stroke-width="2"
            stroke-dasharray="4 3"
          /></svg
        >a near picture the map lost
      </li>
    </ul>
  {/snippet}

  {#snippet tools()}
    <button
      type="button"
      class="button"
      disabled={lab.done}
      onclick={() => {
        lab.playing = false;
        lab.advanceBy(10);
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 3v10l7-5Z M12.5 3v10"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
      <span class="tool-label">Step</span>
    </button>
    <button
      type="button"
      class="button button--primary"
      onclick={() => {
        if (lab.playing) lab.playing = false;
        else lab.play();
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        {#if lab.playing}
          <path
            d="M5 3v10M11 3v10"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          />
        {:else}
          <path d="M4.5 3v10l8-5Z" fill="currentColor" />
        {/if}
      </svg>
      <span class="tool-label"
        >{lab.playing
          ? 'Pause'
          : lab.done
            ? 'Play from the start'
            : 'Play'}</span
      >
    </button>
    <span class="tools__spacer"></span>
    <button
      type="button"
      class="button"
      onclick={() => {
        lab.nextBatch();
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="tool-label">Refresh Data</span>
    </button>
    <button
      type="button"
      class="button button--quiet"
      disabled={lab.perplexity === dataset.perplexity.initial &&
        lab.steps === dataset.steps.initial}
      onclick={() => {
        lab.reset();
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v3h3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="tool-label">Reset</span>
    </button>
  {/snippet}

  {#snippet graph()}
    <Graph {lab} />
  {/snippet}

  {#snippet equation()}
    <div class="equation" data-view="equation">
      <div class="equation__formula">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- KaTeX output built from our own TeX at build time -->
        {@html formula}
      </div>
      <p class="equation__live num" data-live="cost">
        Step <span class="sym-line">t</span> = {lab.steps}: KL(P ‖ Q) =
        <strong>{fmt(lab.cost, 3)}</strong>
        {#if lab.early}
          <span class="equation__note">
            (for the first {dataset.schedule.exaggeratedSteps} steps P counts ×{dataset
              .schedule.exaggeration}, to pull groups together early)</span
          >
        {/if}
      </p>
      {#if ref}
        <p class="equation__note num" data-live="picture">
          Picture {ref.id} ({lab.kindInfo(ref.kind)?.name}): with perplexity
          <span class="sym-a">u = {lab.perplexity}</span>, its neighbourhood is
          σ =
          {fmt(lab.sigma[refIndex] ?? NaN, 1)} wide. Its {k} nearest in pixels:
          {#each refNear as near, i (near.id)}{i > 0 ? ', ' : ''}<span
              class:lost={!near.kept}>{near.id}</span
            >{/each}; {refNear.filter((n) => n.kept).length} of them are still among
          its nearest on the map.
        </p>
      {/if}
    </div>
  {/snippet}

  {#snippet controls()}
    <div class="controls">
      <div class="sliders">
        <Slider
          id="slider-perplexity"
          symbol="u"
          role="a"
          label={`u, the perplexity: about how many neighbours each picture pays attention to: ${lab.perplexity}`}
          value={lab.perplexity}
          min={dataset.perplexity.min}
          max={dataset.perplexity.max}
          step={dataset.perplexity.step}
          onchange={(value) => {
            lab.setPerplexity(value);
          }}
          onfocuschange={(focused) => {
            if (focused) lab.select({ kind: 'symbol', id: 'perplexity' });
            else lab.release('symbol', 'perplexity');
          }}
        />
        <Slider
          id="slider-steps"
          symbol="t"
          role="line"
          label={`t, optimiser steps run: ${lab.steps}`}
          value={lab.steps}
          min={dataset.steps.min}
          max={dataset.steps.max}
          step={dataset.steps.step}
          onchange={(value) => {
            lab.playing = false;
            lab.setSteps(value);
          }}
          onfocuschange={(focused) => {
            if (focused) lab.select({ kind: 'symbol', id: 't' });
            else lab.release('symbol', 't');
          }}
        />
      </div>
      <MetricCard
        compact
        tone="score"
        title="Neighbours kept"
        value={`${formatNumber(100 * lab.keptShare, 0)}%`}
        unit=""
        detail=""
        position={lab.keptShare}
        label={`of each picture's ${k} nearest in pixels`}
        offScale={false}
        best={false}
      />
    </div>
  {/snippet}

  {#snippet table()}
    <div data-view="table">
      <DataTable
        caption={`The ${lab.rows.length} pictures, with distances from picture ${ref?.id ?? ''}.`}
        rows={lab.rows}
        {columns}
        rowClass={(row) =>
          refNear.some((n) => n.id === row.id) ? 'is-active' : undefined}
        selectedId={lab.selectedRow?.id ?? null}
        onselect={(id) => {
          lab.select(
            id === null ? null : { kind: 'item', id, source: 'table' },
          );
        }}
        describe={(row) =>
          `Picture ${row.id}, ${lab.kindInfo(row.kind)?.name}: ${lab.kept[lab.indexOf(row.id)] ?? 0} of its ${k} nearest kept on the map`}
      />
    </div>
  {/snippet}
</LabShell>

<style>
  .key {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1) var(--s-6);
    margin: 0;
    padding: 0;
    color: var(--c-muted);
    font-size: var(--fs-14);
    line-height: 1.5;
    list-style: none;
  }

  .key li {
    display: flex;
    gap: var(--s-2);
    align-items: center;
  }

  .key svg {
    display: inline-block;
  }

  .key__swatch {
    width: 12px;
    height: 12px;
    border: 2px solid;
    border-radius: 2px;
  }

  .key__swatch--1 {
    border-color: var(--c-class-1);
  }

  .key__swatch--2 {
    border-color: var(--c-class-2);
  }

  .key__swatch--3 {
    border-color: var(--c-class-3);
  }

  .key__swatch--4 {
    border-color: var(--c-class-4);
  }

  .tools__spacer {
    flex: 1;
  }

  .equation {
    display: grid;
    gap: var(--s-1);
    justify-items: center;
    text-align: center;
  }

  .equation__formula {
    max-width: 100%;
    overflow-x: auto;
    font-size: var(--fs-16);
  }

  .equation__live {
    font-size: var(--fs-16);
    font-weight: 500;
  }

  .equation__note {
    max-width: 58ch;
    color: var(--c-muted);
    font-size: var(--fs-14);
    font-weight: 400;
  }

  .lost {
    text-decoration: line-through;
  }

  :global(.lab[data-highlight='perplexity']) .equation :global(.sym-a),
  :global(.lab[data-highlight='t']) .equation :global(.sym-line) {
    background: var(--c-highlight);
    box-shadow: inset 0 -2px 0 currentcolor;
  }

  .controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--s-6);
    align-items: center;
  }

  .sliders {
    display: grid;
  }

  @container lab (width < 520px) {
    .key {
      gap: var(--s-1) var(--s-4);
    }

    .controls {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--s-2);
    }

    .tool-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    :global(.lab__tools .button) {
      width: 44px;
      padding: 0;
    }
  }
</style>
