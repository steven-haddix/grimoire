import { describe, expect, mock, test } from "bun:test";
import { PassThrough } from "node:stream";
import {
  AudioPlayerStatus,
  installDiscordVoiceMock,
  StreamType,
} from "./discord-voice.mock";

type Listener = (...args: unknown[]) => void;

function createFakePlayer() {
  const listeners = new Map<string, Listener[]>();

  const player = {
    on: mock((event: string, listener: Listener) => {
      const current = listeners.get(event) ?? [];
      current.push(listener);
      listeners.set(event, current);
      return player;
    }),
    off: mock((event: string, listener: Listener) => {
      const current = listeners.get(event) ?? [];
      listeners.set(
        event,
        current.filter((candidate) => candidate !== listener),
      );
      return player;
    }),
    play: mock(() => {
      queueMicrotask(() => {
        for (const listener of listeners.get(AudioPlayerStatus.Idle) ?? []) {
          listener();
        }
      });
    }),
    stop: mock(() => {}),
  };

  return player;
}

const createdPlayers: ReturnType<typeof createFakePlayer>[] = [];
const createAudioPlayerMock = mock(() => {
  const player = createFakePlayer();
  createdPlayers.push(player);
  return player;
});
const createAudioResourceMock = mock((stream: unknown, options: unknown) => ({
  stream,
  options,
}));

installDiscordVoiceMock({
  createAudioPlayer: createAudioPlayerMock,
  createAudioResource: createAudioResourceMock,
});

describe("GuildSpeechQueue", () => {
  test("subscribes to the voice connection and plays synthesized PCM", async () => {
    const { GuildSpeechQueue } = await import("./audio-output");
    const pcm = new PassThrough();
    pcm.end(Buffer.from([1, 2, 3, 4]));

    const tts = {
      synthesizeToPcmStream: mock(async () => pcm),
    };

    const connection = {
      subscribe: mock(() => {}),
    };

    const queue = new GuildSpeechQueue(connection as never, tts as never);

    await queue.speak("Beware the dungeon", { voice: "narrator" });

    expect(connection.subscribe).toHaveBeenCalledTimes(1);
    expect(createAudioPlayerMock).toHaveBeenCalledTimes(1);
    expect(tts.synthesizeToPcmStream).toHaveBeenCalledTimes(1);
    expect(tts.synthesizeToPcmStream).toHaveBeenCalledWith(
      {
        text: "Beware the dungeon",
        voice: { voice: "narrator" },
      },
      {
        signal: expect.any(AbortSignal),
      },
    );
    expect(createAudioResourceMock).toHaveBeenCalledWith(expect.anything(), {
      inputType: StreamType.Raw,
    });
    expect(createdPlayers[0]?.play).toHaveBeenCalledTimes(1);
  });
});
