import { Readable } from "node:stream";

export async function responseToNodeStream(res: Response): Promise<Readable> {
  const body = res.body;
  if (!body) {
    throw new Error("TTS response has no body");
  }

  const fromWeb = (
    Readable as {
      fromWeb?: (stream: unknown) => Readable;
    }
  ).fromWeb;

  if (typeof fromWeb === "function") {
    return fromWeb(body);
  }

  const arrayBuf = await res.arrayBuffer();
  return Readable.from(Buffer.from(arrayBuf));
}
