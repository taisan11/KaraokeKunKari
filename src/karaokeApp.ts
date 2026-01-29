import { MidiPlayer } from './audio/midiPlayer';
import { MicrophonePitchDetector } from './audio/pitchDetector';
import { parseMidiFile, getMidiMetadata, loadMidiFromUrl, loadMidiFromFile } from './core/midiParser';
import { buildExpectedPitchArray, getExpectedMidiAt } from './core/pitchArrayBuilder';
import { ScoreTracker } from './core/scoring';
import { PitchBarVisualizer } from './ui/pitchBar';
import type {
  NoteEvent,
  ExpectedPitchArray,
  DetectedPitch,
  KaraokeState,
  PitchArrayConfig,
  PitchDetectionConfig,
  ScoringConfig,
  ScoreStats,
} from './types';

/**
 * Main karaoke application integrating all components
 */
export class KaraokeApp {
  private midiPlayer: MidiPlayer;
  private pitchDetector: MicrophonePitchDetector;
  private scoreTracker: ScoreTracker;
  private visualizer: PitchBarVisualizer | null = null;
  
  private notes: NoteEvent[] = [];
  private expectedPitches: ExpectedPitchArray | null = null;
  private currentDetectedPitch: DetectedPitch | null = null;
  
  private state: KaraokeState = {
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    duration: 0,
    score: {
      totalFrames: 0,
      perfectFrames: 0,
      acceptableFrames: 0,
      missFrames: 0,
      noDataFrames: 0,
      score: 0,
      matchedTime: 0,
      totalTime: 0,
    },
    microphoneEnabled: false,
    audioInitialized: false,
  };

  private onStateChange: ((state: KaraokeState) => void) | null = null;
  private onError: ((error: Error) => void) | null = null;

  constructor(
    pitchDetectionConfig?: Partial<PitchDetectionConfig>,
    scoringConfig?: Partial<ScoringConfig>
  ) {
    this.midiPlayer = new MidiPlayer();
    this.pitchDetector = new MicrophonePitchDetector(pitchDetectionConfig);
    this.scoreTracker = new ScoreTracker(scoringConfig);
  }

  /**
   * Initialize audio systems (must be called from user gesture for iOS)
   */
  async initialize(): Promise<void> {
    try {
      // Initialize MIDI player
      await this.midiPlayer.initialize();

      // Initialize pitch detector
      await this.pitchDetector.initialize();

      this.state.audioInitialized = true;
      this.state.microphoneEnabled = true;
      this.notifyStateChange();

      console.log('Karaoke app initialized successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err);
      throw err;
    }
  }

  /**
   * Load MIDI file from URL
   */
  async loadMidiFromUrl(url: string, config?: Partial<PitchArrayConfig>): Promise<void> {
    try {
      const midiData = await loadMidiFromUrl(url);
      await this.loadMidi(midiData, config);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err);
      throw err;
    }
  }

  /**
   * Load MIDI file from File object
   */
  async loadMidiFromFile(file: File, config?: Partial<PitchArrayConfig>): Promise<void> {
    try {
      const midiData = await loadMidiFromFile(file);
      await this.loadMidi(midiData, config);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err);
      throw err;
    }
  }

  /**
   * Load MIDI data and prepare for playback
   */
  private async loadMidi(midiData: ArrayBuffer, config?: Partial<PitchArrayConfig>): Promise<void> {
    // Parse MIDI file
    this.notes = await parseMidiFile(midiData, config?.trackIndex);
    
    if (this.notes.length === 0) {
      throw new Error('No notes found in MIDI file');
    }

    // Build expected pitch array
    this.expectedPitches = buildExpectedPitchArray(this.notes, config);

    // Load notes into MIDI player
    this.midiPlayer.loadNotes(this.notes);

    // Update state
    this.state.duration = this.midiPlayer.getDuration();
    this.state.currentTime = 0;
    this.notifyStateChange();

    console.log(`Loaded MIDI with ${this.notes.length} notes, duration: ${this.state.duration}s`);
  }

  /**
   * Get MIDI metadata
   */
  getMidiMetadata(midiData: ArrayBuffer) {
    return getMidiMetadata(midiData);
  }

  /**
   * Start playback and pitch detection
   */
  async play(): Promise<void> {
    if (!this.state.audioInitialized) {
      throw new Error('Audio not initialized. Call initialize() first.');
    }

    if (!this.expectedPitches) {
      throw new Error('No MIDI loaded. Load a MIDI file first.');
    }

    try {
      // Start MIDI playback
      await this.midiPlayer.play();

      // Set up time update callback
      this.midiPlayer.setTimeUpdateCallback((time) => {
        this.state.currentTime = time;
        this.updateScore();
        this.notifyStateChange();
      });

      // Start pitch detection
      if (this.state.microphoneEnabled) {
        await this.pitchDetector.resumeAudioContext();
        this.pitchDetector.start((pitch) => {
          this.currentDetectedPitch = pitch;
          
          // Add to visualizer if available
          if (this.visualizer && this.expectedPitches) {
            const frame = this.scoreTracker.addFrame(
              pitch,
              this.expectedPitches,
              this.state.currentTime
            );
            this.visualizer.addPitch(
              this.state.currentTime,
              pitch,
              this.expectedPitches,
              frame
            );
          } else if (this.expectedPitches) {
            // Just track score without visualization
            this.scoreTracker.addFrame(
              pitch,
              this.expectedPitches,
              this.state.currentTime
            );
          }
        });
      }

      // Start visualizer if available
      if (this.visualizer) {
        this.visualizer.start();
      }

      this.state.isPlaying = true;
      this.state.isPaused = false;
      this.notifyStateChange();

      console.log('Playback started');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err);
      throw err;
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    this.midiPlayer.pause();
    this.pitchDetector.stop();
    
    if (this.visualizer) {
      this.visualizer.stop();
    }

    this.state.isPlaying = false;
    this.state.isPaused = true;
    this.notifyStateChange();

    console.log('Playback paused');
  }

  /**
   * Stop playback and reset
   */
  stop(): void {
    this.midiPlayer.stop();
    this.pitchDetector.stop();
    
    if (this.visualizer) {
      this.visualizer.stop();
      this.visualizer.clear();
    }

    this.scoreTracker.reset();
    this.currentDetectedPitch = null;

    this.state.isPlaying = false;
    this.state.isPaused = false;
    this.state.currentTime = 0;
    this.updateScore();
    this.notifyStateChange();

    console.log('Playback stopped');
  }

  /**
   * Seek to specific time
   */
  seek(time: number): void {
    const wasPlaying = this.state.isPlaying;

    // Pause before seeking
    if (wasPlaying) {
      this.pause();
    }

    // Seek MIDI player
    this.midiPlayer.seek(time);
    this.state.currentTime = time;

    // Reset score from this point onwards
    this.scoreTracker.resetFrom(time);

    // Clear visualizer history
    if (this.visualizer) {
      this.visualizer.clear();
    }

    this.updateScore();
    this.notifyStateChange();

    // Resume if was playing
    if (wasPlaying) {
      this.play();
    }

    console.log(`Seeked to ${time}s`);
  }

  /**
   * Set visualizer canvas
   */
  setVisualizer(canvas: HTMLCanvasElement): void {
    if (this.visualizer) {
      this.visualizer.dispose();
    }

    this.visualizer = new PitchBarVisualizer(canvas);
  }

  /**
   * Enable or disable microphone
   */
  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (enabled && !this.state.microphoneEnabled) {
      try {
        await this.pitchDetector.initialize();
        this.state.microphoneEnabled = true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.handleError(err);
        throw err;
      }
    } else if (!enabled && this.state.microphoneEnabled) {
      this.pitchDetector.stop();
      this.state.microphoneEnabled = false;
    }

    this.notifyStateChange();
  }

  /**
   * Set master volume
   */
  setVolume(volume: number): void {
    this.midiPlayer.setVolume(volume);
  }

  /**
   * Get master volume
   */
  getVolume(): number {
    return this.midiPlayer.getVolume();
  }

  /**
   * Get current state
   */
  getState(): KaraokeState {
    return { ...this.state };
  }

  /**
   * Set state change callback
   */
  onStateChanged(callback: (state: KaraokeState) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Set error callback
   */
  onErrorOccurred(callback: (error: Error) => void): void {
    this.onError = callback;
  }

  /**
   * Update score statistics
   */
  private updateScore(): void {
    this.state.score = this.scoreTracker.getStats();
  }

  /**
   * Notify state change
   */
  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange({ ...this.state });
    }
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    console.error('Karaoke app error:', error);
    if (this.onError) {
      this.onError(error);
    }
  }

  /**
   * Get expected MIDI at current time
   */
  getExpectedMidiAtCurrentTime(): number | null {
    if (!this.expectedPitches) {
      return null;
    }
    return getExpectedMidiAt(this.state.currentTime, this.expectedPitches);
  }

  /**
   * Get current detected pitch
   */
  getCurrentDetectedPitch(): DetectedPitch | null {
    return this.currentDetectedPitch;
  }

  /**
   * Get score statistics
   */
  getScoreStats(): ScoreStats {
    return this.scoreTracker.getStats();
  }

  /**
   * Export scoring data
   */
  exportScore() {
    return this.scoreTracker.export();
  }

  /**
   * Cleanup and release all resources
   */
  dispose(): void {
    this.stop();
    
    this.midiPlayer.dispose();
    this.pitchDetector.dispose();
    
    if (this.visualizer) {
      this.visualizer.dispose();
    }

    this.notes = [];
    this.expectedPitches = null;
    this.currentDetectedPitch = null;

    console.log('Karaoke app disposed');
  }
}