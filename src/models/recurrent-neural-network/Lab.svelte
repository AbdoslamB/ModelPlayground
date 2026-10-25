<!--
  The Recurrent Neural Network Lab: the one island on the page. Graph,
  equation and table are linked through one selection (a time step), like
  every model's Lab.
-->
<script lang="ts">
  import type { TableColumn } from '../../ui/table';
  import type { Dataset } from './data';
  import type { TimeStep } from './store.svelte';

  import LabShell from '../../lab/LabShell.svelte';
  import { formatNumber } from '../../lib/format';
  import DataTable from '../../ui/DataTable.svelte';
  import MetricCard from '../../ui/MetricCard.svelte';
  import Slider from '../../ui/Slider.svelte';
  import { surprise, top } from './math';
  import { RnnLab } from './store.svelte';
  import Graph from './views/Graph.svelte';

  interface Props {
    dataset: Dataset;
    /** KaTeX HTML of the step and output formulas, rendered at build time. */
    formula: string;
  }

  let { dataset, formula }: Props = $props();

  // svelte-ignore state_referenced_locally
  const lab = new RnnLab(dataset);

  const alphabet = dataset.alphabet;
  const fmt = (value: number, decimals = 2) => formatNumber(value, decimals);
  const percent = (p: number) =>
    `${formatNumber(100 * p, p < 0.01 && p > 0 ? 1 : 0)}%`;
  /** Space and full stop shown so they can be seen. */
  const show = (char: string) => (char === ' ' ? '␣' : char);

  function best(s: TimeStep) {
    return top(s.probabilities, alphabet, 1)[0];
  }

  const shownBest = $derived(lab.shown ? best(lab.shown) : undefined);

  const columns: TableColumn<TimeStep>[] = $derived([
    { key: 'id', header: 'Step', decimals: 0, value: (s: TimeStep) => s.id },
    {
      key: 'read',
      header: 'Read',
      decimals: 0,
      value: (s: TimeStep) => s.index,
      text: (s: TimeStep) => show(s.char),
    },
    {
      key: 'guess',
      header: 'Best guess',
      decimals: 0,
      value: (s: TimeStep) => best(s)?.index ?? 0,
      text: (s: TimeStep) => show(best(s)?.char ?? ''),
    },
    {
      key: 'pguess',
      header: 'Its chance',
      decimals: 0,
      role: 'sym-line',
      highlight: 'T',
      value: (s: TimeStep) => best(s)?.p ?? 0,
      text: (s: TimeStep) => percent(best(s)?.p ?? 0),
    },
    {
      key: 'next',
      header: 'Really next',
      decimals: 0,
      value: (s: TimeStep) => s.next ?? -1,
      text: (s: TimeStep) =>
        s.next === null ? '–' : show(alphabet[s.next] ?? ''),
    },
    {
      key: 'surprise',
      header: 'Surprise',
      unit: 'bits',
      decimals: 1,
      role: 'sym-error',
      value: (s: TimeStep) =>
        s.next === null ? NaN : surprise(s.probabilities[s.next] ?? 0),
    },
  ]);
</script>

<LabShell label="Recurrent Neural Network Lab" highlight={lab.highlight}>
  {#snippet key()}
    <div class="message">
      <label class="message__label" for="rnn-text">Text</label>
      <input
        id="rnn-text"
        class="message__box"
        type="text"
        maxlength="60"
        spellcheck="false"
        autocomplete="off"
        value={lab.text}
        oninput={(event) => {
          lab.setText(event.currentTarget.value);
        }}
      />
      {#if lab.encoded.skipped.length > 0}
        <p class="message__note">
          Skipped (not in the network's alphabet): {[
            ...new Set(lab.encoded.skipped),
          ].join(' ')}
        </p>
      {/if}
    </div>
    <ul class="key">
      <li>
        <span class="key__swatch key__swatch--plus" aria-hidden="true"
        ></span>memory above 0
      </li>
      <li>
        <span class="key__swatch key__swatch--minus" aria-hidden="true"
        ></span>memory below 0
      </li>
      <li><span class="key__sym sym-line">T</span>temperature</li>
    </ul>
  {/snippet}

  {#snippet tools()}
    <button
      type="button"
      class="button button--primary"
      disabled={lab.full || lab.steps.length === 0}
      onclick={() => {
        lab.write();
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M3 13h3l7-7-3-3-7 7Z M9 4l3 3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
      <span class="tool-label">Write</span>
    </button>
    <span class="tools__spacer"></span>
    <button
      type="button"
      class="button"
      onclick={() => {
        lab.nextExample();
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
      <span class="tool-label">Next Sentence</span>
    </button>
    <button
      type="button"
      class="button button--quiet"
      disabled={lab.text === (dataset.examples[lab.exampleIndex] ?? '') &&
        lab.temperature === dataset.temperature.initial}
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
      {#if lab.shown && shownBest}
        {@const s = lab.shown}
        <p class="equation__live num" data-live="step">
          Step {s.id}: read “{show(s.char)}”. The memory h<sub>{s.id}</sub>
          holds
          {dataset.hidden} numbers, from {fmt(Math.min(...s.hidden))} to {fmt(
            Math.max(...s.hidden),
          )}.
        </p>
        <p class="equation__live num" data-live="next">
          Best guess “{show(shownBest.char)}”: score z = {fmt(
            s.logits[shownBest.index] ?? NaN,
          )}, and with <span class="sym-line">T</span> = {fmt(
            lab.temperature,
            1,
          )}
          its chance is <strong>{percent(shownBest.p)}</strong>.
        </p>
        {#if s.next !== null}
          {@const p = s.probabilities[s.next] ?? 0}
          <p class="equation__note num" data-live="actual">
            The next character really is “{show(alphabet[s.next] ?? '')}”:
            chance
            {percent(p)}, a surprise of
            <span class="sym-error">{fmt(surprise(p), 1)} bits</span>.
          </p>
        {/if}
      {:else}
        <p class="equation__live" data-live="step">
          Type something for the network to read.
        </p>
      {/if}
    </div>
  {/snippet}

  {#snippet controls()}
    <div class="controls">
      <Slider
        id="slider-temperature"
        symbol="T"
        role="line"
        label={`T, the temperature: ${fmt(lab.temperature, 1)}`}
        value={lab.temperature}
        min={dataset.temperature.min}
        max={dataset.temperature.max}
        step={dataset.temperature.step}
        onchange={(value) => {
          lab.setTemperature(value);
        }}
        onfocuschange={(focused) => {
          if (focused) lab.select({ kind: 'symbol', id: 'T' });
          else lab.release('symbol', 'T');
        }}
      />
      <MetricCard
        compact
        title="Surprise per character"
        value={fmt(lab.averageSurprise, 1)}
        unit="bits"
        detail=""
        position={Math.min(1, lab.averageSurprise / lab.blindSurprise)}
        label={`A blind guess: ${fmt(lab.blindSurprise, 1)} bits`}
        offScale={false}
        best={false}
      />
    </div>
  {/snippet}

  {#snippet table()}
    <div data-view="table">
      <DataTable
        caption={`The ${lab.steps.length} steps: what the network read, and what it expected next.`}
        rows={lab.steps}
        {columns}
        rowClass={(s) => (s === lab.shown ? 'is-active' : undefined)}
        selectedId={lab.selectedStep?.id ?? null}
        onselect={(id) => {
          lab.select(
            id === null ? null : { kind: 'item', id, source: 'table' },
          );
        }}
        onhighlight={(symbol) => {
          if (symbol === 'T') lab.select({ kind: 'symbol', id: 'T' });
          else lab.release('symbol', 'T');
        }}
        describe={(s) =>
          `Step ${s.id}: read ${s.char === ' ' ? 'a space' : s.char}; best guess ${best(s)?.char === ' ' ? 'a space' : (best(s)?.char ?? '')}, ${percent(best(s)?.p ?? 0)}`}
      />
    </div>
  {/snippet}
</LabShell>

<style>
  .message {
    display: grid;
    gap: var(--s-1);
    margin-block-end: var(--s-3);
  }

  .message__label {
    color: var(--c-muted);
    font-size: var(--fs-14);
    font-weight: 600;
  }

  .message__box {
    width: 100%;
    min-height: 44px;
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--c-control-edge);
    border-radius: var(--radius-control);
    background: var(--c-surface);
    color: var(--c-text);
    font-family: var(--font-code);
    font-size: var(--fs-18);
  }

  .message__box:focus-visible {
    outline: 2px solid var(--c-focus);
    outline-offset: 1px;
  }

  .message__note {
    color: var(--c-muted);
    font-size: var(--fs-14);
  }

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

  .key__swatch {
    width: 14px;
    height: 14px;
    border-radius: 2px;
  }

  .key__swatch--plus {
    background: color-mix(in srgb, var(--c-class-3) 70%, var(--c-bg));
  }

  .key__swatch--minus {
    background: color-mix(in srgb, var(--c-class-1) 70%, var(--c-bg));
  }

  .key__sym {
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

  :global(.lab[data-highlight='T']) .equation :global(.sym-line) {
    background: var(--c-highlight);
    box-shadow: inset 0 -2px 0 currentcolor;
  }

  .controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--s-6);
    align-items: center;
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
