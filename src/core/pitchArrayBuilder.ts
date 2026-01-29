import type { NoteEvent, ExpectedPitchArray, PitchArrayConfig, PolyphonyStrategy } from '../types';

/**
 * Build expected pitch array from note events with optimized time-resolution lookup
 * @param notes - Array of note events
 * @param config - Configuration for pitch array generation
 * @returns ExpectedPitchArray optimized for fast time-based lookup
 */
export function buildExpectedPitchArray(
  notes: NoteEvent[],
  config: Partial<PitchArrayConfig> = {}
): ExpectedPitchArray {
  const resolution = config.resolution ?? 0.02; // default 20ms
  const strategy: PolyphonyStrategy = config.strategy ?? 'VELOCITY';

  if (notes.length === 0) {
    return {
      start: 0,
      step: resolution,
      pitches: [],
    };
  }

  // Calculate time range
  const start = Math.min(...notes.map(n => n.time));
  const end = Math.max(...notes.map(n => n.time + n.duration));
  const len = Math.ceil((end - start) / resolution);

  // Initialize pitch slots with candidate tracking
  const pitchSlots: Map<number, NoteCandidate[]> = new Map();

  // Populate candidates for each time slot
  for (const note of notes) {
    const i0 = Math.max(0, Math.floor((note.time - start) / resolution));
    const i1 = Math.min(len, Math.ceil((note.time + note.duration - start) / resolution));

    for (let i = i0; i < i1; i++) {
      if (!pitchSlots.has(i)) {
        pitchSlots.set(i, []);
      }
      pitchSlots.get(i)!.push({
        midi: note.midi,
        velocity: note.velocity,
        time: note.time,
      });
    }
  }

  // Resolve polyphony and create final pitch array
  const pitches: (number | null)[] = new Array(len).fill(null);

  for (const [index, candidates] of pitchSlots.entries()) {
    if (candidates.length === 0) {
      continue;
    }

    pitches[index] = resolvePitch(candidates, strategy);
  }

  return {
    start,
    step: resolution,
    pitches,
  };
}

/**
 * Note candidate for a time slot
 */
interface NoteCandidate {
  midi: number;
  velocity: number;
  time: number;
}

/**
 * Resolve multiple note candidates to a single pitch based on strategy
 * @param candidates - Array of note candidates for a time slot
 * @param strategy - Polyphony resolution strategy
 * @returns Resolved MIDI note number
 */
function resolvePitch(candidates: NoteCandidate[], strategy: PolyphonyStrategy): number {
  if (candidates.length === 1) {
    return candidates[0].midi;
  }

  switch (strategy) {
    case 'FIRST':
      // Return the note that started first
      return candidates.reduce((earliest, current) =>
        current.time < earliest.time ? current : earliest
      ).midi;

    case 'VELOCITY':
      // Return the note with highest velocity
      return candidates.reduce((loudest, current) =>
        current.velocity > loudest.velocity ? current : loudest
      ).midi;

    case 'FREQUENCY':
      // Return weighted center frequency (velocity-weighted average)
      const totalWeight = candidates.reduce((sum, c) => sum + c.velocity, 0);
      const weightedSum = candidates.reduce((sum, c) => sum + c.midi * c.velocity, 0);
      return Math.round(weightedSum / totalWeight);

    default:
      // Default to velocity strategy
      return candidates.reduce((loudest, current) =>
        current.velocity > loudest.velocity ? current : loudest
      ).midi;
  }
}

/**
 * Get expected MIDI note at a specific time
 * @param time - Time in seconds
 * @param expected - ExpectedPitchArray
 * @returns MIDI note number or null if no note expected
 */
export function getExpectedMidiAt(time: number, expected: ExpectedPitchArray): number | null {
  if (time < expected.start) {
    return null;
  }

  const idx = Math.floor((time - expected.start) / expected.step);

  if (idx < 0 || idx >= expected.pitches.length) {
    return null;
  }

  return expected.pitches[idx];
}

/**
 * Get expected MIDI notes for a time range
 * @param startTime - Start time in seconds
 * @param endTime - End time in seconds
 * @param expected - ExpectedPitchArray
 * @returns Array of MIDI note numbers (may contain nulls)
 */
export function getExpectedMidiRange(
  startTime: number,
  endTime: number,
  expected: ExpectedPitchArray
): (number | null)[] {
  const result: (number | null)[] = [];
  
  const startIdx = Math.max(0, Math.floor((startTime - expected.start) / expected.step));
  const endIdx = Math.min(
    expected.pitches.length,
    Math.ceil((endTime - expected.start) / expected.step)
  );

  for (let i = startIdx; i < endIdx; i++) {
    result.push(expected.pitches[i]);
  }

  return result;
}

/**
 * Compress pitch array using run-length encoding (optional optimization)
 * @param expected - ExpectedPitchArray
 * @returns Compressed representation
 */
export function compressPitchArray(expected: ExpectedPitchArray) {
  const compressed: { value: number | null; count: number }[] = [];
  
  let currentValue = expected.pitches[0];
  let count = 1;

  for (let i = 1; i < expected.pitches.length; i++) {
    if (expected.pitches[i] === currentValue) {
      count++;
    } else {
      compressed.push({ value: currentValue, count });
      currentValue = expected.pitches[i];
      count = 1;
    }
  }

  // Push last run
  if (expected.pitches.length > 0) {
    compressed.push({ value: currentValue, count });
  }

  return {
    start: expected.start,
    step: expected.step,
    compressed,
  };
}

/**
 * Decompress run-length encoded pitch array
 * @param compressed - Compressed pitch array
 * @returns Original ExpectedPitchArray
 */
export function decompressPitchArray(compressed: {
  start: number;
  step: number;
  compressed: { value: number | null; count: number }[];
}): ExpectedPitchArray {
  const pitches: (number | null)[] = [];

  for (const run of compressed.compressed) {
    for (let i = 0; i < run.count; i++) {
      pitches.push(run.value);
    }
  }

  return {
    start: compressed.start,
    step: compressed.step,
    pitches,
  };
}