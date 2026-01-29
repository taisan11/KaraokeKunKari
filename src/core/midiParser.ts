import { Midi } from '@tonejs/midi';
import type { NoteEvent } from '../types';

/**
 * Parse MIDI file and convert to NoteEvent array
 * @param midiData - ArrayBuffer or Uint8Array of MIDI file
 * @param trackIndex - Optional specific track index to extract
 * @returns Array of NoteEvent objects
 */
export async function parseMidiFile(
  midiData: ArrayBuffer | Uint8Array,
  trackIndex?: number
): Promise<NoteEvent[]> {
  const midi = new Midi(midiData);
  const notes: NoteEvent[] = [];

  // If specific track is specified, use only that track
  if (trackIndex !== undefined && trackIndex >= 0 && trackIndex < midi.tracks.length) {
    const track = midi.tracks[trackIndex];
    for (const note of track.notes) {
      notes.push({
        time: note.time,
        duration: note.duration,
        midi: note.midi,
        velocity: note.velocity,
      });
    }
  } else {
    // Otherwise, collect notes from all tracks
    for (const track of midi.tracks) {
      for (const note of track.notes) {
        notes.push({
          time: note.time,
          duration: note.duration,
          midi: note.midi,
          velocity: note.velocity,
        });
      }
    }
  }

  // Sort by time for consistent processing
  notes.sort((a, b) => a.time - b.time);

  return notes;
}

/**
 * Get MIDI file metadata
 * @param midiData - ArrayBuffer or Uint8Array of MIDI file
 * @returns Metadata object with track info, duration, etc.
 */
export function getMidiMetadata(midiData: ArrayBuffer | Uint8Array) {
  const midi = new Midi(midiData);

  return {
    name: midi.name,
    duration: midi.duration,
    durationTicks: midi.durationTicks,
    header: {
      name: midi.header.name,
      ppq: midi.header.ppq,
      tempos: midi.header.tempos,
      timeSignatures: midi.header.timeSignatures,
    },
    tracks: midi.tracks.map((track, index) => ({
      index,
      name: track.name,
      instrument: track.instrument?.name || 'Unknown',
      noteCount: track.notes.length,
      channel: track.channel,
    })),
  };
}

/**
 * Load MIDI file from URL
 * @param url - URL to MIDI file
 * @returns ArrayBuffer of MIDI data
 */
export async function loadMidiFromUrl(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load MIDI file: ${response.statusText}`);
  }
  return await response.arrayBuffer();
}

/**
 * Load MIDI file from File object (user upload)
 * @param file - File object from input element
 * @returns ArrayBuffer of MIDI data
 */
export function loadMidiFromFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as ArrayBuffer'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}