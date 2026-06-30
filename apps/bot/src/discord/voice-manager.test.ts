import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  installDiscordVoiceMock,
  VoiceConnectionStatus,
} from "./discord-voice.mock";

// Install a complete @discordjs/voice stub before `./voice-manager` (and its
// transitive `./audio-output` import) is loaded dynamically inside each test,
// so bun never evaluates the real dual CJS/ESM module. See discord-voice.mock.
installDiscordVoiceMock();

type FakeConnection = {
  joinConfig: { channelId: string };
  state: { status: string };
  destroy: ReturnType<typeof mock>;
  subscribe: ReturnType<typeof mock>;
  receiver: {
    speaking: {
      on: ReturnType<typeof mock>;
    };
    subscribe: ReturnType<typeof mock>;
  };
};

const voiceConnectionStatus = {
  Ready: VoiceConnectionStatus.Ready,
  Destroyed: VoiceConnectionStatus.Destroyed,
  Disconnected: VoiceConnectionStatus.Disconnected,
};

let currentConnection: FakeConnection | undefined;
let joinResult: FakeConnection | undefined;
let failingReadyConnections = new WeakSet<FakeConnection>();
let queueSpeakMock = mock(async () => {});
let queueSetConnectionMock = mock(() => {});
const getVoiceConnectionMock = mock(() => currentConnection);
const joinVoiceChannelMock = mock(() => {
  if (!joinResult) {
    throw new Error("join result not configured");
  }

  currentConnection = joinResult;
  return joinResult;
});
const entersStateMock = mock(async (connection: FakeConnection) => {
  if (failingReadyConnections.has(connection)) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
  connection.state.status = voiceConnectionStatus.Ready;
  return connection;
});
const getGuildSpeechQueueMock = mock(() => ({
  speak: queueSpeakMock,
  setConnection: queueSetConnectionMock,
}));
const removeGuildSpeechQueueMock = mock(() => {});

function createConnection(
  channelId: string,
  status = voiceConnectionStatus.Ready,
): FakeConnection {
  return {
    joinConfig: { channelId },
    state: { status },
    destroy: mock(() => {}),
    subscribe: mock(() => {}),
    receiver: {
      speaking: {
        on: mock(() => {}),
      },
      subscribe: mock(() => ({})),
    },
  };
}

describe("createVoiceManager", () => {
  beforeEach(() => {
    currentConnection = undefined;
    joinResult = undefined;
    failingReadyConnections = new WeakSet<FakeConnection>();
    queueSpeakMock = mock(async () => {});
    queueSetConnectionMock = mock(() => {});
    getVoiceConnectionMock.mockImplementation(() => currentConnection);
    joinVoiceChannelMock.mockImplementation(() => {
      if (!joinResult) {
        throw new Error("join result not configured");
      }

      currentConnection = joinResult;
      return joinResult;
    });
    entersStateMock.mockImplementation(async (connection: FakeConnection) => {
      if (failingReadyConnections.has(connection)) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      connection.state.status = voiceConnectionStatus.Ready;
      return connection;
    });
    getGuildSpeechQueueMock.mockImplementation(() => ({
      speak: queueSpeakMock,
      setConnection: queueSetConnectionMock,
    }));
    removeGuildSpeechQueueMock.mockImplementation(() => {});
  });

  test("reuses a healthy same-channel connection", async () => {
    const { createVoiceManager } = await import("./voice-manager");
    const existing = createConnection("channel-1");
    currentConnection = existing;

    const voice = createVoiceManager(
      {
        client: {
          guilds: {
            cache: new Map([
              [
                "guild-1",
                {
                  voiceAdapterCreator: {},
                },
              ],
            ]),
          },
        } as never,
        tts: {} as never,
        transcription: {
          hasSession: () => false,
          handleUserStream: () => {},
        } as never,
      },
      {
        entersState: entersStateMock as never,
        getGuildSpeechQueue: getGuildSpeechQueueMock as never,
        getVoiceConnection: getVoiceConnectionMock as never,
        joinVoiceChannel: joinVoiceChannelMock as never,
        removeGuildSpeechQueue: removeGuildSpeechQueueMock as never,
      },
    );

    await voice.speak({
      guildId: "guild-1",
      voiceChannelId: "channel-1",
      text: "hello there",
      voice: { voice: "narrator" },
      shouldDisconnect: false,
    });

    expect(joinVoiceChannelMock).not.toHaveBeenCalled();
    expect(existing.destroy).not.toHaveBeenCalled();
    expect(getGuildSpeechQueueMock).toHaveBeenCalledWith({
      guildId: "guild-1",
      connection: existing,
      tts: {},
    });
    expect(queueSpeakMock).toHaveBeenCalledWith("hello there", {
      voice: "narrator",
    });
  });

  test("recreates a stale connection when readiness check aborts", async () => {
    const { createVoiceManager } = await import("./voice-manager");
    const stale = createConnection("channel-1", "connecting");
    const fresh = createConnection("channel-1", "connecting");
    currentConnection = stale;
    joinResult = fresh;
    failingReadyConnections.add(stale);

    const originalConsoleWarn = console.warn;
    console.warn = () => {};

    const voice = createVoiceManager(
      {
        client: {
          guilds: {
            cache: new Map([
              [
                "guild-1",
                {
                  voiceAdapterCreator: {},
                },
              ],
            ]),
          },
        } as never,
        tts: {} as never,
        transcription: {
          hasSession: () => false,
          handleUserStream: () => {},
        } as never,
      },
      {
        entersState: entersStateMock as never,
        getGuildSpeechQueue: getGuildSpeechQueueMock as never,
        getVoiceConnection: getVoiceConnectionMock as never,
        joinVoiceChannel: joinVoiceChannelMock as never,
        removeGuildSpeechQueue: removeGuildSpeechQueueMock as never,
      },
    );

    try {
      await voice.speak({
        guildId: "guild-1",
        voiceChannelId: "channel-1",
        text: "hello again",
        voice: { voice: "narrator" },
        shouldDisconnect: false,
      });
    } finally {
      console.warn = originalConsoleWarn;
    }

    expect(stale.destroy).toHaveBeenCalledTimes(1);
    expect(joinVoiceChannelMock).toHaveBeenCalledTimes(1);
    expect(joinVoiceChannelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "channel-1",
        daveEncryption: true,
        guildId: "guild-1",
        selfDeaf: false,
      }),
    );
    expect(getGuildSpeechQueueMock).toHaveBeenCalledWith({
      guildId: "guild-1",
      connection: fresh,
      tts: {},
    });
    expect(queueSpeakMock).toHaveBeenCalledWith("hello again", {
      voice: "narrator",
    });
  });
});
