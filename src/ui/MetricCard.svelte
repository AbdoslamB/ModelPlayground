<!--
  A headline number with a log-scale bar and a word label. Used as the error
  meter. The label (not every number) is announced to screen readers, at most
  once per second.
-->
<script lang="ts">
  interface Props {
    title: string;
    value: string;
    unit: string;
    detail: string;
    /** Marker position on the bar: 0 = best, 1 = the far end. */
    position: number;
    label: string;
    offScale: boolean;
    /** Shows the ★ for a line within 1% of the best error. */
    best: boolean;
    /** A small version without a frame, to sit beside controls. */
    compact?: boolean;
    /** "error": the bar fills with how wrong (orange); "score": with how right (blue). */
    tone?: 'error' | 'score';
  }

  let {
    title,
    value,
    unit,
    detail,
    position,
    label,
    offScale,
    best,
    compact = false,
    tone = 'error',
  }: Props = $props();

  let spoken = $state('');
  $effect(() => {
    const next = offScale ? `${label}, off the scale` : label;
    const timer = setTimeout(() => {
      spoken = next;
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  });
</script>

<div class="metric" class:metric--compact={compact} data-tone={tone}>
  <div class="metric__head">
    <span class="metric__title">{title}</span>
    <span class="metric__value num">{value}</span>
    <span class="metric__unit">{unit}</span>
    {#if best}
      <span class="metric__star" aria-hidden="true">★</span>
    {/if}
  </div>
  <div
    class="metric__bar"
    role="meter"
    aria-label={`${title}, from best possible to far off`}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={Math.round(position * 100)}
    aria-valuetext={label}
    style:--at={`${position * 100}%`}
  >
    <span class="metric__fill"></span>
    <span class="metric__marker"></span>
  </div>
  <div class="metric__foot">
    <span class="metric__label" data-label={label}>
      {offScale ? 'Off the scale' : label}
    </span>
    <span class="metric__detail num">{detail}</span>
  </div>
  <p class="visually-hidden" aria-live="polite">{spoken}</p>
</div>

<style>
  .metric {
    display: grid;
    gap: var(--s-2);
    padding: var(--s-3) var(--s-4);
    border: 1px solid var(--c-hairline);
    border-radius: var(--radius-card);
  }

  .metric__head {
    display: flex;
    align-items: baseline;
    gap: var(--s-2);
  }

  .metric__title {
    color: var(--c-muted);
    font-size: var(--fs-16);
  }

  .metric__value {
    margin-inline-start: auto;
    font-size: var(--fs-30);
    font-weight: 700;
    line-height: 1;
  }

  .metric__unit {
    color: var(--c-muted);
    font-size: var(--fs-16);
  }

  .metric__star {
    color: var(--c-best-ink);
  }

  .metric__bar {
    position: relative;
    height: 8px;
    border-radius: 4px;
    background: var(--c-surface);
    box-shadow: inset 0 0 0 1px var(--c-hairline);
  }

  .metric__fill {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    width: var(--at);
    border-radius: 4px;
    background: color-mix(in srgb, var(--c-error) 55%, transparent);
  }

  .metric__marker {
    position: absolute;
    inset-block: -4px;
    inset-inline-start: calc(var(--at) - 1.5px);
    width: 3px;
    border-radius: 2px;
    background: var(--c-text);
  }

  .metric__foot {
    display: flex;
    justify-content: space-between;
    gap: var(--s-2);
    font-size: var(--fs-16);
  }

  .metric__label {
    font-weight: 600;
  }

  .metric__detail {
    color: var(--c-muted);
  }

  /* Phones: two rows — the number, then the bar with its label beside it. */
  @container lab (width < 520px) {
    .metric {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 6px var(--s-3);
      padding: var(--s-2) var(--s-3);
    }

    .metric__head {
      grid-column: 1 / -1;
    }

    .metric__value {
      font-size: var(--fs-24);
    }

    .metric__foot {
      display: contents;
      font-size: var(--fs-14);
    }

    .metric__detail {
      display: none;
    }
  }

  .metric--compact {
    gap: 4px;
    padding: 0;
    border: 0;
  }

  .metric--compact .metric__title,
  .metric--compact .metric__unit,
  .metric--compact .metric__foot {
    font-size: var(--fs-14);
  }

  .metric--compact .metric__value {
    font-size: var(--fs-20);
  }

  .metric--compact .metric__bar {
    height: 6px;
  }

  .metric[data-tone='score'] .metric__fill {
    background: color-mix(in srgb, var(--c-line) 55%, transparent);
  }
</style>
