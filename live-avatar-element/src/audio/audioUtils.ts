/**
 * Audio processing utilities for Azure Voice Live streaming.
 * Downsamples browser microphone input (typically 44.1 or 48 kHz) to 24 kHz PCM16 mono.
 */

export function downsampleFloat32ToPCM16(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number = 24000
): Int16Array {
  if (outputSampleRate >= inputSampleRate) {
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return pcm;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Int16Array(outputLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < output.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i++) {
      accum += input[i];
      count++;
    }

    const sample = count ? accum / count : 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    output[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return output;
}

export function arrayBufferToBase64(buffer: ArrayBuffer | ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export interface MicSession {
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  muteGain: GainNode;
  stop: () => void;
}

export async function createMicrophoneSession(
  onAudioChunk: (base64PCM16: string) => void
): Promise<MicSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioCtx();
  await audioContext.resume();

  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const muteGain = audioContext.createGain();
  muteGain.gain.value = 0;

  source.connect(processor);
  processor.connect(muteGain);
  muteGain.connect(audioContext.destination);

  let isRunning = true;

  processor.onaudioprocess = (event: AudioProcessingEvent) => {
    if (!isRunning) return;
    const input = event.inputBuffer.getChannelData(0);
    const pcm16 = downsampleFloat32ToPCM16(input, audioContext.sampleRate, 24000);
    if (!pcm16.length) return;
    const base64 = arrayBufferToBase64(pcm16.buffer);
    onAudioChunk(base64);
  };

  const stop = () => {
    isRunning = false;
    try {
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      muteGain.disconnect();
    } catch (_) {}
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch (_) {}
    try {
      if (audioContext.state !== "closed") {
        audioContext.close();
      }
    } catch (_) {}
  };

  return {
    stream,
    audioContext,
    source,
    processor,
    muteGain,
    stop,
  };
}
