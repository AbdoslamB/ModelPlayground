<!--
  The Deep Q-Network Lab: the one island on the page. Graph, equation and
  table are linked through one selection (a move drawn from the replay
  buffer), like every model's Lab.
-->
<script lang="ts">
  import type { TableColumn } from '../../ui/table';
  import type { Dataset } from './data';
  import type { Draw } from './store.svelte';

  import LabShell from '../../lab/LabShell.svelte';
  import { formatNumber } from '../../lib/format';
  import DataTable from '../../ui/DataTable.svelte';
  import MetricCard from '../../ui/MetricCard.svelte';
  import Slider from '../../ui/Slider.svelte';
  import { DqnLab } from './store.svelte';
  import Graph from './views/Graph.svelte';

  interface Props {
    dataset: Dataset;
    /** KaTeX HTML of the loss, rendered at build time. */
    formula: string;
  }

  let { dataset, formula }: Props = $props();

  // svelte-ignore state_referenced_locally
  const lab = new DqnLab(dataset);

  const ARROWS = ['↑', '→', '↓', '←'];
  const fmt = (value: number, decimals = 2) => formatNumber(value, decimals);
  const gamma = dataset.settings.gamma;

  // Play: ten training steps every 30 ms, until the end.
  $effect(() => {
    if (!lab.playing) return;
    const timer = setInterval(() => {
      lab.advanceBy(10);
    }, 30);
    return () => {
      clearInterval(timer);
    };
  });

  const shown = $derived(lab.selectedDraw ?? lab.draws[0]);
  const pathSteps = $derived(lab.path.cells.length - 1);

  const columns: TableColumn<Draw>[] = $derived([
    { key: 'id', header: '#', decimals: 0, value: (d: Draw) => d.id },
    {
      key: 'from',
      header: 'From',
      decimals: 0,
      value: (d: Draw) => d.cell,
      text: (d: Draw) => lab.name(d.cell),
    },
    {
      key: 'move',
      header: 'Move',
      decimals: 0,
      value: (d: Draw) => d.action,
      text: (d: Draw) => ARROWS[d.action] ?? '',
    },
    { key: 'r', header: 'r', decimals: 0, value: (d: Draw) => d.reward },
    {
      key: 'to',
      header: 'To',
      decimals: 0,
      value: (d: Draw) => d.next,
      text: (d: Draw) => lab.name(d.next),
    },
    {
      key: 'y',
      header: 'Target y',
      decimals: 2,
      role: 'sym-line',
      value: (d: Draw) => d.target,
    },
    {
      key: 'q',
      header: 'Q(s, a)',
      decimals: 2,
      value: (d: Draw) => d.prediction,
    },
    {
      key: 'error',
      header: 'Error',
      decimals: 2,
      role: 'sym-error',
      highlight: 'L',
      value: (d: Draw) => d.error,
    },
  ]);
</script>

<LabShell label="Deep Q-Network Lab" highlight={lab.highlight}>
  {#snippet key()}
    <ul class="key">
      <li>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
          ><path
            d="M3 12 13 12 13 5Z"
            fill="var(--c-class-2)"
            stroke="currentColor"
            stroke-width="1.2"
          /></svg
        >cheese, +{dataset.rewards.goal}
      </li>
      <li>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
          ><path
            d="M4 13V3l2.5 3h3L12 3v10Z"
            fill="var(--c-class-1)"
            stroke="currentColor"
            stroke-width="1.2"
          /></svg
        >cat, {fmt(dataset.rewards.cat, 0)}
      </li>
      <li>each step, {fmt(dataset.rewards.step, 0)}</li>
      <li>
        <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true"
          ><path
            d="M2 9Q11 0 20 9"
            fill="none"
            stroke="var(--c-a)"
            stroke-width="2.5"
          /></svg
        >a move recalled from memory
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
        lab.advanceBy(1);
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
            ? 'Train from the start'
            : 'Train'}</span
      >
    </button>
    <span class="tools__spacer"></span>
    <button
      type="button"
      class="button"
      onclick={() => {
        lab.nextWorld();
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
      disabled={lab.epsilon === dataset.epsilon.initial &&
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
      {#if shown}
        <p class="equation__live num" data-live="target">
          Move {shown.id}: {lab.name(shown.cell)}
          {ARROWS[shown.action]}
          {lab.name(shown.next)}, r = {fmt(shown.reward, 0)}.
          {#if shown.done}
            The episode ended, so <span class="sym-line">y</span> = r =
            <strong>{fmt(shown.target)}</strong>.
          {:else}
            <span class="sym-line">y</span> = {fmt(shown.reward, 0)} + {fmt(
              gamma,
            )} ×
            {fmt(shown.future)} =
            <strong>{fmt(shown.target)}</strong>.
          {/if}
        </p>
        <p class="equation__live num" data-live="loss">
          Q(s, a) = {fmt(shown.prediction)}, so L = ({fmt(shown.target)} − {fmt(
            shown.prediction,
          )})² =
          <strong class="sym-error">{fmt(shown.loss)}</strong>
        </p>
        <p class="equation__note num" data-live="batch">
          After step {lab.training.steps}: the network learned from {lab.draws
            .length} moves recalled from memory, average loss {fmt(
            lab.training.loss ?? NaN,
          )}. It tries a random move with chance
          <span class="sym-a">ε = {fmt(lab.epsilon)}</span>.
        </p>
      {:else}
        <p class="equation__live" data-live="target">
          Nothing learned yet: memory needs {dataset.settings.batch} moves first.
        </p>
      {/if}
    </div>
  {/snippet}

  {#snippet controls()}
    <div class="controls">
      <div class="sliders">
        <Slider
          id="slider-epsilon"
          symbol="ε"
          role="a"
          label={`ε, how often the mouse tries a random move: ${fmt(lab.epsilon)}`}
          value={lab.epsilon}
          min={dataset.epsilon.min}
          max={dataset.epsilon.max}
          step={dataset.epsilon.step}
          onchange={(value) => {
            lab.playing = false;
            lab.setEpsilon(value);
          }}
          onfocuschange={(focused) => {
            if (focused) lab.select({ kind: 'symbol', id: 'epsilon' });
            else lab.release('symbol', 'epsilon');
          }}
        />
        <Slider
          id="slider-steps"
          symbol="n"
          role="line"
          label={`n, training steps: ${lab.steps}`}
          value={lab.steps}
          min={dataset.steps.min}
          max={dataset.steps.max}
          step={dataset.steps.step}
          onchange={(value) => {
            lab.playing = false;
            lab.setSteps(value);
          }}
          onfocuschange={(focused) => {
            if (focused) lab.select({ kind: 'symbol', id: 'n' });
            else lab.release('symbol', 'n');
          }}
        />
      </div>
      <MetricCard
        compact
        tone="score"
        title="Best path from the start"
        value={lab.path.reached ? `${pathSteps} steps` : 'none yet'}
        unit=""
        detail=""
        position={lab.path.reached && lab.shortest
          ? lab.shortest / pathSteps
          : 0}
        label={`Shortest possible: ${lab.shortest ?? '–'} steps`}
        offScale={false}
        best={false}
      />
    </div>
  {/snippet}

  {#snippet table()}
    <div data-view="table">
      <DataTable
        caption={`The ${lab.draws.length} moves recalled for the last update.`}
        rows={lab.draws}
        {columns}
        rowClass={(d) => (d === shown ? 'is-active' : undefined)}
        selectedId={lab.selectedDraw?.id ?? null}
        onselect={(id) => {
          lab.select(
            id === null ? null : { kind: 'item', id, source: 'table' },
          );
        }}
        onhighlight={(symbol) => {
          if (symbol === 'L') lab.select({ kind: 'symbol', id: 'L' });
          else lab.release('symbol', 'L');
        }}
        describe={(d) =>
          `Move ${d.id}: from ${lab.name(d.cell)} ${['up', 'right', 'down', 'left'][d.action]} to ${lab.name(d.next)}, reward ${d.reward}; target ${fmt(d.target)}, the network said ${fmt(d.prediction)}`}
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
    max-width: 60ch;
    font-size: var(--fs-16);
    font-weight: 500;
  }

  .equation__note {
    max-width: 60ch;
    color: var(--c-muted);
    font-size: var(--fs-14);
  }

  :global(.lab[data-highlight='L']) .equation :global(.sym-error),
  :global(.lab[data-highlight='epsilon']) .equation :global(.sym-a) {
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
