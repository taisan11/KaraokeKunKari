import type { DetectedPitch, ExpectedPitchArray, ScoreFrame } from '../types';
import { getExpectedMidiAt } from '../core/pitchArrayBuilder';
import { midiToNoteName } from '../core/scoring';

/**
 * Configuration for pitch bar visualization
 */
export interface PitchBarConfig {
  width: number;
  height: number;
  noteRange: { min: number; max: number }; // MIDI note range to display
  historyDuration: number; // seconds of history to show
  colors: {
    background: string;
    grid: string;
    expected: string;
    detected: string;
    perfect: string;
    acceptable: string;
    miss: string;
  };
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: PitchBarConfig = {
  width: 800,
  height: 200,
  noteRange: { min: 48, max: 84 }, // C3 to C6 (3 octaves)
  historyDuration: 3, // 3 seconds of history
  colors: {
    background: '#1a1a2e',
    grid: '#333333',
    expected: '#00ff88',
    detected: '#ff6b6b',
    perfect: '#00ff88',
    acceptable: '#ffd93d',
    miss: '#ff6b6b',
  },
};

/**
 * Pitch history entry
 */
interface PitchHistoryEntry {
  time: number;
  expected: number | null;
  detected: number | null;
  match?: 'PERFECT' | 'ACCEPTABLE' | 'MISS' | 'NO_DATA';
}

/**
 * Canvas-based pitch bar visualizer
 */
export class PitchBarVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: PitchBarConfig;
  private history: PitchHistoryEntry[] = [];
  private animationFrameId: number | null = null;
  private isRunning = false;

  constructor(canvas: HTMLCanvasElement, config: Partial<PitchBarConfig> = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context from canvas');
    }
    this.ctx = ctx;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Set canvas size
    this.resize(this.config.width, this.config.height);

    // Initial draw
    this.draw();
  }

  /**
   * Resize canvas
   */
  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;
    
    // Set actual canvas size (for high DPI displays)
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    
    // Set display size
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    
    // Scale context for high DPI
    this.ctx.scale(dpr, dpr);
  }

  /**
   * Add pitch data to history
   */
  addPitch(
    currentTime: number,
    detected: DetectedPitch | null,
    expected: ExpectedPitchArray | null,
    frame?: ScoreFrame
  ): void {
    const expectedMidi = expected ? getExpectedMidiAt(currentTime, expected) : null;

    this.history.push({
      time: currentTime,
      expected: expectedMidi,
      detected: detected?.midi ?? null,
      match: frame?.match,
    });

    // Remove old history entries
    const cutoffTime = currentTime - this.config.historyDuration;
    this.history = this.history.filter(entry => entry.time >= cutoffTime);
  }

  /**
   * Start rendering loop
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.renderLoop();
  }

  /**
   * Stop rendering loop
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Main rendering loop
   */
  private renderLoop = (): void => {
    if (!this.isRunning) {
      return;
    }

    this.draw();
    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  };

  /**
   * Draw the pitch bar
   */
  private draw(): void {
    const { width, height, colors } = this.config;
    const ctx = this.ctx;

    // Clear canvas
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    this.drawGrid();

    // Draw expected pitch line (target)
    this.drawExpectedPitches();

    // Draw detected pitch history
    this.drawDetectedPitches();

    // Draw current position marker
    this.drawCurrentMarker();

    // Draw note labels
    this.drawNoteLabels();
  }

  /**
   * Draw background grid
   */
  private drawGrid(): void {
    const { width, height, colors, noteRange } = this.config;
    const ctx = this.ctx;

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;

    // Horizontal lines (semitones)
    const noteCount = noteRange.max - noteRange.min + 1;
    for (let i = 0; i <= noteCount; i++) {
      const y = (i / noteCount) * height;
      
      // Thicker line for octave boundaries (C notes)
      const midiNote = noteRange.max - i;
      const isOctave = midiNote % 12 === 0;
      ctx.lineWidth = isOctave ? 2 : 1;
      ctx.globalAlpha = isOctave ? 0.5 : 0.2;

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  /**
   * Draw expected pitch line
   */
  private drawExpectedPitches(): void {
    if (this.history.length === 0) {
      return;
    }

    const { colors } = this.config;
    const ctx = this.ctx;

    ctx.strokeStyle = colors.expected;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;

    const currentTime = this.history[this.history.length - 1]?.time ?? 0;

    ctx.beginPath();
    let firstPoint = true;

    for (const entry of this.history) {
      if (entry.expected === null) {
        firstPoint = true;
        continue;
      }

      const x = this.timeToX(entry.time, currentTime);
      const y = this.midiToY(entry.expected);

      if (firstPoint) {
        ctx.moveTo(x, y);
        firstPoint = false;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /**
   * Draw detected pitch history
   */
  private drawDetectedPitches(): void {
    if (this.history.length === 0) {
      return;
    }

    const { colors } = this.config;
    const ctx = this.ctx;
    const currentTime = this.history[this.history.length - 1]?.time ?? 0;

    // Draw as connected line with color based on match quality
    for (let i = 0; i < this.history.length - 1; i++) {
      const entry = this.history[i];
      const nextEntry = this.history[i + 1];

      if (entry.detected === null || nextEntry.detected === null) {
        continue;
      }

      const x1 = this.timeToX(entry.time, currentTime);
      const y1 = this.midiToY(entry.detected);
      const x2 = this.timeToX(nextEntry.time, currentTime);
      const y2 = this.midiToY(nextEntry.detected);

      // Color based on match quality
      let color = colors.detected;
      if (entry.match === 'PERFECT') {
        color = colors.perfect;
      } else if (entry.match === 'ACCEPTABLE') {
        color = colors.acceptable;
      } else if (entry.match === 'MISS') {
        color = colors.miss;
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Draw current detected pitch as a circle
    const lastEntry = this.history[this.history.length - 1];
    if (lastEntry && lastEntry.detected !== null) {
      const x = this.timeToX(lastEntry.time, currentTime);
      const y = this.midiToY(lastEntry.detected);

      ctx.fillStyle = colors.detected;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Outline
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /**
   * Draw current position marker
   */
  private drawCurrentMarker(): void {
    const { width, height } = this.config;
    const ctx = this.ctx;

    const x = width - 100; // Current position marker

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.globalAlpha = 0.5;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  /**
   * Draw note labels on the left side
   */
  private drawNoteLabels(): void {
    const { noteRange } = this.config;
    const ctx = this.ctx;

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Show labels for C notes only
    for (let midi = noteRange.min; midi <= noteRange.max; midi++) {
      if (midi % 12 === 0) { // C notes
        const y = this.midiToY(midi);
        const noteName = midiToNoteName(midi);
        const { height } = this.config;
        if (y >= 0 && y <= height) {
          ctx.fillText(noteName, 5, y);
        }
      }
    }
  }

  /**
   * Convert time to X coordinate
   */
  private timeToX(time: number, currentTime: number): number {
    const { width, historyDuration } = this.config;
    const relativeTime = time - (currentTime - historyDuration);
    return (relativeTime / historyDuration) * width;
  }

  /**
   * Convert MIDI note to Y coordinate
   */
  private midiToY(midi: number): number {
    const { height, noteRange } = this.config;
    const range = noteRange.max - noteRange.min;
    const normalized = (noteRange.max - midi) / range;
    return normalized * height;
  }

  /**
   * Clear history
   */
  clear(): void {
    this.history = [];
    this.draw();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PitchBarConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.width !== undefined || config.height !== undefined) {
      this.resize(this.config.width, this.config.height);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PitchBarConfig {
    return { ...this.config };
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.stop();
    this.clear();
  }
}