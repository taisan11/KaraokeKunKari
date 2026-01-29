/**
 * MIDI note event representation
 */
export type NoteEvent = {
  time: number;       // seconds (Tone.Transport.seconds based)
  duration: number;   // seconds
  midi: number;       // MIDI note number (integer)
  velocity: number;   // 0..1
};

/**
 * Time-resolution based expected pitch array
 * Optimized for fast lookup during playback
 */
export interface ExpectedPitchArray {
  start: number;      // start time in seconds
  step: number;       // resolution in seconds (e.g., 0.02s)
  pitches: (number | null)[]; // MIDI note number or null
}

/**
 * Detected pitch information from microphone
 */
export interface DetectedPitch {
  midi: number | null;    // detected MIDI note number
  frequency: number;      // detected frequency in Hz
  clarity: number;        // confidence/clarity (0..1)
  timestamp: number;      // time in seconds
}

/**
 * Score frame for evaluation
 */
export interface ScoreFrame {
  time: number;
  expected: number | null;
  detected: number | null;
  diff: number | null;
  match: 'PERFECT' | 'ACCEPTABLE' | 'MISS' | 'NO_DATA';
}

/**
 * Overall score statistics
 */
export interface ScoreStats {
  totalFrames: number;
  perfectFrames: number;
  acceptableFrames: number;
  missFrames: number;
  noDataFrames: number;
  score: number; // percentage (0-100)
  matchedTime: number; // seconds
  totalTime: number; // seconds
}

/**
 * Polyphony resolution strategy
 */
export type PolyphonyStrategy = 'FIRST' | 'VELOCITY' | 'FREQUENCY';

/**
 * Configuration for expected pitch array generation
 */
export interface PitchArrayConfig {
  resolution: number;              // time step in seconds (default: 0.02)
  strategy: PolyphonyStrategy;     // polyphony resolution strategy
  trackIndex?: number;             // specific track to use (optional)
}

/**
 * Configuration for pitch detection
 */
export interface PitchDetectionConfig {
  clarityThreshold: number;        // minimum clarity to consider (default: 0.9)
  bufferSize: number;              // analyser buffer size (default: 2048)
  frameStep: number;               // frame step in seconds (default: 0.02)
}

/**
 * Configuration for scoring
 */
export interface ScoringConfig {
  perfectThreshold: number;        // max diff for PERFECT (default: 0.5 semitones)
  acceptableThreshold: number;     // max diff for ACCEPTABLE (default: 1.0 semitones)
  clarityThreshold: number;        // minimum clarity to include in scoring
}

/**
 * Karaoke state
 */
export interface KaraokeState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  score: ScoreStats;
  microphoneEnabled: boolean;
  audioInitialized: boolean;
}