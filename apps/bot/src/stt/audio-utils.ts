export function downsample48kStereoTo16kMono(pcm: Buffer): Buffer {
  const outputSamples = Math.floor(pcm.length / 12);
  const downsampled = Buffer.alloc(outputSamples * 2);
  let outOffset = 0;

  for (let i = 0; i + 1 < pcm.length; i += 12) {
    downsampled.writeInt16LE(pcm.readInt16LE(i), outOffset);
    outOffset += 2;
  }

  return outOffset === downsampled.length
    ? downsampled
    : downsampled.subarray(0, outOffset);
}
