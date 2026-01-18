import type {
  SttProvider,
  SttStream,
  SttStreamHandlers,
  SttStreamParams,
} from "../stt";

export type SttServiceConfig = SttStreamParams;

export class SttService {
  constructor(
    private provider: SttProvider,
    private defaults: SttServiceConfig = {},
  ) {}

  setProvider(provider: SttProvider) {
    this.provider = provider;
  }

  getProviderName() {
    return this.provider.name;
  }

  createStream(
    handlers: SttStreamHandlers,
    params: SttStreamParams = {},
  ): SttStream {
    return this.provider.createStream({ ...this.defaults, ...params }, handlers);
  }
}
