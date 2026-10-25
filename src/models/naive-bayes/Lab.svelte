<!--
  The Naive Bayes Lab: the one island on the page. Graph, equation and table
  are linked through one selection, like every model's Lab.
-->
<script lang="ts">
  import type { TableColumn } from '../../ui/table';
  import type { Dataset } from './data';
  import type { Label, Term } from './math';

  import LabShell from '../../lab/LabShell.svelte';
  import { formatNumber } from '../../lib/format';
  import DataTable from '../../ui/DataTable.svelte';
  import MetricCard from '../../ui/MetricCard.svelte';
  import Slider from '../../ui/Slider.svelte';
  import { BayesLab } from './store.svelte';
  import Graph from './views/Graph.svelte';

  interface Props {
    dataset: Dataset;
    /** KaTeX HTML of the total-evidence formula, rendered at build time. */
    formula: string;
  }

  let { dataset, formula }: Props = $props();

  // svelte-ignore state_referenced_locally
  const lab = new BayesLab(dataset);

  /** The word the chances line explains: the selected one, or the first seen. */
  const shown = $derived(
    (lab.selectedRow?.known ? lab.selectedRow : undefined) ??
      lab.rows.find((t) => t.known),
  );
  const chance = $derived(lab.reading.spamChance);
  const V = $derived(lab.model.vocabulary.length);

  const columns: TableColumn<Term>[] = $derived([
    {
      key: 'word',
      header: 'Word',
      decimals: 0,
      value: (t: Term) => t.order,
      text: (t: Term) => (t.times > 1 ? `${t.word} ×${t.times}` : t.word),
    },
    {
      key: 'spam',
      header: 'In spam',
      decimals: 0,
      role: 'sym-class-1',
      value: (t: Term) => lab.model.counts.spam.get(t.word) ?? 0,
    },
    {
      key: 'normal',
      header: 'In normal',
      decimals: 0,
      role: 'sym-class-2',
      value: (t: Term) => lab.model.counts.normal.get(t.word) ?? 0,
    },
    {
      key: 'pspam',
      header: 'P(w | spam)',
      decimals: 3,
      value: (t: Term) => (t.known ? lab.chance(t.word, 'spam') : NaN),
    },
    {
      key: 'pnormal',
      header: 'P(w | normal)',
      decimals: 3,
      value: (t: Term) => (t.known ? lab.chance(t.word, 'normal') : NaN),
    },
    {
      key: 'evidence',
      header: 'Adds to L',
      decimals: 2,
      role: 'sym-line',
      highlight: 'L',
      value: (t: Term) => t.contribution,
      text: (t: Term) =>
        !t.known ? 'ignored' : !t.counted ? 'off' : signed(t.contribution),
    },
  ]);

  /** A number with its sign, so "points to spam" (+) is always visible. */
  function signed(value: number, decimals = 2) {
    const text = formatNumber(value, decimals);
    return value > 0 && text !== formatNumber(0, decimals) ? `+${text}` : text;
  }

  /** A term of a sum: "+ 1.67" or "− 1.10", signed by its rounded value. */
  function addend(value: number) {
    const size = formatNumber(Math.abs(value), 2);
    const negative = value < 0 && size !== formatNumber(0, 2);
    return { text: `${negative ? '−' : '+'} ${size}`, side: negative ? 2 : 1 };
  }

  function percent(p: number) {
    return `${formatNumber(100 * p, p < 0.01 || p > 0.99 ? 1 : 0)}%`;
  }

  const verdict = $derived(
    chance >= 0.65
      ? 'Likely spam'
      : chance <= 0.35
        ? 'Likely normal'
        : 'Could be either',
  );
</script>

{#snippet chanceOf(word: string, label: Label)}
  {@const a = formatNumber(lab.alpha, 1)}
  <span class="chance"
    >P(<strong>{word}</strong> | {label}) = ({lab.model.counts[label].get(
      word,
    ) ?? 0} + <span class="sym-a">{a}</span>) ÷ ({lab.model.totals[label]} +
    <span class="sym-a">{a}</span> × {V}) = {formatNumber(
      lab.chance(word, label),
      3,
    )}</span
  >
{/snippet}

<LabShell label="Naive Bayes Lab" highlight={lab.highlight}>
  {#snippet key()}
    <div class="message">
      <label class="message__label" for="nb-message">Message</label>
      <textarea
        id="nb-message"
        class="message__box"
        rows="2"
        maxlength="200"
        spellcheck="false"
        value={lab.text}
        oninput={(event) => {
          lab.setText(event.currentTarget.value);
        }}></textarea>
    </div>
    <ul class="key">
      <li>
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"
          ><rect
            x="0"
            y="2"
            width="18"
            height="8"
            rx="2"
            fill="var(--c-class-1)"
          /></svg
        >points to spam
      </li>
      <li>
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"
          ><rect
            x="0"
            y="2"
            width="18"
            height="8"
            rx="2"
            fill="var(--c-class-2)"
          /></svg
        >points to normal
      </li>
      <li><span class="key__sym sym-line">L</span>total evidence</li>
      <li><span class="key__sym sym-a">α</span>smoothing</li>
    </ul>
  {/snippet}

  {#snippet tools()}
    <span class="tools__note">Pick a word to switch it off.</span>
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
      <span class="tool-label">Next Message</span>
    </button>
    <button
      type="button"
      class="button button--quiet"
      disabled={lab.isStart}
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
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="equation"
      data-view="equation"
      onpointerover={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.sym-line')
        ) {
          lab.select({ kind: 'symbol', id: 'L' });
        }
      }}
      onpointerout={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.sym-line')
        ) {
          lab.release('symbol', 'L');
        }
      }}
    >
      <div class="equation__formula">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- KaTeX output built from our own TeX at build time -->
        {@html formula}
      </div>
      <p class="equation__live num" data-live="odds">
        <span class="sym-line">L</span> =
        <span class={`sym-class-${lab.reading.prior >= 0 ? 1 : 2}`}
          >{signed(lab.reading.prior)}</span
        >
        <span class="equation__note">start</span>
        {#each lab.counted as term (term.id)}
          {@const part = addend(term.contribution)}
          <span
            class={`term sym-class-${part.side}`}
            class:term--selected={term.id === lab.selectedRow?.id}
            >{part.text}</span
          >
          <span class="equation__note">{term.word}</span>
        {/each}
        =
        <strong class="sym-line">{signed(lab.reading.logOdds)}</strong>
      </p>
      <p class="equation__live num" data-live="chance">
        P(spam) = 1 ÷ (1 + e<sup
          >{lab.reading.logOdds >= 0 ? '−' : ''}{formatNumber(
            Math.abs(lab.reading.logOdds),
            2,
          )}</sup
        >) =
        <strong class={`sym-class-${chance >= 0.5 ? 1 : 2}`}
          >{percent(chance)}</strong
        >
      </p>
      {#if shown}
        <p class="equation__word num" data-live="word">
          {@render chanceOf(shown.word, 'spam')}
          {@render chanceOf(shown.word, 'normal')}
        </p>
      {/if}
    </div>
  {/snippet}

  {#snippet controls()}
    <div class="controls">
      <Slider
        id="slider-alpha"
        symbol="α"
        role="a"
        label="α, the smoothing added to every word count"
        value={lab.alpha}
        min={dataset.alphas.min}
        max={dataset.alphas.max}
        step={dataset.alphas.step}
        onchange={(value) => {
          lab.setAlpha(value);
        }}
        onfocuschange={(focused) => {
          if (focused) lab.select({ kind: 'symbol', id: 'alpha' });
          else lab.release('symbol', 'alpha');
        }}
      />
      <MetricCard
        compact
        title="Chance it is spam"
        value={percent(chance)}
        unit=""
        detail=""
        position={chance}
        label={verdict}
        offScale={false}
        best={false}
      />
    </div>
  {/snippet}

  {#snippet table()}
    <div data-view="table">
      <DataTable
        caption={`The words of the message, in order, counted in ${dataset.training.length} training messages.`}
        rows={lab.rows}
        {columns}
        rowClass={(row) => (row.counted ? 'is-active' : undefined)}
        selectedId={lab.selectedRow?.id ?? null}
        onselect={(id) => {
          lab.select(
            id === null ? null : { kind: 'item', id, source: 'table' },
          );
        }}
        onhighlight={(symbol) => {
          if (symbol === 'L') lab.select({ kind: 'symbol', id: 'L' });
          else lab.release('symbol', 'L');
        }}
        describe={(row) =>
          row.known
            ? `${row.word}: ${lab.model.counts.spam.get(row.word) ?? 0} times in spam, ${lab.model.counts.normal.get(row.word) ?? 0} in normal; ${row.counted ? `adds ${signed(row.contribution)}` : 'switched off'}`
            : `${row.word}: never seen in training, so ignored`}
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
    min-height: 3.2em;
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--c-control-edge);
    border-radius: var(--radius-control);
    background: var(--c-surface);
    color: var(--c-text);
    font: inherit;
    font-size: var(--fs-18);
    line-height: 1.4;
    resize: vertical;
  }

  .message__box:focus-visible {
    outline: 2px solid var(--c-focus);
    outline-offset: 1px;
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

  .key svg {
    display: inline-block;
  }

  .key__sym {
    font-family: 'KaTeX_Math', 'Times New Roman', serif;
    font-size: var(--fs-18);
    font-style: italic;
  }

  .tools__note {
    color: var(--c-muted);
    font-size: var(--fs-14);
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

  .equation__word {
    color: var(--c-muted);
    font-size: var(--fs-14);
  }

  .equation__word {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--s-4);
    justify-content: center;
  }

  .equation__word strong {
    color: var(--c-text);
  }

  .chance {
    white-space: nowrap;
  }

  .equation__note {
    color: var(--c-muted);
    font-size: var(--fs-12);
    font-weight: 400;
  }

  .term {
    margin-inline-start: 0.35em;
    white-space: nowrap;
  }

  .term--selected {
    border-radius: 3px;
    background: var(--c-highlight);
    box-shadow: inset 0 -2px 0 currentcolor;
  }

  .equation :global(.sym-line) {
    border-radius: 3px;
    cursor: help;
  }

  :global(.lab[data-highlight='L']) .equation :global(.sym-line) {
    background: var(--c-highlight);
    box-shadow: inset 0 -2px 0 currentcolor;
  }

  :global(.lab[data-highlight='alpha']) .equation :global(.sym-a) {
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

    .tools__note {
      font-size: var(--fs-12);
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
