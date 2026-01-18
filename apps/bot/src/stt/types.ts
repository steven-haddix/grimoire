export type SttTranscript = {
  text: string;
  isFinal: boolean;
};

export type SttStreamParams = {
  model?: string;
  language?: string;
  encoding?: string;
  sampleRate?: number;
  channels?: number;
  smartFormat?: boolean;
};

export type SttStreamHandlers = {
  onOpen?: () => void;
  onTranscript?: (transcript: SttTranscript) => void;
  onError?: (error: unknown) => void;
  onClose?: () => void;
};

export type SttStream = {
  send: (chunk: Uint8Array | ArrayBuffer) => void;
  close: () => void;
};

export interface SttProvider {
  readonly name: string;
  createStream(params: SttStreamParams, handlers: SttStreamHandlers): SttStream;
}
