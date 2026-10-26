<!--
  The verdict meter: what to do with the test as it stands today, with an
  icon (so the meaning never rests on color alone), a short reason, and the
  guardrails. The title is announced to screen readers, at most once a second.
-->
<script lang="ts">
  import type { Guardrails, Verdict } from '../math';

  import { formatNumber } from '../../../lib/format';
  import { signed } from '../math';

  interface Props {
    verdict: Verdict;
    guard: Guardrails;
    limits: { latency: number; errors: number };
  }

  let { verdict, guard, limits }: Props = $props();

  let spoken = $state('');
  $effect(() => {
    const next = verdict.title;
    const timer = setTimeout(() => {
      spoken = next;
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  });
</script>

<div class="verdict" data-tone={verdict.tone} data-kind={verdict.kind}>
  <div class="verdict__head">
    <svg
      class="verdict__icon"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="10" />
      {#if verdict.tone === 'good'}
        <path d="M6.5 11.5 9.5 14.5 15.5 7.5" />
      {:else if verdict.tone === 'bad'}
        <path d="M7.5 7.5 14.5 14.5M14.5 7.5 7.5 14.5" />
      {:else if verdict.tone === 'warn'}
        <path d="M11 6v6.5M11 15.6v.1" />
      {:else}
        <path d="M11 6.5V11l3 2" />
      {/if}
    </svg>
    <span class="verdict__title" data-live="verdict">{verdict.title}</span>
  </div>
  <p class="verdict__detail">{verdict.detail}</p>
  <p class="verdict__guard num">
    <span class:is-broken={!guard.latencyOk}
      >Search {signed(guard.latency, 0)} ms (limit +{formatNumber(
        limits.latency,
        0,
      )})</span
    >
    ·
    <span class:is-broken={!guard.errorsOk}
      >checkout errors {signed(guard.errors, 2)} pts (limit +{formatNumber(
        limits.errors,
        2,
      )})</span
    >
  </p>
  <p class="visually-hidden" aria-live="polite">{spoken}</p>
</div>

<style>
  .verdict {
    display: grid;
    gap: 4px;
  }

  .verdict__head {
    display: flex;
    gap: var(--s-2);
    align-items: center;
  }

  .verdict__icon {
    flex: none;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .verdict__icon circle {
    stroke: currentcolor;
  }

  .verdict__icon path {
    stroke: currentcolor;
    stroke-width: 2.4;
  }

  .verdict[data-tone='good'] .verdict__icon {
    color: var(--c-b-ink);
  }

  .verdict[data-tone='bad'] .verdict__icon {
    color: var(--c-error-ink);
  }

  .verdict[data-tone='warn'] .verdict__icon {
    color: var(--c-a-ink);
  }

  .verdict[data-tone='wait'] .verdict__icon {
    color: var(--c-muted);
  }

  .verdict__title {
    font-size: var(--fs-18);
    font-weight: 700;
    line-height: 1.3;
  }

  .verdict__detail {
    font-size: var(--fs-14);
    line-height: 1.5;
  }

  .verdict__guard {
    color: var(--c-muted);
    font-size: var(--fs-12);
  }

  .is-broken {
    color: var(--c-error-ink);
    font-weight: 700;
  }
</style>
