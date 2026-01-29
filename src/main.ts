import './style.css';
import { KaraokeApp } from './karaokeApp';
import { midiToNoteName } from './core/scoring';
import type { KaraokeState } from './types';

// DOM Elements
const initSection = document.getElementById('init-section') as HTMLElement;
const modeSection = document.getElementById('mode-section') as HTMLElement;
const uploadSection = document.getElementById('upload-section') as HTMLElement;
const playerSection = document.getElementById('player-section') as HTMLElement;
const settingsSection = document.getElementById('settings-section') as HTMLElement;
const pitchDisplaySection = document.getElementById('pitch-display-section') as HTMLElement;

const initButton = document.getElementById('init-button') as HTMLButtonElement;
const initStatus = document.getElementById('init-status') as HTMLElement;

const midiFileInput = document.getElementById('midi-file-input') as HTMLInputElement;
const fileName = document.getElementById('file-name') as HTMLElement;
const midiInfo = document.getElementById('midi-info') as HTMLElement;
const midiMetadata = document.getElementById('midi-metadata') as HTMLElement;

const playButton = document.getElementById('play-button') as HTMLButtonElement;
const pauseButton = document.getElementById('pause-button') as HTMLButtonElement;
const stopButton = document.getElementById('stop-button') as HTMLButtonElement;

const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
const volumeValue = document.getElementById('volume-value') as HTMLElement;

const seekSlider = document.getElementById('seek-slider') as HTMLInputElement;
const currentTime = document.getElementById('current-time') as HTMLElement;
const durationTime = document.getElementById('duration-time') as HTMLElement;

const scoreValue = document.getElementById('score-value') as HTMLElement;
const perfectCount = document.getElementById('perfect-count') as HTMLElement;
const acceptableCount = document.getElementById('acceptable-count') as HTMLElement;
const missCount = document.getElementById('miss-count') as HTMLElement;

const pitchCanvas = document.getElementById('pitch-canvas') as HTMLCanvasElement;

const expectedPitch = document.getElementById('expected-pitch') as HTMLElement;
const detectedPitch = document.getElementById('detected-pitch') as HTMLElement;
const frequency = document.getElementById('frequency') as HTMLElement;
const clarity = document.getElementById('clarity') as HTMLElement;

const micToggle = document.getElementById('mic-toggle') as HTMLInputElement;
const resolutionSelect = document.getElementById('resolution-select') as HTMLSelectElement;
const strategySelect = document.getElementById('strategy-select') as HTMLSelectElement;

// Mode selection buttons
const modeKaraokeBtn = document.getElementById('mode-karaoke') as HTMLButtonElement;
const modePitchBtn = document.getElementById('mode-pitch') as HTMLButtonElement;

// Pitch display mode elements
const pitchDisplayNote = document.getElementById('pitch-display-note') as HTMLElement;
const pitchDisplayFreq = document.getElementById('pitch-display-freq') as HTMLElement;
const pitchDisplayClarityFill = document.getElementById('pitch-display-clarity-fill') as HTMLElement;
const pitchDisplayMidi = document.getElementById('pitch-display-midi') as HTMLElement;
const pitchDisplayClarityText = document.getElementById('pitch-display-clarity-text') as HTMLElement;
const pitchDisplayStop = document.getElementById('pitch-display-stop') as HTMLButtonElement;


// Application state
let app: KaraokeApp | null = null;
let isSeeking = false;
let currentMode: 'karaoke' | 'pitch' = 'karaoke';
let pitchDetector: any = null; // For pitch display mode

// Initialize application
initButton.addEventListener('click', async () => {
  try {
    initButton.disabled = true;
    initStatus.textContent = '初期化中...';
    initStatus.className = 'status-message';

    // Create karaoke app instance
    app = new KaraokeApp();

    // Initialize audio systems
    await app.initialize();

    // Set up visualizer
    app.setVisualizer(pitchCanvas);

    // Set up state change callback
    app.onStateChanged(handleStateChange);

    // Set up error callback
    app.onErrorOccurred(handleError);

    // Show success message
    initStatus.textContent = '✓ 初期化完了！MIDIファイルを読み込んでください。';
    initStatus.className = 'status-message success';

    // Show mode selection
    setTimeout(() => {
      initSection.classList.add('hidden');
      modeSection.classList.remove('hidden');
    }, 1000);

  } catch (error) {
    console.error('Initialization error:', error);
    initStatus.textContent = `✗ エラー: ${error instanceof Error ? error.message : String(error)}`;
    initStatus.className = 'status-message error';
    initButton.disabled = false;
  }
});

// Mode selection
modeKaraokeBtn.addEventListener('click', () => {
  currentMode = 'karaoke';
  modeKaraokeBtn.classList.add('active');
  modePitchBtn.classList.remove('active');
  
  modeSection.classList.add('hidden');
  uploadSection.classList.remove('hidden');
  settingsSection.classList.remove('hidden');
});

modePitchBtn.addEventListener('click', async () => {
  currentMode = 'pitch';
  modePitchBtn.classList.add('active');
  modeKaraokeBtn.classList.remove('active');
  
  modeSection.classList.add('hidden');
  pitchDisplaySection.classList.remove('hidden');
  
  // Start pitch display mode
  await startPitchDisplayMode();
});

// Pitch display mode
async function startPitchDisplayMode() {
  if (!app) return;
  
  try {
    // Import pitch detector dynamically
    const { MicrophonePitchDetector } = await import('./audio/pitchDetector');
    pitchDetector = new MicrophonePitchDetector();
    
    await pitchDetector.initialize();
    await pitchDetector.resumeAudioContext();
    
    pitchDetector.start((pitch: any) => {
      updatePitchDisplay(pitch);
    });
    
    console.log('Pitch display mode started');
  } catch (error) {
    console.error('Failed to start pitch display mode:', error);
    alert(`音階表示モードの開始に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function updatePitchDisplay(pitch: any) {
  const clarityPercent = pitch ? Math.round(pitch.clarity * 100) : 0;
  pitchDisplayClarityFill.style.width = `${clarityPercent}%`;
  
  if (pitch && pitch.frequency > 0) {
    const noteName = midiToNoteName(Math.round(pitch.midi));
    const midiNum = Math.round(pitch.midi);
    
    pitchDisplayNote.textContent = noteName;
    pitchDisplayNote.classList.remove('no-sound');
    pitchDisplayFreq.textContent = `${pitch.frequency.toFixed(1)} Hz`;
    pitchDisplayMidi.textContent = midiNum.toString();
    pitchDisplayClarityText.textContent = `${clarityPercent}%`;
  } else {
    pitchDisplayNote.textContent = '♪';
    pitchDisplayNote.classList.add('no-sound');
    pitchDisplayFreq.textContent = '- Hz';
    pitchDisplayMidi.textContent = '-';
    pitchDisplayClarityText.textContent = `${clarityPercent}%`;
  }
}

pitchDisplayStop.addEventListener('click', () => {
  if (pitchDetector) {
    pitchDetector.stop();
    pitchDetector.dispose();
    pitchDetector = null;
  }
  
  pitchDisplaySection.classList.add('hidden');
  modeSection.classList.remove('hidden');
  
  // Reset display
  pitchDisplayNote.textContent = '♪';
  pitchDisplayNote.classList.add('no-sound');
  pitchDisplayFreq.textContent = '- Hz';
  pitchDisplayMidi.textContent = '-';
  pitchDisplayClarityText.textContent = '-';
  pitchDisplayClarityFill.style.width = '0%';
});

// MIDI file upload
midiFileInput.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file || !app) return;

  try {
    fileName.textContent = file.name;

    // Get MIDI metadata
    const arrayBuffer = await file.arrayBuffer();
    const metadata = app.getMidiMetadata(arrayBuffer);

    // Display metadata
    midiMetadata.innerHTML = `
      <p><strong>曲名:</strong> ${metadata.name || 'Unknown'}</p>
      <p><strong>長さ:</strong> ${formatTime(metadata.duration)}</p>
      <p><strong>トラック数:</strong> ${metadata.tracks.length}</p>
      <div style="margin-top: 1rem;">
        <strong>トラック:</strong>
        <ul style="margin-left: 1.5rem; margin-top: 0.5rem;">
          ${metadata.tracks.map(track => `
            <li>
              ${track.index}: ${track.name || 'Unnamed'} 
              (${track.instrument}, ${track.noteCount} notes)
            </li>
          `).join('')}
        </ul>
      </div>
    `;
    midiInfo.classList.remove('hidden');

    // Load MIDI file
    const resolution = parseFloat(resolutionSelect.value);
    const strategy = strategySelect.value as any;

    await app.loadMidiFromFile(file, { resolution, strategy });

    // Show player section
    playerSection.classList.remove('hidden');

    // Update seek slider
    seekSlider.max = app.getState().duration.toString();

  } catch (error) {
    console.error('MIDI load error:', error);
    alert(`MIDIファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// Play button
playButton.addEventListener('click', async () => {
  if (!app) return;

  try {
    await app.play();
    playButton.classList.add('hidden');
    pauseButton.classList.remove('hidden');
  } catch (error) {
    console.error('Play error:', error);
    alert(`再生エラー: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// Pause button
pauseButton.addEventListener('click', () => {
  if (!app) return;
  app.pause();
  pauseButton.classList.add('hidden');
  playButton.classList.remove('hidden');
});

// Stop button
stopButton.addEventListener('click', () => {
  if (!app) return;
  app.stop();
  pauseButton.classList.add('hidden');
  playButton.classList.remove('hidden');
});

// Volume control
volumeSlider.addEventListener('input', () => {
  if (!app) return;
  const volume = parseFloat(volumeSlider.value);
  app.setVolume(volume);
  volumeValue.textContent = `${volume} dB`;
});

// Seek control
seekSlider.addEventListener('mousedown', () => {
  isSeeking = true;
});

seekSlider.addEventListener('touchstart', () => {
  isSeeking = true;
});

seekSlider.addEventListener('input', () => {
  if (!app || !isSeeking) return;
  const time = parseFloat(seekSlider.value);
  currentTime.textContent = formatTime(time);
});

seekSlider.addEventListener('change', () => {
  if (!app || !isSeeking) return;
  const time = parseFloat(seekSlider.value);
  app.seek(time);
  isSeeking = false;
});

seekSlider.addEventListener('mouseup', () => {
  isSeeking = false;
});

seekSlider.addEventListener('touchend', () => {
  isSeeking = false;
});

// Microphone toggle
micToggle.addEventListener('change', async () => {
  if (!app) return;

  try {
    await app.setMicrophoneEnabled(micToggle.checked);
  } catch (error) {
    console.error('Microphone error:', error);
    alert(`マイクエラー: ${error instanceof Error ? error.message : String(error)}`);
    micToggle.checked = false;
  }
});

// Settings change handlers
resolutionSelect.addEventListener('change', () => {
  // Resolution change requires reloading the MIDI file
  if (app && app.getState().duration > 0) {
    alert('解像度を変更するには、MIDIファイルを再読み込みしてください。');
  }
});

strategySelect.addEventListener('change', () => {
  // Strategy change requires reloading the MIDI file
  if (app && app.getState().duration > 0) {
    alert('戦略を変更するには、MIDIファイルを再読み込みしてください。');
  }
});

// Handle state changes
function handleStateChange(state: KaraokeState): void {
  // Update time display (only if not seeking)
  if (!isSeeking) {
    currentTime.textContent = formatTime(state.currentTime);
    seekSlider.value = state.currentTime.toString();
  }
  durationTime.textContent = formatTime(state.duration);

  // Update score display
  scoreValue.textContent = `${state.score.score.toFixed(2)}%`;
  perfectCount.textContent = state.score.perfectFrames.toString();
  acceptableCount.textContent = state.score.acceptableFrames.toString();
  missCount.textContent = state.score.missFrames.toString();

  // Update pitch info
  if (app) {
    const expectedMidi = app.getExpectedMidiAtCurrentTime();
    const detected = app.getCurrentDetectedPitch();

    expectedPitch.textContent = expectedMidi !== null ? midiToNoteName(expectedMidi) : '-';
    
    if (detected && detected.midi !== null) {
      detectedPitch.textContent = midiToNoteName(Math.round(detected.midi));
      frequency.textContent = `${detected.frequency.toFixed(2)} Hz`;
      clarity.textContent = `${(detected.clarity * 100).toFixed(1)}%`;
    } else {
      detectedPitch.textContent = '-';
      frequency.textContent = '-';
      clarity.textContent = '-';
    }
  }
}

// Handle errors
function handleError(error: Error): void {
  console.error('Application error:', error);
  alert(`エラーが発生しました: ${error.message}`);
}

// Format time as MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Handle window resize
window.addEventListener('resize', () => {
  if (pitchCanvas && app) {
    const container = pitchCanvas.parentElement;
    if (container) {
      pitchCanvas.width = container.clientWidth;
    }
  }
});

// Initial canvas sizing
window.addEventListener('load', () => {
  if (pitchCanvas) {
    const container = pitchCanvas.parentElement;
    if (container) {
      pitchCanvas.width = container.clientWidth;
    }
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (app) {
    app.dispose();
  }
  if (pitchDetector) {
    pitchDetector.dispose();
  }
});

// Prevent iOS Safari from scaling on input focus
document.addEventListener('touchstart', () => {}, { passive: true });

console.log('Karaoke Kun Kari initialized');