/**
 * Which step of the heatmap's colour ramp a slot lands on.
 *
 * Kept apart from the colours themselves because this is arithmetic and the
 * ramp is a design decision: the component owns the five class strings, this
 * file owns which of them a room of N people actually uses.
 *
 * Two rules, and the first is why this exists. A ramp of five steps spread
 * proportionally over two submitters uses two of its five, and they are not the
 * two ends — "one of two" came out three steps up a five-step scale and sat one
 * shade away from "both", which is what a real room of two people looks like
 * most of the time. So a room uses exactly as many steps as it could ever need,
 * spread across the whole ramp, and only reaches for all five once five people
 * have answered.
 *
 * The second: the top step means *everyone*, and nothing else may take it. That
 * was already claimed in a comment and was not true — with seven submitters the
 * proportional sum put "six of seven" and "seven of seven" on the same step, so
 * the one answer people are hunting for was indistinguishable from missing one
 * person.
 */

/**
 * The steps a room of this many submitters uses, low to high, as indices into
 * the full ramp. Always includes both ends once there is more than one step.
 */
export function stepsInUse(submittedCount: number, rampLength: number): number[] {
  if (submittedCount <= 0 || rampLength <= 0) return []
  const last = rampLength - 1
  const steps = Math.min(submittedCount, rampLength)
  // One submitter is "everyone" the moment they answer, so the single step in
  // play is the top of the ramp rather than the bottom of it.
  if (steps <= 1) return [last]
  return Array.from({ length: steps }, (_, rank) =>
    Math.round((rank * last) / (steps - 1)),
  )
}

/**
 * Which of those steps a slot with `free` submitters lands on, as a position in
 * the array `stepsInUse` returned. Returns -1 for a slot nobody is free for —
 * that one is drawn as the grid's own empty cell, not as a colour.
 */
export function rankFor(
  free: number,
  submittedCount: number,
  rampLength: number,
): number {
  if (free <= 0 || submittedCount <= 0) return -1
  const steps = Math.min(submittedCount, rampLength)
  const top = steps - 1
  if (free >= submittedCount) return top
  if (top <= 0) return 0
  // Everyone owns the top step, so the partial answers are spread over the ones
  // below it: 1..submittedCount-1 across steps 0..top-1.
  const rank = Math.ceil((free / (submittedCount - 1)) * top) - 1
  return Math.min(Math.max(rank, 0), top - 1)
}
