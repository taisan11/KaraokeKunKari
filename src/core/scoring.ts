import type { ScoreFrame, ScoreStats, ScoringConfig, DetectedPitch, ExpectedPitchArray } from '../types';
import { getExpectedMidiAt } from './pitchArrayBuilder';

/**
 * Default scoring configuration
 */
const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  perfectThreshold: 0.5,      // ±0.5 semitones
  acceptableThreshold: 1.0,   // ±1.0 semitones
  clarityThreshold: 0.85,     // minimum clarity to consider
};

/**
 * Evaluate a single frame of detected pitch against expected pitch
 * @param detected - Detected pitch information
 * @param expected - Expected MIDI note number
 * @param config - Scoring configuration
 * @returns Score frame with evaluation result
 */
export function evaluateFrame(
  detected: DetectedPitch | null,
  expected: number | null,
  config: Partial<ScoringConfig> = {}
): ScoreFrame {
  const cfg = { ...DEFAULT_SCORING_CONFIG, ...config };
  const time = detected?.timestamp ?? 0;

  // No expected note at this time
  if (expected === null) {
    return {
      time,
      expected: null,
      detected: detected?.midi ?? null,
      diff: null,
      match: 'NO_DATA',
    };
  }

  // Expected note exists but no detection or clarity too low
  if (!detected || detected.midi === null || detected.clarity < cfg.clarityThreshold) {
    return {
      time,
      expected,
      detected: detected?.midi ?? null,
      diff: null,
      match: 'NO_DATA',
    };
  }

  // Calculate pitch difference in semitones
  const diff = Math.abs(detected.midi - expected);

  let match: ScoreFrame['match'];
  if (diff <= cfg.perfectThreshold) {
    match = 'PERFECT';
  } else if (diff <= cfg.acceptableThreshold) {
    match = 'ACCEPTABLE';
  } else {
    match = 'MISS';
  }

  return {
    time,
    expected,
    detected: detected.midi,
    diff,
    match,
  };
}

/**
 * Score tracker for real-time scoring during karaoke
 */
export class ScoreTracker {
  private frames: ScoreFrame[] = [];
  private config: ScoringConfig;

  constructor(config: Partial<ScoringConfig> = {}) {
    this.config = { ...DEFAULT_SCORING_CONFIG, ...config };
  }

  /**
   * Add a frame to the scoring history
   * @param detected - Detected pitch
   * @param expected - Expected pitch array
   * @param currentTime - Current playback time
   */
  addFrame(
    detected: DetectedPitch | null,
    expected: ExpectedPitchArray,
    currentTime: number
  ): ScoreFrame {
    const expectedMidi = getExpectedMidiAt(currentTime, expected);
    const frame = evaluateFrame(detected, expectedMidi, this.config);
    this.frames.push(frame);
    return frame;
  }

  /**
   * Calculate current score statistics
   * @returns Score statistics
   */
  getStats(): ScoreStats {
    let perfectFrames = 0;
    let acceptableFrames = 0;
    let missFrames = 0;
    let noDataFrames = 0;

    for (const frame of this.frames) {
      switch (frame.match) {
        case 'PERFECT':
          perfectFrames++;
          break;
        case 'ACCEPTABLE':
          acceptableFrames++;
          break;
        case 'MISS':
          missFrames++;
          break;
        case 'NO_DATA':
          noDataFrames++;
          break;
      }
    }

    const totalFrames = this.frames.length;
    const scoredFrames = perfectFrames + acceptableFrames + missFrames;
    const matchedFrames = perfectFrames + acceptableFrames;

    // Calculate percentage based on scored frames (excluding NO_DATA)
    const score = scoredFrames > 0 ? (matchedFrames / scoredFrames) * 100 : 0;

    // Calculate time statistics (assuming frames are evenly spaced)
    const frameStep = this.frames.length > 1 
      ? (this.frames[this.frames.length - 1].time - this.frames[0].time) / (this.frames.length - 1)
      : 0.02; // default to 20ms

    const matchedTime = matchedFrames * frameStep;
    const totalTime = scoredFrames * frameStep;

    return {
      totalFrames,
      perfectFrames,
      acceptableFrames,
      missFrames,
      noDataFrames,
      score: Math.round(score * 100) / 100, // round to 2 decimal places
      matchedTime,
      totalTime,
    };
  }

  /**
   * Get all scored frames
   * @returns Array of score frames
   */
  getFrames(): ScoreFrame[] {
    return [...this.frames];
  }

  /**
   * Get frames within a time range
   * @param startTime - Start time in seconds
   * @param endTime - End time in seconds
   * @returns Frames within the range
   */
  getFramesInRange(startTime: number, endTime: number): ScoreFrame[] {
    return this.frames.filter(f => f.time >= startTime && f.time <= endTime);
  }

  /**
   * Reset all scoring data
   */
  reset(): void {
    this.frames = [];
  }

  /**
   * Reset scoring data from a specific time onwards (for seeking)
   * @param time - Time to reset from
   */
  resetFrom(time: number): void {
    this.frames = this.frames.filter(f => f.time < time);
  }

  /**
   * Get recent frames for real-time display
   * @param count - Number of recent frames to get
   * @returns Recent frames
   */
  getRecentFrames(count: number): ScoreFrame[] {
    return this.frames.slice(-count);
  }

  /**
   * Export scoring data for analysis
   * @returns Scoring data object
   */
  export() {
    return {
      frames: this.frames,
      stats: this.getStats(),
      config: this.config,
    };
  }

  /**
   * Import scoring data (for loading saved sessions)
   * @param data - Exported scoring data
   */
  import(data: { frames: ScoreFrame[]; config?: Partial<ScoringConfig> }): void {
    this.frames = data.frames;
    if (data.config) {
      this.config = { ...DEFAULT_SCORING_CONFIG, ...data.config };
    }
  }
}

/**
 * Calculate score for a completed performance
 * @param frames - Array of score frames
 * @returns Final score statistics
 */
export function calculateFinalScore(frames: ScoreFrame[]): ScoreStats {
  const tracker = new ScoreTracker();
  tracker.import({ frames });
  return tracker.getStats();
}

/**
 * Convert frequency (Hz) to MIDI note number
 * @param frequency - Frequency in Hz
 * @returns MIDI note number (can be fractional)
 */
export function frequencyToMidi(frequency: number): number {
  return 12 * Math.log2(frequency / 440) + 69;
}

/**
 * Convert MIDI note number to frequency (Hz)
 * @param midi - MIDI note number
 * @returns Frequency in Hz
 */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Get note name from MIDI number
 * @param midi - MIDI note number
 * @returns Note name (e.g., "C4", "A#5")
 */
export function midiToNoteName(midi: number): string {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const note = notes[midi % 12];
  return `${note}${octave}`;
}