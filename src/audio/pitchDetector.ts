import { PitchDetector } from 'pitchy';
import type { DetectedPitch, PitchDetectionConfig } from '../types';
import { frequencyToMidi } from '../core/scoring';

/**
 * Default pitch detection configuration
 */
const DEFAULT_CONFIG: PitchDetectionConfig = {
  clarityThreshold: 0.85,
  bufferSize: 2048,
  frameStep: 0.02, // 20ms
};

/**
 * Real-time pitch detector using microphone input
 */
export class MicrophonePitchDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private detector: PitchDetector<Float32Array> | null = null;
  private stream: MediaStream | null = null;
  private buffer: Float32Array | null = null;
  private config: PitchDetectionConfig;
  private isRunning = false;
  private animationFrameId: number | null = null;
  private onPitchDetected: ((pitch: DetectedPitch) => void) | null = null;
  private lastDetectionTime = 0;

  constructor(config: Partial<PitchDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize audio context and microphone
   * Must be called from user gesture for iOS compatibility
   */
  async initialize(): Promise<void> {
    if (this.audioContext) {
      return; // Already initialized
    }

    // Create audio context with low latency hint for iOS
    this.audioContext = new AudioContext({
      latencyHint: 'interactive',
      sampleRate: 48000, // iOS prefers 48kHz
    });

    // Request microphone access
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      });
    } catch (error) {
      throw new Error(`Failed to access microphone: ${error}`);
    }

    // Create audio nodes
    this.microphone = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.config.bufferSize * 2;
    this.analyser.smoothingTimeConstant = 0.8;

    // Connect nodes (do NOT connect to destination to avoid feedback)
    this.microphone.connect(this.analyser);

    // Initialize pitch detector
    this.buffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    this.detector = PitchDetector.forFloat32Array(this.analyser.fftSize);

    console.log('Microphone initialized with sample rate:', this.audioContext.sampleRate);
  }

  /**
   * Start pitch detection loop
   * @param callback - Callback function called with detected pitch
   */
  start(callback: (pitch: DetectedPitch) => void): void {
    if (!this.audioContext || !this.analyser || !this.detector || !this.buffer) {
      throw new Error('Pitch detector not initialized. Call initialize() first.');
    }

    if (this.isRunning) {
      return; // Already running
    }

    this.isRunning = true;
    this.onPitchDetected = callback;
    this.lastDetectionTime = performance.now();

    this.detectPitch();
  }

  /**
   * Stop pitch detection
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Internal pitch detection loop
   */
  private detectPitch = (): void => {
    if (!this.isRunning || !this.analyser || !this.detector || !this.buffer || !this.audioContext) {
      return;
    }

    const now = performance.now();
    const elapsed = (now - this.lastDetectionTime) / 1000;

    // Throttle detection based on frameStep
    if (elapsed >= this.config.frameStep) {
      this.lastDetectionTime = now;

      // Get time-domain data from analyser
      const tempBuffer = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(tempBuffer);
      
      // Copy to our buffer for pitch detection
      this.buffer.set(tempBuffer);

      // Detect pitch using autocorrelation
      const [frequency, clarity] = this.detector.findPitch(this.buffer, this.audioContext.sampleRate);

      const detectedPitch: DetectedPitch = {
        frequency: frequency,
        clarity: clarity,
        midi: clarity >= this.config.clarityThreshold && frequency > 0 
          ? frequencyToMidi(frequency) 
          : null,
        timestamp: this.audioContext.currentTime,
      };

      if (this.onPitchDetected) {
        this.onPitchDetected(detectedPitch);
      }
    }

    // Continue loop
    this.animationFrameId = requestAnimationFrame(this.detectPitch);
  };

  /**
   * Get current audio context state
   */
  getAudioContextState(): AudioContextState | null {
    return this.audioContext?.state ?? null;
  }

  /**
   * Resume audio context (required for iOS after user gesture)
   */
  async resumeAudioContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      console.log('Audio context resumed');
    }
  }

  /**
   * Check if pitch detector is running
   */
  isDetecting(): boolean {
    return this.isRunning;
  }

  /**
   * Cleanup and release resources
   */
  dispose(): void {
    this.stop();

    // Stop microphone stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Disconnect audio nodes
    if (this.microphone) {
      this.microphone.disconnect();
      this.microphone = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.detector = null;
    this.buffer = null;
    this.onPitchDetected = null;

    console.log('Pitch detector disposed');
  }

  /**
   * Get current configuration
   */
  getConfig(): PitchDetectionConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart if running)
   */
  updateConfig(config: Partial<PitchDetectionConfig>): void {
    const wasRunning = this.isRunning;
    const callback = this.onPitchDetected;

    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...config };

    if (wasRunning && callback) {
      this.start(callback);
    }
  }
}

/**
 * Utility function to check if microphone is available
 */
export async function isMicrophoneAvailable(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(device => device.kind === 'audioinput');
  } catch {
    return false;
  }
}

/**
 * Utility function to request microphone permission
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch {
    return false;
  }
}