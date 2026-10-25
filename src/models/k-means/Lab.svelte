<!--
  The k-Means Lab: the one island on the page. Graph, equation and table are
  linked through one selection, like every model's Lab.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { TableColumn } from '../../ui/table';
  import type { Dataset, Row } from './data';

  import LabShell from '../../lab/LabShell.svelte';
  import { formatNumber } from '../../lib/format';
  import DataTable from '../../ui/DataTable.svelte';
  import MetricCard from '../../ui/MetricCard.svelte';
  import Slider from '../../ui/Slider.svelte';
  import Toggle from '../../ui/Toggle.svelte';
  import { KmeansLab, STAND_NAMES } from './store.svelte';
  import Graph from './views/Graph.svelte';

  interface Props {
    dataset: Dataset;
    /** KaTeX HTML of the total-walk formula, rendered at build time. */
    formula: string;
  }

  let { dataset, formula }: Props = $props();

  // svelte-ignore state_referenced_locally
  const lab = new KmeansLab(dataset);

  /** The person the distances line explains: the selected one, or #1. */
  const shown = $derived(lab.selectedRow ?? lab.rows.find((r) => r.id === 1));
  const shownGroup = $derived(shown ? (lab.labelById[shown.id] ?? 0) : 0);

  const columns: TableColumn<Row>[] = $derived([
    { key: 'id', header: '#', decimals: 0, value: (r: Row) => r.id },
    {
      key: 'x',
      header: lab.xColumn?.short ?? 'x',
      unit: lab.xColumn?.unit,
      decimals: 1,
      value: (r: Row) => r.x,
    },
    {
      key: 'y',
      header: lab.yColumn?.short ?? 'y',
      unit: lab.yColumn?.unit,
      decimals: 1,
      value: (r: Row) => r.y,
    },
    {
      key: 'stand',
      header: 'Stand',
      decimals: 0,
      value: (r: Row) => lab.labelById[r.id] ?? 0,
      text: (r: Row) => STAND_NAMES[lab.labelById[r.id] ?? 0] ?? '',
    },
    {
      key: 'walk',
      header: 'Walk',
      unit: 'm',
      decimals: 1,
      role: 'sym-error',
      highlight: 'J',
      value: (r: Row) => lab.walks[r.id] ?? NaN,
    },
  ]);

  // Run: one step every half second until nothing moves.
  let running = $state(false);
  let timer = 0;
  function stop() {
    clearInterval(timer);
    running = false;
  }
  function run() {
    if (running) {
      stop();
      return;
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      while (!lab.settled && lab.steps < 100) lab.step();
      return;
    }
    running = true;
    lab.step();
    timer = window.setInterval(() => {
      if (lab.settled) stop();
      else lab.step();
    }, 500);
  }
  onMount(() => stop);

  const label = $derived(
    lab.settled
      ? lab.steps === 0
        ? 'Settled'
        : `Settled after ${lab.steps} ${lab.steps === 1 ? 'step' : 'steps'}`
      : lab.steps === 0
        ? 'Press Step or Run'
        : `After ${lab.steps} ${lab.steps === 1 ? 'step' : 'steps'}`,
  );
</script>

<LabShell label="k-Means Lab" highlight={lab.highlight}>
  {#snippet key()}
    <ul class="key">
      <li>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
          ><circle
            cx="8"
            cy="8"
            r="6"
            fill="var(--c-bg)"
            stroke="currentColor"
            stroke-width="2.5"
          /></svg
        >a stand: drag it
      </li>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
          ><circle cx="7" cy="7" r="4.5" fill="var(--c-data)" /></svg
        >a person, coloured by the stand they walk to
      </li>
      <li>
        <span class="key__sym">k</span>how many stands
      </li>
    </ul>
  {/snippet}

  {#snippet tools()}
    <Toggle
      label="Lines"
      checked={lab.showLines}
      onchange={(checked) => {
        lab.showLines = checked;
      }}
    />
    <Toggle
      label="Areas"
      checked={lab.showAreas}
      onchange={(checked) => {
        lab.showAreas = checked;
      }}
    />
    <span class="tools__spacer"></span>
    <button
      type="button"
      class="button"
      onclick={() => {
        stop();
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
      disabled={lab.steps === 0 &&
        lab.centres.every(
          (c, i) =>
            c.x === dataset.starts[i]?.x && c.y === dataset.starts[i]?.y,
        )}
      onclick={() => {
        stop();
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
      <span class="tool-label">Reset Stands</span>
    </button>
  {/snippet}

  {#snippet graph()}
    <Graph {lab} />
  {/snippet}

  {#snippet equation()}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="equation"
      data-view="equation"
      onpointerover={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.sym-error')
        ) {
          lab.select({ kind: 'symbol', id: 'J' });
        }
      }}
      onpointerout={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.sym-error')
        ) {
          lab.release('symbol', 'J');
        }
      }}
    >
      <div class="equation__formula">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- KaTeX output built from our own TeX at build time -->
        {@html formula}
      </div>
      {#if shown}
        <p class="equation__live num" data-live="distances">
          Person {shown.id}:
          {#each lab.distancesFor(shown) as walk, i (i)}
            {i > 0 ? ' · ' : ''}<span
              class={`sym-class-${i + 1}`}
              class:equation__own={i === shownGroup}
              >{STAND_NAMES[i]} {formatNumber(walk, 1)} m</span
            >
          {/each}
          → walks to
          <strong class={`sym-class-${shownGroup + 1}`}
            >{STAND_NAMES[shownGroup]}</strong
          >
        </p>
      {/if}
      <p class="equation__live num" data-live="total">
        <span class="sym-error">J</span> = {formatNumber(lab.total, 0)} m² → typical
        walk √(J ÷ {lab.rows.length}) =
        <strong class="sym-error">{formatNumber(lab.typicalWalk, 1)}</strong> m
      </p>
    </div>
  {/snippet}

  {#snippet controls()}
    <div class="controls">
      <Slider
        id="slider-k"
        symbol="k"
        role="line"
        label="k, the number of stands"
        value={lab.k}
        min={dataset.ks[0] ?? 2}
        max={dataset.ks.at(-1) ?? 4}
        step={1}
        onchange={(value) => {
          stop();
          lab.setK(value);
        }}
      />
      <div class="controls__buttons">
        <button
          type="button"
          class="button"
          disabled={lab.settled || running}
          onclick={() => {
            lab.step();
          }}
        >
          Step
        </button>
        <button
          type="button"
          class="button button--primary"
          disabled={lab.settled && !running}
          onclick={run}
        >
          {running ? 'Pause' : 'Run'}
        </button>
      </div>
      <div class="controls__metric">
        <MetricCard
          compact
          title="Typical walk"
          value={formatNumber(lab.typicalWalk, 1)}
          unit="m"
          detail=""
          position={Math.min(
            1,
            lab.typicalWalk / Math.max(1e-9, lab.startWalk),
          )}
          {label}
          offScale={false}
          best={lab.settled && lab.steps > 0}
        />
      </div>
    </div>
  {/snippet}

  {#snippet table()}
    <div data-view="table">
      <DataTable
        caption={`${dataset.title}: ${lab.rows.length} people, grouped by stand.`}
        rows={lab.rows}
        {columns}
        initialSort="stand"
        selectedId={lab.selectedRow?.id ?? null}
        onselect={(id) => {
          lab.select(
            id === null ? null : { kind: 'item', id, source: 'table' },
          );
        }}
        onhighlight={(symbol) => {
          if (symbol === 'J') lab.select({ kind: 'symbol', id: 'J' });
          else lab.release('symbol', 'J');
        }}
        describe={(row) =>
          `Person ${row.id}: ${formatNumber(row.x, 1)} m east, ${formatNumber(row.y, 1)} m north, walks ${formatNumber(lab.walks[row.id] ?? NaN, 1)} m to stand ${STAND_NAMES[lab.labelById[row.id] ?? 0] ?? ''}`}
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

  .key__sym {
    color: var(--c-line-ink);
    font-family: 'KaTeX_Math', 'Times New Roman', serif;
    font-size: var(--fs-18);
    font-style: italic;
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

  .equation__formula,
  .equation__live {
    font-size: var(--fs-16);
  }

  .equation__live {
    font-weight: 500;
  }

  .equation__own {
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .equation :global(.sym-error) {
    border-radius: 3px;
    cursor: help;
  }

  :global(.lab[data-highlight='J']) .equation :global(.sym-error) {
    background: var(--c-highlight);
    box-shadow: inset 0 -2px 0 currentcolor;
  }

  .controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: var(--s-6);
    align-items: center;
  }

  .controls__buttons {
    display: flex;
    gap: var(--s-2);
  }

  @container lab (width < 520px) {
    .key {
      gap: var(--s-1) var(--s-4);
    }

    .controls {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--s-2) var(--s-4);
    }

    .controls__metric {
      grid-column: 1 / -1;
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
