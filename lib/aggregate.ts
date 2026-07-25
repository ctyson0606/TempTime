export interface Aggregated {
  submittedCount: number
  /** How many submitters are busy in each slot. */
  busyCounts: number[]
  /** How many submitters are free in each slot. Always `submittedCount - busy`. */
  freeCounts: number[]
}

export interface BestSlot {
  startSlot: number
  /** Exclusive, so `endSlot - startSlot` is the length in slots. */
  endSlot: number
  freeCount: number
  /** False means this is a fallback: the best available, not everyone. */
  isEveryone: boolean
}

export interface BestSlotOptions {
  /** Needed to keep runs inside a single day. See `findBestSlots`. */
  slotsPerDay: number
  /** Shortest run worth recommending. Default 2 slots. */
  minDurationSlots?: number
  /** How many to return. Default 3. */
  limit?: number
}

/**
 * Overlay every submitted mask.
 *
 * Takes `total` explicitly rather than reading it off the first mask, because
 * the zero-submission case still has to return arrays of the right length —
 * that is the state a room sits in until someone submits.
 */
export function aggregate(masks: readonly string[], total: number): Aggregated {
  const busyCounts = new Array<number>(total).fill(0)

  for (const mask of masks) {
    if (mask.length !== total) {
      throw new RangeError(`mask length ${mask.length}, expected ${total}`)
    }
    for (let i = 0; i < total; i++) {
      if (mask[i] === '1') busyCounts[i]++
    }
  }

  return {
    submittedCount: masks.length,
    busyCounts,
    freeCounts: busyCounts.map((busy) => masks.length - busy),
  }
}

/** Maximal runs of `target` within one day's slice of the grid. */
function runsWithinDays(
  freeCounts: readonly number[],
  target: number,
  slotsPerDay: number,
): Array<{ startSlot: number; endSlot: number }> {
  const runs: Array<{ startSlot: number; endSlot: number }> = []

  for (let dayStart = 0; dayStart < freeCounts.length; dayStart += slotsPerDay) {
    const dayEnd = Math.min(dayStart + slotsPerDay, freeCounts.length)
    let runStart: number | null = null

    for (let i = dayStart; i < dayEnd; i++) {
      if (freeCounts[i] === target) {
        if (runStart === null) runStart = i
      } else if (runStart !== null) {
        runs.push({ startSlot: runStart, endSlot: i })
        runStart = null
      }
    }
    if (runStart !== null) runs.push({ startSlot: runStart, endSlot: dayEnd })
  }

  return runs
}

/**
 * Rank the best windows to meet.
 *
 * Two tiers. First everyone-is-free runs of at least `minDurationSlots`. If
 * there are none, fall back to runs at whatever the highest free count is, with
 * the duration floor dropped to one slot — by then the answer is "here is the
 * best that exists", and a short window beats showing nothing. Callers tell the
 * two apart with `isEveryone`.
 *
 * Runs never cross a day boundary. Adjacent indices are not adjacent in time:
 * one day's last slot ends at 24:00 and the next day's first starts at 08:00,
 * and when the dates are not consecutive the gap can be weeks. Scanning the flat
 * array would happily recommend a 400-hour window spanning both.
 */
export function findBestSlots(
  freeCounts: readonly number[],
  submittedCount: number,
  opts: BestSlotOptions,
): BestSlot[] {
  const { slotsPerDay } = opts
  const minDurationSlots = opts.minDurationSlots ?? 2
  const limit = opts.limit ?? 3

  if (submittedCount <= 0 || freeCounts.length === 0 || slotsPerDay <= 0) return []

  const rank = (
    runs: Array<{ startSlot: number; endSlot: number }>,
    minLength: number,
    freeCount: number,
  ): BestSlot[] =>
    runs
      .filter((run) => run.endSlot - run.startSlot >= minLength)
      .sort(
        (a, b) =>
          b.endSlot - b.startSlot - (a.endSlot - a.startSlot) ||
          a.startSlot - b.startSlot,
      )
      .slice(0, limit)
      .map((run) => ({
        ...run,
        freeCount,
        isEveryone: freeCount === submittedCount,
      }))

  const everyone = rank(
    runsWithinDays(freeCounts, submittedCount, slotsPerDay),
    minDurationSlots,
    submittedCount,
  )
  if (everyone.length > 0) return everyone

  const best = Math.max(...freeCounts)
  if (best <= 0) return []

  return rank(runsWithinDays(freeCounts, best, slotsPerDay), 1, best)
}
