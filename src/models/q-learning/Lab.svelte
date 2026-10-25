<!--
  The Q-Learning Lab: the one island on the page. Graph, equation and table
  are linked through one selection (a square), like every model's Lab.
-->
<script lang="ts">
  import type { TableColumn } from '../../ui/table';
  import type { Dataset } from './data';
  import type { Square } from './store.svelte';

  import LabShell from '../../lab/LabShell.svelte';
  import { formatNumber } from '../../lib/format';
  import DataTable from '../../ui/DataTable.svelte';
  import MetricCard from '../../ui/MetricCard.svelte';
  import PythonBox from '../../ui/PythonBox.svelte';
  import Slider from '../../ui/Slider.svelte';
  import { best } from './math';
  import { numpyPython, plainPython } from './python';
  import { QLab } from './store.svelte';
  import Graph from './views/Graph.svelte';

  interface Props {
    dataset: Dataset;
    /** KaTeX HTML of the update rule, rendered at build time. */
    formula: string;
  }

  let { dataset, formula }: Props = $props();

  // svelte-ignore state_referenced_locally
  const lab = new QLab(dataset);

  const ARROWS = ['↑', '→', '↓', '←'];
  const fmt = (value: number, decimals = 2) => formatNumber(value, decimals);
  /** "+ 4.20" or "− 1.00", for the terms of a sum. */
  const term = (value: number) =>
    `${value < 0 ? '−' : '+'} ${fmt(Math.abs(value))}`;

  function bestMove(cell: number): string {
    const q = lab.Q[cell] ?? [0, 0, 0, 0];
    const top = best(q);
    return q.every((v) => v === top) ? '–' : (ARROWS[q.indexOf(top)] ?? '–');
  }

  // Play: one move every 90 ms until the training episodes run out.
  $effect(() => {
    if (!lab.playing) return;
    const timer = setInterval(() => {
      lab.step();
    }, 90);
    return () => {
      clearInterval(timer);
    };
  });

  const shown = $derived(
    lab.selectedSquare?.cell ?? lab.last?.cell ?? lab.world.start,
  );
  const pathSteps = $derived(lab.path.cells.length - 1);

  const columns: TableColumn<Square>[] = $derived([
    {
      key: 'cell',
      header: 'Square',
      decimals: 0,
      value: (s: Square) => s.cell,
      text: (s: Square) => lab.name(s.cell),
    },
    ...ARROWS.map((arrow, a) => ({
      key: `q${a}`,
      header: `Q ${arrow}`,
      decimals: 2,
      value: (s: Square) => lab.Q[s.cell]?.[a] ?? 0,
    })),
    {
      key: 'best',
      header: 'Best',
      decimals: 0,
      value: (s: Square) => {
        const q = lab.Q[s.cell] ?? [0, 0, 0, 0];
        return q.indexOf(best(q));
      },
      text: (s: Square) => bestMove(s.cell),
    },
  ]);

  // "Try it in Python": the Lab's training, replayed step by step.
  const python = $derived.by(() => {
    const data = {
      title: dataset.title,
      world: lab.world,
      rewards: dataset.rewards,
      params: lab.params,
      seed: dataset.seed,
      maxEpisodeSteps: dataset.maxEpisodeSteps,
      steps: lab.steps,
    };
    return [
      { id: 'numpy', label: 'With NumPy', code: numpyPython(data) },
      { id: 'plain', label: 'Plain Python', code: plainPython(data) },
    ];
  });
</script>

<LabShell label="Q-Learning Lab" highlight={lab.highlight}>
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
        <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true"
          ><line
            x1="1"
            y1="5"
            x2="19"
            y2="5"
            stroke="var(--c-line)"
            stroke-width="2.5"
            stroke-dasharray="4 3"
          /></svg
        >best path so far
      </li>
      <li>tap a square: wall, cat, open</li>
    </ul>
  {/snippet}

  {#snippet tools()}
    <button
      type="button"
      class="button"
      disabled={lab.done}
      onclick={() => {
        lab.playing = false;
        lab.step();
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
      disabled={lab.done}
      onclick={() => {
        lab.playing = !lab.playing;
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
      <span class="tool-label">{lab.playing ? 'Pause' : 'Play'}</span>
    </button>
    <span class="tools__spacer"></span>
    <button
      type="button"
      class="button"
      onclick={() => {
        lab.nextMaze();
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
      {#if lab.last}
        {@const u = lab.last}
        <p class="equation__live num" data-live="update">
          Q({lab.name(u.cell)}, {ARROWS[u.action]}) ← {fmt(u.before)} +
          <span class="sym-a">{fmt(lab.alpha)}</span> × ({fmt(u.reward, 0)}
          {#if u.done}
            − {fmt(u.before)}{:else}
            + <span class="sym-b">{fmt(lab.gamma)}</span> × {fmt(u.future)}
            {term(-u.before)}{/if}) =
          <strong>{fmt(u.after)}</strong>
        </p>
        <p class="equation__note" data-live="episode">
          Episode {lab.training.episode +
            (lab.training.position === lab.world.start ? 0 : 1)}: the mouse {u.explored
            ? 'tried a random move'
            : 'took its best move'}
          {ARROWS[u.action]} from {lab.name(u.cell)} to {lab.name(u.next)},
          reward {fmt(u.reward, 0)}{u.done
            ? u.next === lab.world.goal
              ? ': it found the cheese.'
              : ': the cat got it.'
            : '.'} It tries a random move with chance
          <span class="sym-error">ε = {fmt(lab.epsilon)}</span>.
        </p>
      {:else}
        <p class="equation__live" data-live="update">
          Nothing learned yet: every Q starts at 0.
        </p>
      {/if}
      <p class="equation__note num" data-live="square">
        {lab.name(shown)}: Q = {#each ARROWS as arrow, a (arrow)}{a > 0
            ? ', '
            : ''}{arrow}
          {fmt(lab.Q[shown]?.[a] ?? 0)}{/each}; best move {bestMove(shown)}
      </p>
    </div>
  {/snippet}

  {#snippet controls()}
    <div class="controls">
      <div class="sliders">
        <Slider
          id="slider-episodes"
          symbol="n"
          role="line"
          label={`n, episodes of training: ${lab.training.episode}`}
          value={Math.min(lab.training.episode, dataset.episodes.max)}
          min={dataset.episodes.min}
          max={dataset.episodes.max}
          step={dataset.episodes.step}
          onchange={(value) => {
            lab.playing = false;
            lab.setEpisodes(value);
          }}
          onfocuschange={(focused) => {
            if (focused) lab.select({ kind: 'symbol', id: 'n' });
            else lab.release('symbol', 'n');
          }}
        />
        <Slider
          id="slider-alpha"
          symbol="α"
          role="a"
          label={`α, the learning rate: ${fmt(lab.alpha)}`}
          value={lab.alpha}
          min={dataset.alpha.min}
          max={dataset.alpha.max}
          step={dataset.alpha.step}
          onchange={(value) => {
            lab.setParam('alpha', value);
          }}
          onfocuschange={(focused) => {
            if (focused) lab.select({ kind: 'symbol', id: 'alpha' });
            else lab.release('symbol', 'alpha');
          }}
        />
        <Slider
          id="slider-gamma"
          symbol="γ"
          role="b"
          label={`γ, how much the future counts: ${fmt(lab.gamma)}`}
          value={lab.gamma}
          min={dataset.gamma.min}
          max={dataset.gamma.max}
          step={dataset.gamma.step}
          onchange={(value) => {
            lab.setParam('gamma', value);
          }}
          onfocuschange={(focused) => {
            if (focused) lab.select({ kind: 'symbol', id: 'gamma' });
            else lab.release('symbol', 'gamma');
          }}
        />
        <Slider
          id="slider-epsilon"
          symbol="ε"
          role="error"
          label={`ε, how often the mouse tries a random move: ${fmt(lab.epsilon)}`}
          value={lab.epsilon}
          min={dataset.epsilon.min}
          max={dataset.epsilon.max}
          step={dataset.epsilon.step}
          onchange={(value) => {
            lab.setParam('epsilon', value);
          }}
          onfocuschange={(focused) => {
            if (focused) lab.select({ kind: 'symbol', id: 'epsilon' });
            else lab.release('symbol', 'epsilon');
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
        label={lab.shortest === null
          ? 'The cheese cannot be reached safely'
          : `Shortest possible: ${lab.shortest} steps`}
        offScale={false}
        best={false}
      />
    </div>
  {/snippet}

  {#snippet table()}
    <div data-view="table">
      <DataTable
        caption={`The Q-table after ${lab.training.episode} episodes.`}
        rows={lab.squares}
        {columns}
        rowClass={(s) => (lab.last?.cell === s.cell ? 'is-active' : undefined)}
        selectedId={lab.selectedSquare?.id ?? null}
        onselect={(id) => {
          lab.select(
            id === null ? null : { kind: 'item', id, source: 'table' },
          );
        }}
        describe={(s) =>
          `${lab.name(s.cell)}: ${ARROWS.map((arrow, a) => `${arrow} ${fmt(lab.Q[s.cell]?.[a] ?? 0)}`).join(', ')}; best move ${bestMove(s.cell)}`}
      />
    </div>
  {/snippet}
</LabShell>

<PythonBox
  programs={python}
  lead="The Lab's maze, α, γ, ε and training so far, replayed in Python with the Lab's own random numbers, so the Q-values match the Lab's. NumPy keeps the Q-table in an array; Plain Python in lists."
/>

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
    font-size: var(--fs-16);
    font-weight: 500;
  }

  .equation__note {
    max-width: 56ch;
    color: var(--c-muted);
    font-size: var(--fs-14);
  }

  :global(.lab[data-highlight='alpha']) .equation :global(.sym-a),
  :global(.lab[data-highlight='gamma']) .equation :global(.sym-b) {
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
