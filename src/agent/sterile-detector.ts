import { SterileLoopError } from '../core/errors.ts';
import type { EventBus } from '../ports/event-bus.ts';

/**
 * Deep key-sort of a parsed JSON value so two argument objects that differ
 * only in property order canonicalize identically.
 */
function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortJsonValue(record[key]);
    }
    return sorted;
  }
  return value;
}

/** Canonical string form: deep key-sort then stringify. */
function canonicalize(args: Record<string, unknown>): string {
  return JSON.stringify(sortJsonValue(args));
}

/** Head-truncate canonical arguments for advisory messages. */
function previewArgs(canonical: string, cap: number): string {
  if (canonical.length <= cap) return canonical;
  return `${canonical.slice(0, cap)}… (+${canonical.length - cap} more chars)`;
}

export interface SterileDetectorConfig {
  /** Consecutive-repeat counts that trigger escalating responses (default [3, 5, 8]). */
  thresholds?: number[];
  /** Max chars of canonical arguments quoted in detailed warnings (default 500). */
  argumentsPreviewChars?: number;
}

const DEFAULT_PREVIEW_CHARS = 500;

function validateThresholds(values: number[]): number[] {
  if (values.length === 0) {
    throw new Error('thresholds must not be empty');
  }
  for (const v of values) {
    if (!Number.isInteger(v) || v < 2) {
      throw new Error(`invalid threshold ${v} — every threshold must be an integer >= 2`);
    }
  }
  if (new Set(values).size !== values.length) {
    throw new Error('thresholds must not contain duplicates');
  }
  return [...values].sort((a, b) => a - b);
}

interface Chain {
  key: string;
  count: number;
}

/**
 * Advisory repeat-call detector with escalating thresholds.
 *
 * - At thresholds[0]: emits a gentle advisory warning via EventBus (no throw).
 * - At thresholds[1]: emits a detailed warning with tool name + args preview.
 * - At thresholds[N-1] (max): throws SterileLoopError to halt the loop.
 * - Resets chain on user interjection (when resetOnUserMessage is called).
 *
 * Uses deep key-sort canonicalization for order-independent argument comparison.
 */
export class SterileLoopDetector {
  private chain: Chain | null = null;
  private thresholds: number[];
  private thresholdSet: Set<number>;
  private previewChars: number;

  constructor(
    threshold: number = 3,
    private eventBus?: EventBus,
    config?: SterileDetectorConfig,
  ) {
    if (config?.thresholds) {
      this.thresholds = validateThresholds(config.thresholds);
    } else {
      this.thresholds = validateThresholds([threshold]);
      // For backward compat: if only one threshold given, expand to advisory pattern
      if (this.thresholds.length === 1) {
        const t = this.thresholds[0];
        this.thresholds = t >= 4 ? [Math.max(2, t - 2), t - 1, t] : [t];
      }
    }
    this.thresholdSet = new Set(this.thresholds);
    this.previewChars = config?.argumentsPreviewChars ?? DEFAULT_PREVIEW_CHARS;
  }

  /**
   * Check a tool call. Returns 'advisory' if a warning was emitted,
   * 'ok' if no threshold hit, or throws SterileLoopError at max threshold.
   */
  check(toolName: string, args: Record<string, unknown>): 'ok' | 'advisory' {
    const canonical = canonicalize(args);
    const key = JSON.stringify([toolName, canonical]);

    if (this.chain !== null && this.chain.key === key) {
      this.chain.count++;
    } else {
      this.chain = { key, count: 1 };
    }

    const count = this.chain.count;
    const maxThreshold = this.thresholds[this.thresholds.length - 1];

    if (count >= maxThreshold) {
      throw new SterileLoopError(
        `Loop estéril detectado: ferramenta "${toolName}" executada ${count}x com os mesmos argumentos`,
        toolName,
        count,
      );
    }

    if (this.thresholdSet.has(count) && count < maxThreshold) {
      const preview = previewArgs(canonical, this.previewChars);
      const isGentle = count === this.thresholds[0];

      const text = isGentle
        ? 'You are repeating the exact same tool call with identical arguments. '
          + 'Carefully analyze the previous result before calling again: if the task is '
          + 'not complete, try a different approach or different arguments instead of '
          + 'repeating the call.'
        : `Repeated tool call detected:\n`
          + `- tool: ${toolName}\n`
          + `- consecutive_calls: ${count}\n`
          + `- arguments: ${preview}\n`
          + 'The repeated calls are not making progress. Inspect the latest result '
          + 'and choose a different action, different arguments, or finish the task '
          + 'if enough evidence has been gathered.';

      this.eventBus?.emit('tool:repeat_warning', {
        tool: toolName,
        count,
        text,
        isGentle,
      });

      return 'advisory';
    }

    return 'ok';
  }

  /** Reset the chain. Call on user interjection. */
  reset(): void {
    this.chain = null;
  }
}
