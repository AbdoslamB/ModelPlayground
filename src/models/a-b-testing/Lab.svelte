<!--
  The A/B Testing story: one island, seven steps in order, with a step bar
  that marks progress. The learner is StylePulse's data scientist. Choices in
  steps 1–3 (where to randomize, the metric, the contract, how long to run)
  change what steps 4–7 show. The day-by-day graph, the live equations and
  the day table are linked through one selection (a day), like every Lab.
  The story's static text comes from Page.astro as snippets (plain HTML).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { onMount } from 'svelte';

  import type { PythonProgram } from '../../lib/python';
  import type { TableColumn } from '../../ui/table';
  import type { Dataset } from './data';
  import type { Entry, Metric } from './store.svelte';

  import { formatNumber } from '../../lib/format';
  import DataTable from '../../ui/DataTable.svelte';
  import PythonBox from '../../ui/PythonBox.svelte';
  import Slider from '../../ui/Slider.svelte';
  import Toggle from '../../ui/Toggle.svelte';
  import {
    dollars,
    mdeText,
    percent,
    pText,
    pValue,
    share,
    signed,
  } from './math';
  import { AbLab, PEEK_DAY, SHORT_DAYS } from './store.svelte';
  import CiChart from './views/CiChart.svelte';
  import Graph from './views/Graph.svelte';
  import Verdict from './views/Verdict.svelte';

  interface Props {
    dataset: Dataset;
    /** KaTeX HTML of the formulas, rendered at build time. */
    formulas: { hypotheses: string; n: string; z: string };
    /** The Python programs for the opening state, written at build time. */
    initialPython: PythonProgram[];
    // The story's static text, from Page.astro.
    vp: Snippet;
    intro1: Snippet;
    intro2: Snippet;
    intro3: Snippet;
    intro4: Snippet;
    intro5: Snippet;
    intro6: Snippet;
    intro7: Snippet;
    note2: Snippet;
    note5: Snippet;
    note6: Snippet;
    cases: Snippet;
    /** Astro's typing passes the slots as children too; they are unused. */
    children?: unknown;
  }

  // eslint-disable-next-line svelte/no-unused-props -- children is only there for Astro's slot typing
  let {
    dataset,
    formulas,
    initialPython,
    vp,
    intro1,
    intro2,
    intro3,
    intro4,
    intro5,
    intro6,
    intro7,
    note2,
    note5,
    note6,
    cases,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  const lab = new AbLab(dataset);

  const STEPS = [
    'The problem',
    'The contract',
    'The design',
    'Run it',
    'Check it',
    'Read it',
    'Decide',
  ];

  const fmt = (value: number, decimals = 2) => formatNumber(value, decimals);
  const users = (value: number) => formatNumber(value, 0);

  // The step in view, for the step bar.
  let current = $state(1);
  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            current = Number(entry.target.getAttribute('data-step'));
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    for (const step of document.querySelectorAll('.step[data-step]')) {
      observer.observe(step);
    }
    return () => {
      observer.disconnect();
    };
  });

  // Run: one day every 450 ms.
  $effect(() => {
    if (!lab.running) return;
    const timer = setInterval(() => {
      lab.tick();
    }, 450);
    return () => {
      clearInterval(timer);
    };
  });

  const ENTRIES: { id: Entry; title: string; count: string }[] = $derived([
    {
      id: 'home',
      title: 'Visit the homepage',
      count: `${users(dataset.searchersPerDay * 2)} a day`,
    },
    {
      id: 'search',
      title: 'Search',
      count: `${users(dataset.searchersPerDay)} a day`,
    },
    {
      id: 'buy',
      title: 'Buy',
      count: `${share(dataset.buyRate, 0)} of searchers`,
    },
  ]);
  const METRICS: { id: Metric; title: string; detail: string }[] = [
    { id: 'time', title: 'Time on site', detail: 'minutes per visit' },
    {
      id: 'spend',
      title: 'Spend per searcher per day',
      detail: '$ per searcher, each day',
    },
  ];

  // ── The day table ──
  interface Row {
    id: number;
  }
  const rows: Row[] = $derived(lab.test.days.map((d) => ({ id: d.day })));

  /** Text for a computed column: its value, or why there is none yet. */
  function later(day: number): string | null {
    if (day > lab.end) return 'after the plan';
    if (day > lab.today) return 'not yet';
    return null;
  }
  const result = (day: number) => lab.daily[day - 1];
  const dayOf = (day: number) => lab.test.days[day - 1];

  const columns: TableColumn<Row>[] = $derived([
    {
      key: 'day',
      header: 'Day',
      decimals: 0,
      value: (r: Row) => r.id,
      text: (r: Row) => (r.id === lab.end ? `${r.id} (last)` : String(r.id)),
    },
    {
      key: 'users',
      header: 'Users C / T',
      decimals: 0,
      value: (r: Row) =>
        (dayOf(r.id)?.control.n ?? 0) + (dayOf(r.id)?.treatment.n ?? 0),
      text: (r: Row) =>
        `${users(dayOf(r.id)?.control.n ?? 0)} / ${users(dayOf(r.id)?.treatment.n ?? 0)}`,
    },
    {
      key: 'spend',
      header: 'Spend C / T',
      unit: '$',
      decimals: 2,
      value: (r: Row) => dayOf(r.id)?.treatment.mean ?? 0,
      text: (r: Row) =>
        `${fmt(dayOf(r.id)?.control.mean ?? 0)} / ${fmt(dayOf(r.id)?.treatment.mean ?? 0)}`,
    },
    {
      key: 'lift',
      header: 'Lift so far',
      decimals: 2,
      role: 'sym-line',
      value: (r: Row) =>
        later(r.id) ? Infinity : (result(r.id)?.lift ?? 0) * 100,
      text: (r: Row) => later(r.id) ?? percent(result(r.id)?.lift ?? 0, 2),
    },
    {
      key: 'ci',
      header: `${lab.confidence}% interval`,
      decimals: 2,
      value: (r: Row) => (later(r.id) ? Infinity : (result(r.id)?.lo ?? 0)),
      text: (r: Row) =>
        later(r.id) ??
        `${percent(result(r.id)?.lo ?? 0)} to ${percent(result(r.id)?.hi ?? 0)}`,
    },
    {
      key: 'p',
      header: 'p',
      decimals: 4,
      role: 'sym-error',
      value: (r: Row) => (later(r.id) ? Infinity : (result(r.id)?.p ?? 1)),
      text: (r: Row) => later(r.id) ?? pValue(result(r.id)?.p ?? 1),
    },
  ]);

  // ── "Try it in Python": the test up to today. The programs' text loads
  // after the page starts, to keep it out of the first load; until then (and
  // without JavaScript) the opening state's programs are shown.
  let code: typeof import('./python') | null = $state.raw(null);
  onMount(() => {
    void import('./python').then((module) => {
      code = module;
    });
  });
  const python = $derived.by(() =>
    code
      ? code.programs({
          title: lab.test.title,
          days: lab.test.days.slice(0, lab.today),
          alpha: lab.alpha,
          power: lab.power,
          mde: lab.mdeFraction,
          mean: dataset.history.mean,
          sd: dataset.history.sd,
          perGroupPerDay: lab.perGroupPerDay,
        })
      : initialPython,
  );

  // ── Step 7: how the learner's choices played out ──
  const review = $derived([
    {
      ok: lab.entry === 'search',
      text:
        lab.entry === 'search'
          ? 'Randomized at the first search: only people the ranking can reach.'
          : `Randomized at “${lab.entry === 'home' ? 'Visit the homepage' : 'Buy'}”: step 1 shows why that fails. This analysis uses searchers.`,
    },
    {
      ok: lab.metric === 'spend',
      text:
        lab.metric === 'spend'
          ? 'Measured spend per searcher per day.'
          : lab.metric === 'time'
            ? 'Picked time on site, which cannot say whether RankNet-v2 helped. This analysis uses spend instead.'
            : 'No metric picked in step 1; this analysis uses spend per searcher.',
    },
    {
      ok: lab.signed !== null && !lab.moved,
      text: lab.moved
        ? 'Changed the contract after signing it: that is moving the goalposts.'
        : lab.signed
          ? 'Signed the contract before seeing any data.'
          : 'Never signed the contract in step 2.',
    },
    {
      ok: lab.aaRun,
      text: lab.aaRun
        ? 'Ran the A/A test first: the setup works.'
        : 'Skipped the A/A test in step 3: run it to trust the setup.',
    },
    {
      ok: lab.duration !== 'short',
      text:
        lab.duration === 'short'
          ? `Stopped after ${SHORT_DAYS} days: too few users, and no weekend.`
          : `Ran the full plan: ${lab.end} days.`,
    },
    {
      ok: !lab.peeked,
      text: lab.peeked
        ? `Tried to stop on day ${PEEK_DAY} when the p-value looked good: the peeking trap.`
        : 'Did not stop early on a good-looking day.',
    },
  ]);
</script>

{#snippet feedback(tone: 'bad' | 'good' | 'warn', text: string)}
  <p class="feedback" data-tone={tone} role="status">
    <svg width="18" height="18" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="10" />
      {#if tone === 'good'}
        <path d="M6.5 11.5 9.5 14.5 15.5 7.5" />
      {:else if tone === 'bad'}
        <path d="M7.5 7.5 14.5 14.5M14.5 7.5 7.5 14.5" />
      {:else}
        <path d="M11 6v6.5M11 15.6v.1" />
      {/if}
    </svg>
    <span>{text}</span>
  </p>
{/snippet}

{#snippet next(step: number)}
  {#if step < STEPS.length}
    <a class="button next" href={`#step-${step + 1}`}
      >Next: {STEPS[step]} <span aria-hidden="true">↓</span></a
    >
  {/if}
{/snippet}

<div class="lab story" data-highlight={lab.highlight ?? undefined}>
  <nav class="stepbar" aria-label="Steps of the test">
    <ol>
      {#each STEPS as title, i (title)}
        <li>
          <a
            href={`#step-${i + 1}`}
            class:is-current={current === i + 1}
            class:is-done={lab.done[i]}
            aria-current={current === i + 1 ? 'step' : undefined}
          >
            <span class="stepbar__num" aria-hidden="true"
              >{lab.done[i] ? '✓' : i + 1}</span
            >
            <span class="stepbar__title">{title}</span>
            {#if lab.done[i]}<span class="visually-hidden">(done)</span>{/if}
          </a>
        </li>
      {/each}
    </ol>
  </nav>

  <!-- ── Step 1 ── -->
  <section class="step" id="step-1" data-step="1" aria-labelledby="h-step-1">
    <p class="step__kicker">Step 1 of 7</p>
    <h2 id="h-step-1">The problem: who to test, and what to measure</h2>
    <div class="vp">{@render vp()}</div>
    {@render intro1()}

    <h3>Where do people join the test?</h3>
    <div class="choices choices--funnel">
      {#each ENTRIES as e, i (e.id)}
        <button
          type="button"
          class="choice"
          aria-pressed={lab.entry === e.id}
          onclick={() => {
            lab.entry = e.id;
          }}
        >
          <span class="choice__title">{e.title}</span>
          <span class="choice__detail num">{e.count}</span>
        </button>
        {#if i < ENTRIES.length - 1}
          <span class="funnel__arrow" aria-hidden="true">→</span>
        {/if}
      {/each}
    </div>
    {#if lab.entry === 'home'}
      {@render feedback(
        'warn',
        `Half of homepage visitors never search, so they never see the new ranking. The effect per visitor halves, and the test needs ${users(lab.diluted.n)} visitors per group: ${lab.diluted.days} days instead of ${lab.planned}.`,
      )}
    {:else if lab.entry === 'search'}
      {@render feedback(
        'good',
        'Right: people join the test at their first search, the moment the ranking can affect them.',
      )}
    {:else}
      {@render feedback(
        'bad',
        'Too late: only people who already bought would be in the test, so the ranking could not change whether they buy.',
      )}
    {/if}

    <h3>What is the primary metric?</h3>
    <div class="choices">
      {#each METRICS as m (m.id)}
        <button
          type="button"
          class="choice"
          aria-pressed={lab.metric === m.id}
          onclick={() => {
            lab.metric = m.id;
          }}
        >
          <span class="choice__title">{m.title}</span>
          <span class="choice__detail">{m.detail}</span>
        </button>
      {/each}
    </div>
    {#if lab.metric === 'time'}
      {@render feedback(
        'bad',
        'A trap: if RankNet-v2 is good, people find clothes faster and leave sooner; if it is bad, they give up and leave. The number cannot say which.',
      )}
    {:else if lab.metric === 'spend'}
      {@render feedback(
        'good',
        `Right: it is tied to what the shop wants, measured for everyone, and the ranking can change it. Last month: $${fmt(dataset.history.mean)} a searcher a day, with a spread (σ) of $${fmt(dataset.history.sd)}.`,
      )}
    {/if}
    <p class="guardrails">
      <strong>Guardrails</strong>, which must not get worse: search latency (at
      most +{fmt(dataset.limits.latency, 0)} ms) and checkout errors (at most +{fmt(
        dataset.limits.errors,
        2,
      )} percentage points).
    </p>
    {@render next(1)}
  </section>

  <!-- ── Step 2 ── -->
  <section class="step" id="step-2" data-step="2" aria-labelledby="h-step-2">
    <p class="step__kicker">Step 2 of 7</p>
    <h2 id="h-step-2">The contract: decide before you look</h2>
    {@render intro2()}
    <div class="formula">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- KaTeX output built from our own TeX at build time -->
      {@html formulas.hypotheses}
    </div>
    <div class="sliders">
      <Slider
        id="slider-mde"
        symbol="δ"
        role="a"
        label={`δ, the MDE, the smallest lift worth launching: ${mdeText(lab.mdeFraction)}`}
        value={lab.mde}
        min={dataset.mde.min}
        max={dataset.mde.max}
        step={dataset.mde.step}
        onchange={(value) => {
          lab.set('mde', value);
        }}
        onfocuschange={(focused) => {
          if (focused) lab.select({ kind: 'symbol', id: 'mde' });
          else lab.release('symbol', 'mde');
        }}
      />
      <Slider
        id="slider-alpha"
        symbol="α"
        role="error"
        label={`α, the false-alarm rate: ${fmt(lab.alpha)}`}
        value={lab.alpha}
        min={dataset.alpha.min}
        max={dataset.alpha.max}
        step={dataset.alpha.step}
        onchange={(value) => {
          lab.set('alpha', value);
        }}
        onfocuschange={(focused) => {
          if (focused) lab.select({ kind: 'symbol', id: 'alpha' });
          else lab.release('symbol', 'alpha');
        }}
      />
      <Slider
        id="slider-power"
        symbol="1−β"
        role="b"
        label={`1 − β, the power, the chance of spotting a real lift of δ: ${fmt(lab.power)}`}
        value={lab.power}
        min={dataset.power.min}
        max={dataset.power.max}
        step={dataset.power.step}
        onchange={(value) => {
          lab.set('power', value);
        }}
        onfocuschange={(focused) => {
          if (focused) lab.select({ kind: 'symbol', id: 'power' });
          else lab.release('symbol', 'power');
        }}
      />
    </div>
    <div class="live" data-view="equation">
      <p class="num" data-live="mde">
        <span class="sym-a">δ</span> = {mdeText(lab.mdeFraction)} × ${fmt(
          dataset.history.mean,
        )} = <strong>${fmt(lab.delta)}</strong> per searcher per day: {dollars(
          lab.deltaPerDay,
        )} a day for {users(dataset.searchersPerDay)} searchers.
      </p>
      <p class="num" data-live="alpha">
        <span class="sym-error">α</span> = {fmt(lab.alpha)}: a test of a useless
        change still “wins” {share(lab.alpha, 0)} of the time.
      </p>
      <p class="num" data-live="power">
        <span class="sym-b">1 − β</span> = {fmt(lab.power)}: a real lift of
        {mdeText(lab.mdeFraction)} is missed {share(1 - lab.power, 0)} of the time.
      </p>
    </div>
    <div class="note">{@render note2()}</div>
    <div class="actions">
      <button
        type="button"
        class="button button--primary"
        onclick={() => {
          lab.sign();
        }}>{lab.signed ? 'Sign again' : 'Sign the contract'}</button
      >
    </div>
    {#if lab.moved}
      {@render feedback(
        'bad',
        `You changed the contract after signing it (it said MDE ${fmt(lab.signed?.mde ?? 0, 1)}%, α ${fmt(lab.signed?.alpha ?? 0)}, power ${fmt(lab.signed?.power ?? 0)}). Changing it after seeing data is moving the goalposts.`,
      )}
    {:else if lab.signed}
      {@render feedback(
        'good',
        `Signed: MDE ${mdeText(lab.mdeFraction)}, α ${fmt(lab.alpha)}, power ${fmt(lab.power)}. Nobody can move the goalposts now.`,
      )}
    {/if}
    {@render next(2)}
  </section>

  <!-- ── Step 3 ── -->
  <section class="step" id="step-3" data-step="3" aria-labelledby="h-step-3">
    <p class="step__kicker">Step 3 of 7</p>
    <h2 id="h-step-3">The design: how many users, how long, and an A/A test</h2>
    {@render intro3()}
    <div class="formula">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- KaTeX output built from our own TeX at build time -->
      {@html formulas.n}
    </div>
    <div class="live">
      <p class="num" data-live="plan">
        n = 2 × (<span class="sym-error">{fmt(lab.zAlpha)}</span> +
        <span class="sym-b">{fmt(lab.zPower)}</span>)² × ${fmt(
          dataset.history.sd,
          0,
        )}² / <span class="sym-a">${fmt(lab.delta)}</span>² =
        <strong>{users(lab.n)}</strong> users per group
      </p>
      <p class="num" data-live="days">
        At {users(lab.perGroupPerDay)} users a group each day: {fmt(
          lab.trafficDays,
          1,
        )} days of traffic, rounded up to whole weeks:
        <strong>{lab.planned} days</strong>.
      </p>
      {#if lab.entry === 'home'}
        <p class="num warn-text">
          Randomizing at the homepage (step 1) would need {users(lab.diluted.n)} visitors
          per group: {lab.diluted.days} days.
        </p>
      {/if}
    </div>

    <h3>How long should it run?</h3>
    <div class="choices">
      <button
        type="button"
        class="choice"
        aria-pressed={lab.duration === 'short'}
        onclick={() => {
          lab.setDuration('short');
        }}
      >
        <span class="choice__title">Stop after {SHORT_DAYS} days</span>
        <span class="choice__detail">Fast! Results by Thursday.</span>
      </button>
      <button
        type="button"
        class="choice"
        aria-pressed={lab.duration === 'full'}
        onclick={() => {
          lab.setDuration('full');
        }}
      >
        <span class="choice__title">Run the full plan: {lab.planned} days</span>
        <span class="choice__detail">Whole weeks, weekends included.</span>
      </button>
    </div>
    {#if lab.duration === 'short'}
      {@render feedback(
        'bad',
        `${SHORT_DAYS} days bring ${users(lab.perGroupPerDay * SHORT_DAYS)} users per group, not ${users(lab.n)}, and no weekend: weekend shoppers behave differently, and a new design looks exciting at first. Step 4 will stop on day ${SHORT_DAYS}.`,
      )}
    {:else if lab.duration === 'full'}
      {@render feedback(
        'good',
        `Right: ${lab.planned} days give enough users and cover whole weeks, so weekdays and weekends both count and novelty can wear off.`,
      )}
    {/if}

    <h3>Before the real test: the A/A test</h3>
    <p>
      Show <em>both</em> groups the old ranking for {lab.aaTest?.days.length ??
        14}
      days. Nothing changed, so a working setup shows no difference.
    </p>
    <div class="actions">
      <button
        type="button"
        class="button"
        onclick={() => {
          lab.aaRun = true;
        }}>{lab.aaRun ? 'A/A test done' : 'Run the A/A test'}</button
      >
    </div>
    {#if lab.aaRun && lab.aaResult}
      {@const aa = lab.aaResult}
      <div class="card num" data-live="aa">
        <p>
          <strong>Split:</strong>
          {users(aa.nC)} vs {users(aa.nT)} users, {pText(lab.aaSplit.p)}: an
          even split.
        </p>
        <p>
          <strong>Result:</strong> lift {percent(aa.lift, 2)}, {lab.confidence}%
          interval {percent(aa.lo)} to {percent(aa.hi)}, {pText(aa.p)}: no
          difference, as it should be. The setup works.
        </p>
        <svg
          class="spark"
          viewBox="0 0 280 60"
          role="img"
          aria-label="The A/A test's p-value each day"
        >
          <line
            class="spark__alpha"
            x1="10"
            x2="270"
            y1={8 + (Math.min(4, -Math.log10(lab.alpha)) / 4) * 44}
            y2={8 + (Math.min(4, -Math.log10(lab.alpha)) / 4) * 44}
          ></line>
          {#each lab.aaDaily as r, i (i)}
            <circle
              class:spark__low={r.p < lab.alpha}
              cx={10 + (i / (lab.aaDaily.length - 1)) * 260}
              cy={8 + (Math.min(4, -Math.log10(Math.max(r.p, 1e-4))) / 4) * 44}
              r="4"
            ></circle>
          {/each}
        </svg>
        {#if lab.aaDip > 0}
          <p class="warn-text">
            But look at the dots: on day {lab.aaDip} the p-value was {pValue(
              lab.aaDaily[lab.aaDip - 1]?.p ?? 1,
            )}, under α = {fmt(lab.alpha)}. Had anyone stopped then, the old
            ranking would have “beaten itself”. Remember this in step 4.
          </p>
        {/if}
      </div>
    {/if}
    {@render next(3)}
  </section>

  <!-- ── Step 4 ── -->
  <section class="step" id="step-4" data-step="4" aria-labelledby="h-step-4">
    <p class="step__kicker">Step 4 of 7</p>
    <h2 id="h-step-4">Run it: watch the days come in</h2>
    {@render intro4()}
    <p class="scenario-line">
      Now running: <strong>{lab.test.title}</strong> ({lab.test.story})
    </p>
    <div class="tools">
      <button
        type="button"
        class="button button--primary"
        disabled={lab.peekOpen}
        onclick={() => {
          lab.run();
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          {#if lab.running}
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
        {lab.running
          ? 'Pause'
          : lab.today >= lab.end
            ? 'Run again'
            : lab.today > 1
              ? 'Continue'
              : 'Run the experiment'}
      </button>
      <span class="status num" data-live="status">
        Day {lab.today} of {lab.end}: {users(
          (lab.result?.nC ?? 0) + (lab.result?.nT ?? 0),
        )} searchers so far
      </span>
    </div>

    {#if lab.peekOpen && lab.peekResult}
      <div class="peek" role="alert">
        <p class="peek__from">Slack message from the VP of Product</p>
        <p class="peek__text">
          “Day {PEEK_DAY}: treatment is up {percent(lab.peekResult.lift)} with {pText(
            lab.peekResult.p,
          )}! That’s under {fmt(lab.alpha)}. Stop the test and launch now!”
        </p>
        <div class="actions">
          <button
            type="button"
            class="button"
            onclick={() => {
              lab.answerPeek(true);
            }}>Stop and launch now</button
          >
          <button
            type="button"
            class="button button--primary"
            onclick={() => {
              lab.answerPeek(false);
            }}>Keep going to day {lab.end}</button
          >
        </div>
      </div>
    {/if}
    {#if lab.peeked && lab.peekResult}
      <div class="reveal" data-live="reveal">
        <p class="reveal__title">The peeking trap</p>
        <p>
          A p-value is only honest at the end of the plan. Check it every day
          and stop at the first p &lt; {fmt(lab.alpha)}, and useless changes
          “win” far more than {share(lab.alpha, 0)} of the time: about
          {share(lab.falseAlarms.ever, 0)} with {lab.lastDay} daily looks. The A/A
          test in step 3 crossed the line on day {lab.aaDip || PEEK_DAY}, for a
          change that changed nothing.
        </p>
        <p class="num">
          Day {PEEK_DAY} said {percent(lab.peekResult.lift)}, {lab.confidence}%
          interval {percent(lab.peekResult.lo)} to {percent(lab.peekResult.hi)}.
          {#if lab.today >= lab.end && lab.final}
            Day {lab.end} says {percent(lab.final.lift)}, {percent(
              lab.final.lo,
            )}
            to {percent(lab.final.hi)}: early numbers jump around and tend to
            look too good.
          {:else}
            Run on to see what the full test says.
          {/if}
        </p>
        {#if lab.today < lab.end}
          <div class="actions">
            <button
              type="button"
              class="button button--primary"
              onclick={() => {
                lab.resume();
              }}>Resume to day {lab.end}</button
            >
          </div>
        {/if}
      </div>
    {/if}

    <Graph {lab} />
    <div class="layers">
      <Toggle
        label="Many tests: 20 simulated A/A tests"
        checked={lab.many}
        role="muted"
        mark="solid"
        onchange={(checked) => {
          lab.many = checked;
        }}
      />
    </div>
    {#if lab.many}
      <p class="small num" data-live="many">
        Grey: 20 simulated A/A tests, inside the dotted {lab.confidence}%
        funnel. Of {users(lab.runs.tests)} such tests, {share(
          lab.falseAlarms.ever,
        )} crossed it on some day, but only {share(lab.falseAlarms.end)} on day {lab.lastDay}.
      </p>
    {/if}
    <div class="sliders">
      <Slider
        id="slider-day"
        symbol="t"
        role="line"
        label={`t, the day of the test: ${lab.today} of ${lab.end}`}
        value={lab.today}
        min={dataset.day.min}
        max={lab.end}
        step={dataset.day.step}
        onchange={(value) => {
          lab.setDay(value);
        }}
        onfocuschange={(focused) => {
          if (focused) lab.select({ kind: 'symbol', id: 'day' });
          else lab.release('symbol', 'day');
        }}
      />
    </div>

    <h3>What lands in the data</h3>
    <p class="small">
      Five of the {users(dataset.searchersPerDay * lab.lastDay)} rows the test logs:
      one searcher on one day. Most spend $0.
    </p>
    <div class="scroll">
      <table class="plain num">
        <thead>
          <tr>
            <th scope="col">user_id</th>
            <th scope="col">day</th>
            <th scope="col">week</th>
            <th scope="col">group</th>
            <th scope="col">spent ($)</th>
            <th scope="col">latency (ms)</th>
          </tr>
        </thead>
        <tbody>
          {#each dataset.sample as row (row.user)}
            <tr>
              <td>{row.user}</td>
              <td>{row.day}</td>
              <td>{row.day <= 7 ? 1 : 2}</td>
              <td>{row.group}</td>
              <td>{fmt(row.spent)}</td>
              <td>{row.latency}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <h3>Day by day</h3>
    <div data-view="table">
      <DataTable
        caption="Each day: that day's users and average spend, and the test on all the days so far."
        {rows}
        {columns}
        rowClass={(r) => (r.id === lab.today ? 'is-active' : undefined)}
        selectedId={lab.selectedDay}
        onselect={(id) => {
          lab.select(
            id === null ? null : { kind: 'item', id, source: 'table' },
          );
        }}
        describe={(r) => {
          const res = result(r.id);
          const why = later(r.id);
          return why || !res
            ? `Day ${r.id}: ${why ?? ''}`
            : `Day ${r.id}: lift so far ${percent(res.lift, 2)}, interval ${percent(res.lo)} to ${percent(res.hi)}, ${pText(res.p)}`;
        }}
      />
    </div>

    <h3>Week by week</h3>
    <div class="scroll">
      <table class="plain num" data-live="weeks">
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Users C / T</th>
            <th scope="col">Spend C / T ($)</th>
            <th scope="col">Lift</th>
            <th scope="col">{lab.confidence}% interval</th>
          </tr>
        </thead>
        <tbody>
          {#each [{ name: 'Week 1 (days 1–7)', r: lab.week1 }, { name: `Week 2 (days 8–${Math.max(8, lab.today)})`, r: lab.week2 }, { name: `All ${lab.today} days`, r: lab.result }] as w (w.name)}
            <tr>
              <th scope="row">{w.name}</th>
              {#if w.r}
                <td>{users(w.r.nC)} / {users(w.r.nT)}</td>
                <td>{fmt(w.r.meanC)} / {fmt(w.r.meanT)}</td>
                <td>{percent(w.r.lift, 2)}</td>
                <td>{percent(w.r.lo)} to {percent(w.r.hi)}</td>
              {:else}
                <td colspan="4" class="muted">not yet</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {@render next(4)}
  </section>

  <!-- ── Step 5 ── -->
  <section class="step" id="step-5" data-step="5" aria-labelledby="h-step-5">
    <p class="step__kicker">Step 5 of 7</p>
    <h2 id="h-step-5">Check it: can the data be trusted?</h2>
    {@render intro5()}
    <div class="note">{@render note5()}</div>
    <h3>Load another test</h3>
    <div class="choices choices--wrap">
      {#each lab.scenarios as s (s.index)}
        <button
          type="button"
          class="choice choice--small"
          aria-pressed={lab.scenario === s.index}
          onclick={() => {
            lab.setScenario(s.index);
          }}
        >
          <span class="choice__title">{s.test.title}</span>
        </button>
      {/each}
    </div>
    <p class="scenario-line">
      <strong>{lab.test.title}:</strong>
      {lab.test.story}
    </p>
    <details class="truth">
      <summary>What really happened (the simulation’s truth)</summary>
      <p>{lab.test.truth}</p>
    </details>
    <ul class="checks num" data-live="checks">
      <li data-ok={lab.split.p >= dataset.splitLimit}>
        <strong>Split check:</strong>
        {users(lab.result?.nC ?? 0)} vs {users(lab.result?.nT ?? 0)} users, χ² = {fmt(
          lab.split.chi2,
        )}, {pText(lab.split.p)}.
        {lab.split.p < dataset.splitLimit
          ? 'Uneven: users went missing from one group. Nothing else can be trusted.'
          : 'An even split.'}
      </li>
      <li data-ok={lab.guard.latencyOk && lab.guard.errorsOk}>
        <strong>Guardrails:</strong> search {signed(lab.guard.latency, 0)} ms, checkout
        errors {signed(lab.guard.errors, 2)} points.
        {lab.guard.latencyOk && lab.guard.errorsOk
          ? 'Within the limits.'
          : 'A limit is broken.'}
      </li>
      <li
        data-ok={!lab.weeks ||
          lab.weeks.p >= 0.05 ||
          lab.weeks.last >= lab.mdeFraction}
      >
        <strong>Novelty:</strong>
        {#if lab.weeks}
          week 1 {percent(lab.weeks.first)}, week 2 {percent(lab.weeks.last)} ({pText(
            lab.weeks.p,
          )} for a change).
          {lab.weeks.p < 0.05 && lab.weeks.last < lab.mdeFraction
            ? 'The lift faded: people were trying something new.'
            : 'The lift held.'}
        {:else}
          needs the second week (run step 4 past day 7).
        {/if}
      </li>
      <li data-ok={lab.test.id !== 'holiday'}>
        <strong>Outside events:</strong>
        {lab.test.id === 'holiday'
          ? lab.test.note
          : 'none known during the test.'}
      </li>
    </ul>
    {@render next(5)}
  </section>

  <!-- ── Step 6 ── -->
  <section class="step" id="step-6" data-step="6" aria-labelledby="h-step-6">
    <p class="step__kicker">Step 6 of 7</p>
    <h2 id="h-step-6">Read it: significant, and big enough?</h2>
    {@render intro6()}
    <div class="note">{@render note6()}</div>
    {#if lab.shown}
      {@const r = lab.shown}
      <div class="live" data-view="equation">
        <div class="formula">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- KaTeX output built from our own TeX at build time -->
          {@html formulas.z}
        </div>
        <p class="num" data-live="z">
          Day {lab.shownDay}: z = (<span class="sym-line"
            >{fmt(r.meanT, 4)} − {fmt(r.meanC, 4)}</span
          >) / √({fmt(r.sdT)}² / {users(r.nT)} + {fmt(r.sdC)}² / {users(r.nC)})
          = <strong>{fmt(r.z)}</strong>, {pText(r.p)}
        </p>
        <p class="num" data-live="ci">
          {lab.confidence}% interval: ${fmt(r.diff, 3)} ± ${fmt(
            r.crit * r.se,
            3,
          )}, so the lift is <strong>{percent(r.lo)} to {percent(r.hi)}</strong>
          of the control’s ${fmt(r.meanC)}.
        </p>
      </div>
      <CiChart
        result={r}
        mde={lab.mdeFraction}
        range={lab.range}
        confidence={lab.confidence}
      />
      <p class="small num">
        {r.p < lab.alpha
          ? `Statistically significant (${pText(r.p)}).`
          : `Not statistically significant (${pText(r.p)}).`}
        {r.lo > lab.mdeFraction
          ? `Practically significant too: the whole interval clears the ${mdeText(lab.mdeFraction)} MDE.`
          : `Not shown to be practically significant: the interval reaches below the ${mdeText(lab.mdeFraction)} MDE.`}
      </p>
    {/if}
    <PythonBox
      programs={python}
      lead="Steps 5 and 6 in code: the test up to today, as each group's daily totals. It pools the days, runs the split check and Welch's z-test, and plans the test, printing the numbers above. SciPy does the normal tails and the χ² test; Plain Python uses math.erfc."
    />
    {@render next(6)}
  </section>

  <!-- ── Step 7 ── -->
  <section class="step" id="step-7" data-step="7" aria-labelledby="h-step-7">
    <p class="step__kicker">Step 7 of 7</p>
    <h2 id="h-step-7">Decide: launch, or not?</h2>
    {@render intro7()}
    <div class="sliders">
      <Slider
        id="slider-cost"
        symbol="$"
        role="data"
        label={`The daily cost of running RankNet-v2: ${dollars(lab.cost)}`}
        value={lab.cost}
        min={dataset.cost.min}
        max={dataset.cost.max}
        step={dataset.cost.step}
        onchange={(value) => {
          lab.set('cost', value);
        }}
        onfocuschange={(focused) => {
          if (focused) lab.select({ kind: 'symbol', id: 'cost' });
          else lab.release('symbol', 'cost');
        }}
      />
    </div>
    {#if lab.money && lab.result}
      <dl class="money num" data-live="money">
        <div>
          <dt>Gross lift</dt>
          <dd>{dollars(lab.money.expected + lab.cost)} a day</dd>
        </div>
        <div>
          <dt>Running cost</dt>
          <dd>{dollars(-lab.cost)} a day</dd>
        </div>
        <div>
          <dt>Net, expected</dt>
          <dd>{dollars(lab.money.expected)} a day</dd>
        </div>
        <div>
          <dt>Net, cautious ({lab.confidence}%)</dt>
          <dd>{dollars(lab.money.cautious)} a day</dd>
        </div>
        <div>
          <dt>Break-even lift</dt>
          <dd>{percent(lab.money.breakEven, 2)}</dd>
        </div>
      </dl>
    {/if}
    {#if lab.verdict}
      <div class="decision">
        <p class="decision__label">
          The decision, day {lab.today} of {lab.end}
        </p>
        <Verdict
          verdict={lab.verdict}
          guard={lab.guard}
          limits={dataset.limits}
        />
      </div>
    {/if}
    <h3>Your choices</h3>
    <ul class="checks">
      {#each review as item (item.text)}
        <li data-ok={item.ok}>{item.text}</li>
      {/each}
    </ul>
    <h3>The six cases</h3>
    <div class="cases" data-found={lab.found}>{@render cases()}</div>
  </section>
</div>

<style>
  .story {
    container: lab / inline-size;
    display: grid;
    /* Never wider than the screen, whatever the step bar wants. */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-12);
  }

  .stepbar {
    position: sticky;
    inset-block-start: 0;
    z-index: 5;
    margin-inline: calc(-1 * var(--s-2));
    padding: var(--s-2);
    border-block-end: 1px solid var(--c-hairline);
    background: var(--c-bg);
  }

  .stepbar ol {
    display: flex;
    gap: 2px;
    margin: 0;
    padding: 0;
    overflow-x: auto;
    list-style: none;
    scrollbar-width: none;
  }

  .stepbar li {
    flex: 1 0 auto;
  }

  .stepbar a {
    display: flex;
    gap: 6px;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 var(--s-2);
    border-radius: var(--radius-control);
    color: var(--c-muted);
    font-size: var(--fs-14);
    text-decoration: none;
    white-space: nowrap;
  }

  .stepbar a:hover {
    background: var(--c-surface-sunken);
    color: var(--c-text);
  }

  .stepbar a.is-current {
    background: var(--c-highlight);
    color: var(--c-text);
    font-weight: 700;
  }

  .stepbar__num {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 1.5px solid currentcolor;
    border-radius: 50%;
    font-size: var(--fs-12);
    font-weight: 700;
  }

  .stepbar a.is-done .stepbar__num {
    border-color: var(--c-b-ink);
    background: var(--c-b-ink);
    color: var(--c-bg);
  }

  .step {
    display: grid;
    /* Wide tables scroll inside their own box, not the page. */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-4);
    scroll-margin-block-start: 72px;
  }

  .step__kicker {
    color: var(--c-muted);
    font-size: var(--fs-14);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  h2 {
    font-size: var(--fs-24);
    line-height: 1.3;
  }

  h3 {
    margin-block-start: var(--s-2);
    font-size: var(--fs-18);
  }

  .step :global(p) {
    line-height: 1.7;
  }

  .vp {
    padding: var(--s-3) var(--s-4);
    border-inline-start: 4px solid var(--c-a);
    border-radius: var(--radius-control);
    background: var(--c-surface-sunken);
  }

  .note {
    padding: var(--s-3) var(--s-4);
    border-inline-start: 4px solid var(--c-line);
    border-radius: var(--radius-control);
    background: var(--c-surface-sunken);
    font-size: var(--fs-16);
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    align-items: stretch;
  }

  .choices--funnel {
    align-items: center;
  }

  .funnel__arrow {
    color: var(--c-muted);
    font-size: var(--fs-20);
  }

  .choice {
    display: grid;
    flex: 1 1 10rem;
    gap: 2px;
    min-height: 44px;
    padding: var(--s-3) var(--s-4);
    border: 1.5px solid var(--c-control-edge);
    border-radius: var(--radius-card);
    background: var(--c-surface);
    color: var(--c-text);
    text-align: start;
    cursor: pointer;
  }

  .choice:hover {
    background: var(--c-surface-sunken);
  }

  .choice[aria-pressed='true'] {
    border-color: var(--c-primary);
    box-shadow: inset 0 0 0 1.5px var(--c-primary);
    background: color-mix(in srgb, var(--c-primary) 8%, var(--c-surface));
  }

  .choice--small {
    flex: 0 1 auto;
    padding: var(--s-2) var(--s-3);
  }

  .choice__title {
    font-weight: 700;
  }

  .choice__detail {
    color: var(--c-muted);
    font-size: var(--fs-14);
  }

  .feedback {
    display: flex;
    gap: var(--s-2);
    align-items: flex-start;
    padding: var(--s-3);
    border-radius: var(--radius-control);
    background: var(--c-surface-sunken);
    font-size: var(--fs-16);
  }

  .feedback svg {
    flex: none;
    margin-block-start: 3px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 2.2;
    stroke-linecap: round;
  }

  .feedback[data-tone='good'] svg {
    color: var(--c-b-ink);
  }

  .feedback[data-tone='bad'] svg {
    color: var(--c-error-ink);
  }

  .feedback[data-tone='warn'] svg {
    color: var(--c-a-ink);
  }

  .guardrails,
  .small {
    color: var(--c-muted);
    font-size: var(--fs-14);
  }

  .formula {
    max-width: 100%;
    overflow-x: auto;
    font-size: var(--fs-18);
    text-align: center;
  }

  .sliders {
    display: grid;
  }

  /* "1−β" needs more room than one letter. */
  .sliders :global(.slider) {
    grid-template-columns: 2.4rem minmax(0, 1fr);
  }

  .sliders :global(.slider__symbol) {
    white-space: nowrap;
  }

  .live {
    display: grid;
    gap: var(--s-1);
    font-size: var(--fs-16);
  }

  :global(.lab[data-highlight='mde']) .live :global(.sym-a),
  :global(.lab[data-highlight='alpha']) .live :global(.sym-error),
  :global(.lab[data-highlight='power']) .live :global(.sym-b) {
    background: var(--c-highlight);
    box-shadow: inset 0 -2px 0 currentcolor;
  }

  .warn-text {
    color: var(--c-error-ink);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }

  .next {
    justify-self: end;
    text-decoration: none;
  }

  .card {
    display: grid;
    gap: var(--s-2);
    padding: var(--s-4);
    border: 1px solid var(--c-hairline);
    border-radius: var(--radius-card);
    font-size: var(--fs-16);
  }

  .spark {
    width: 100%;
    max-width: 320px;
    height: auto;
  }

  .spark circle {
    fill: var(--c-bg);
    stroke: var(--c-muted);
    stroke-width: 1.5;
  }

  .spark circle.spark__low {
    fill: var(--c-error);
    stroke: var(--c-error);
  }

  .spark__alpha {
    stroke: var(--c-error);
    stroke-dasharray: 5 4;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-3);
    align-items: center;
  }

  .status {
    color: var(--c-muted);
    font-size: var(--fs-14);
  }

  .scenario-line {
    font-size: var(--fs-16);
  }

  .peek {
    display: grid;
    gap: var(--s-2);
    padding: var(--s-4);
    border: 2px solid var(--c-a);
    border-radius: var(--radius-card);
    background: color-mix(in srgb, var(--c-a) 10%, var(--c-bg));
  }

  .peek__from {
    color: var(--c-muted);
    font-size: var(--fs-14);
    font-weight: 700;
  }

  .peek__text {
    font-size: var(--fs-18);
    font-weight: 600;
  }

  .reveal {
    display: grid;
    gap: var(--s-2);
    padding: var(--s-4);
    border: 2px solid var(--c-error);
    border-radius: var(--radius-card);
    font-size: var(--fs-16);
  }

  .reveal__title {
    color: var(--c-error-ink);
    font-size: var(--fs-18);
    font-weight: 700;
  }

  .layers {
    display: flex;
    justify-content: center;
  }

  .scroll {
    overflow-x: auto;
  }

  .plain {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-14);
  }

  .plain th,
  .plain td {
    padding: var(--s-2) var(--s-3);
    border-block-end: 1px solid var(--c-hairline);
    text-align: end;
    white-space: nowrap;
  }

  .plain th:first-child,
  .plain td:first-child {
    text-align: start;
  }

  .plain thead th {
    border-block-end-color: var(--c-control-edge);
  }

  .muted {
    color: var(--c-muted);
    text-align: center !important;
  }

  .truth summary {
    color: var(--c-line-ink);
    cursor: pointer;
  }

  .checks {
    display: grid;
    gap: var(--s-2);
    margin: 0;
    padding: 0;
    font-size: var(--fs-16);
    list-style: none;
  }

  .checks li {
    padding-inline-start: 1.8em;
    text-indent: -1.8em;
  }

  .checks li::before {
    display: inline-block;
    width: 1.8em;
    text-indent: 0;
    font-weight: 700;
  }

  .checks li[data-ok='true']::before {
    color: var(--c-b-ink);
    content: '✓';
  }

  .checks li[data-ok='false']::before {
    color: var(--c-error-ink);
    content: '✗';
  }

  .money {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: var(--s-2);
    margin: 0;
  }

  .money div {
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--c-hairline);
    border-radius: var(--radius-control);
  }

  .money dt {
    color: var(--c-muted);
    font-size: var(--fs-12);
  }

  .money dd {
    margin: 0;
    font-size: var(--fs-18);
    font-weight: 700;
  }

  .decision {
    display: grid;
    gap: var(--s-2);
    padding: var(--s-4);
    border: 2px solid var(--c-control-edge);
    border-radius: var(--radius-card);
  }

  .decision__label {
    color: var(--c-muted);
    font-size: var(--fs-14);
    font-weight: 700;
  }

  @container lab (width < 520px) {
    .stepbar__title {
      display: none;
    }

    .stepbar a.is-current .stepbar__title {
      display: inline;
    }

    .funnel__arrow {
      display: none;
    }
  }
</style>
