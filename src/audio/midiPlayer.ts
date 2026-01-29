import * as Tone from 'tone';
import type { NoteEvent } from '../types';

/**
 * MIDI player using Tone.js Transport for synchronization
 * Supports seeking and playback control
 */
export class MidiPlayer {
  private synth: Tone.PolySynth | null = null;
  private events: Tone.ToneEvent[] = [];
  private notes: NoteEvent[] = [];
  private isInitialized = false;
  private isPaused = false;
  private duration = 0;
  private onTimeUpdate: ((time: number) => void) | null = null;
  private timeUpdateInterval: number | null = null;

  constructor() {
    // Transport will be initialized on first user interaction
  }

  /**
   * Initialize audio context and synthesizer
   * Must be called from user gesture for iOS compatibility
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Start Tone.js (required for iOS)
    await Tone.start();
    console.log('Tone.js audio context started');

    // Create polyphonic synthesizer
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: 'triangle',
      },
      envelope: {
        attack: 0.005,
        decay: 0.1,
        sustain: 0.3,
        release: 0.1,
      },
    }).toDestination();

    // Set master volume
    Tone.getDestination().volume.value = -10;

    this.isInitialized = true;
    console.log('MIDI player initialized');
  }

  /**
   * Load MIDI notes and schedule them with Transport
   * @param notes - Array of note events
   */
  loadNotes(notes: NoteEvent[]): void {
    if (!this.isInitialized) {
      throw new Error('MIDI player not initialized. Call initialize() first.');
    }

    // Clear previous events
    this.clear();

    this.notes = [...notes];

    if (notes.length === 0) {
      this.duration = 0;
      return;
    }

    // Calculate duration
    this.duration = Math.max(...notes.map(n => n.time + n.duration));

    // Schedule all notes with Tone.Transport
    for (const note of notes) {
      const midiNote = Tone.Frequency(note.midi, 'midi').toNote();
      
      const event = new Tone.ToneEvent((time) => {
        if (this.synth) {
          this.synth.triggerAttackRelease(
            midiNote,
            note.duration,
            time,
            note.velocity
          );
        }
      });

      event.start(note.time);
      this.events.push(event);
    }

    console.log(`Loaded ${notes.length} notes, duration: ${this.duration}s`);
  }

  /**
   * Start or resume playback
   */
  async play(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('MIDI player not initialized. Call initialize() first.');
    }

    // Ensure audio context is running (iOS requirement)
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }

    if (this.isPaused) {
      // Resume from current position
      Tone.Transport.start();
      this.isPaused = false;
    } else {
      // Start from beginning or current position
      Tone.Transport.start();
    }

    // Start time update interval
    this.startTimeUpdateLoop();

    console.log('MIDI playback started at:', Tone.Transport.seconds);
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.isInitialized) {
      return;
    }

    Tone.Transport.pause();
    this.isPaused = true;
    this.stopTimeUpdateLoop();

    console.log('MIDI playback paused at:', Tone.Transport.seconds);
  }

  /**
   * Stop playback and reset to beginning
   */
  stop(): void {
    if (!this.isInitialized) {
      return;
    }

    Tone.Transport.stop();
    Tone.Transport.seconds = 0;
    this.isPaused = false;
    this.stopTimeUpdateLoop();

    console.log('MIDI playback stopped');
  }

  /**
   * Seek to specific time
   * @param time - Time in seconds
   */
  seek(time: number): void {
    if (!this.isInitialized) {
      return;
    }

    const wasPlaying = Tone.Transport.state === 'started';
    
    // Clamp time to valid range
    const clampedTime = Math.max(0, Math.min(time, this.duration));

    // Update transport position
    Tone.Transport.seconds = clampedTime;

    // If was playing, ensure it continues
    if (wasPlaying && this.isPaused) {
      Tone.Transport.start();
    }

    console.log('Seeked to:', clampedTime);
  }

  /**
   * Get current playback time
   * @returns Current time in seconds
   */
  getCurrentTime(): number {
    if (!this.isInitialized) {
      return 0;
    }
    return Tone.Transport.seconds;
  }

  /**
   * Get total duration
   * @returns Duration in seconds
   */
  getDuration(): number {
    return this.duration;
  }

  /**
   * Check if currently playing
   * @returns True if playing
   */
  isPlaying(): boolean {
    if (!this.isInitialized) {
      return false;
    }
    return Tone.Transport.state === 'started' && !this.isPaused;
  }

  /**
   * Set callback for time updates
   * @param callback - Function to call with current time
   */
  setTimeUpdateCallback(callback: (time: number) => void): void {
    this.onTimeUpdate = callback;
  }

  /**
   * Start time update loop
   */
  private startTimeUpdateLoop(): void {
    if (this.timeUpdateInterval !== null) {
      return;
    }

    const updateTime = () => {
      if (this.onTimeUpdate && this.isPlaying()) {
        const currentTime = this.getCurrentTime();
        this.onTimeUpdate(currentTime);

        // Auto-stop at end
        if (currentTime >= this.duration && this.duration > 0) {
          this.stop();
          return;
        }
      }

      if (this.isPlaying()) {
        this.timeUpdateInterval = requestAnimationFrame(updateTime);
      }
    };

    this.timeUpdateInterval = requestAnimationFrame(updateTime);
  }

  /**
   * Stop time update loop
   */
  private stopTimeUpdateLoop(): void {
    if (this.timeUpdateInterval !== null) {
      cancelAnimationFrame(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }
  }

  /**
   * Clear all scheduled events
   */
  clear(): void {
    // Stop and dispose all events
    for (const event of this.events) {
      event.dispose();
    }
    this.events = [];
    this.notes = [];
    this.duration = 0;

    console.log('MIDI player cleared');
  }

  /**
   * Set master volume
   * @param volume - Volume in dB (-60 to 0)
   */
  setVolume(volume: number): void {
    if (!this.isInitialized) {
      return;
    }
    Tone.getDestination().volume.value = Math.max(-60, Math.min(0, volume));
  }

  /**
   * Get master volume
   * @returns Volume in dB
   */
  getVolume(): number {
    if (!this.isInitialized) {
      return -10;
    }
    return Tone.getDestination().volume.value;
  }

  /**
   * Cleanup and release resources
   */
  dispose(): void {
    this.stop();
    this.clear();

    if (this.synth) {
      this.synth.dispose();
      this.synth = null;
    }

    this.isInitialized = false;
    console.log('MIDI player disposed');
  }

  /**
   * Get loaded notes
   * @returns Array of note events
   */
  getNotes(): NoteEvent[] {
    return [...this.notes];
  }

  /**
   * Get Transport state
   * @returns Transport state
   */
  getState(): 'started' | 'paused' | 'stopped' {
    if (!this.isInitialized) {
      return 'stopped';
    }
    if (this.isPaused) {
      return 'paused';
    }
    return Tone.Transport.state;
  }
}

/**
 * Utility function to initialize audio on user interaction (iOS requirement)
 */
export async function initializeAudio(): Promise<void> {
  await Tone.start();
  console.log('Audio context initialized on user interaction');
}