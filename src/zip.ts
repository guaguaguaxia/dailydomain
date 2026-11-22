import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CD_SIGNATURE = 0x02014b50;
const LFH_SIGNATURE = 0x04034b50;

export interface ZipExtractResult {
  fileName: string;
  rawBytes: Uint8Array;
}

interface CentralEntry {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function findEocdOffset(view: DataView, length: number): number {
  const minOffset = Math.max(0, length - 65557);
  for (let i = length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      return i;
    }
  }
  return -1;
}

/**
 * Extracts the primary text/CSV domain list file from a ZIP archive in memory.
 * Uses Central Directory sizes so ZIP entries with data descriptors are supported.
 */
export function extractDomainTextFromZip(zipBytes: Uint8Array): ZipExtractResult {
  if (zipBytes.length < 22) {
    throw new Error("Invalid ZIP archive: payload too small");
  }

  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const eocdOffset = findEocdOffset(view, zipBytes.length);
  if (eocdOffset < 0) {
    throw new Error("Invalid ZIP archive: EOCD signature not found");
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  if (cdOffset + cdSize > zipBytes.length) {
    throw new Error("Invalid ZIP archive: Central Directory out of bounds");
  }

  const decoder = new TextDecoder("utf-8");
  const entries: CentralEntry[] = [];
  let cursor = cdOffset;
  const cdEnd = cdOffset + cdSize;

  for (let i = 0; i < totalEntries && cursor + 46 <= cdEnd; i++) {
    if (view.getUint32(cursor, true) !== CD_SIGNATURE) {
      throw new Error("Invalid ZIP archive: bad Central Directory header signature");
    }

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const nameEnd = cursor + 46 + nameLen;
    if (nameEnd > cdEnd) {
      throw new Error("Invalid ZIP archive: entry name out of bounds");
    }

    const fileName = decoder.decode(zipBytes.subarray(cursor + 46, nameEnd));
    cursor = nameEnd + extraLen + commentLen;

    if (!fileName.endsWith("/")) {
      entries.push({
        fileName,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      });
    }
  }

  if (entries.length === 0) {
    throw new Error("ZIP archive contains no files");
  }

  const target =
    entries.find((entry) => {
      const lower = entry.fileName.toLowerCase();
      return lower.endsWith(".txt") || lower.endsWith(".csv");
    }) ?? entries.reduce((largest, cur) => (cur.uncompressedSize > largest.uncompressedSize ? cur : largest));

  if (target.localHeaderOffset + 30 > zipBytes.length) {
    throw new Error("Invalid ZIP archive: local header out of bounds");
  }
  if (view.getUint32(target.localHeaderOffset, true) !== LFH_SIGNATURE) {
    throw new Error("Invalid ZIP archive: bad local file header signature");
  }

  const localNameLen = view.getUint16(target.localHeaderOffset + 26, true);
  const localExtraLen = view.getUint16(target.localHeaderOffset + 28, true);
  const dataStart = target.localHeaderOffset + 30 + localNameLen + localExtraLen;
  const dataEnd = dataStart + target.compressedSize;

  if (dataEnd > zipBytes.length) {
    throw new Error("Invalid ZIP archive: compressed data out of bounds");
  }

  const compressedData = zipBytes.subarray(dataStart, dataEnd);
  let rawBytes: Uint8Array;

  if (target.compressionMethod === 0) {
    rawBytes = new Uint8Array(compressedData);
  } else if (target.compressionMethod === 8) {
    const inflated = inflateRawSync(compressedData);
    rawBytes = new Uint8Array(inflated.buffer, inflated.byteOffset, inflated.byteLength);
  } else {
    throw new Error(`Unsupported ZIP compression method: ${target.compressionMethod}`);
  }

  if (rawBytes.length === 0) {
    throw new Error(`ZIP entry ${target.fileName} is empty`);
  }
  if (target.uncompressedSize > 0 && rawBytes.length !== target.uncompressedSize) {
    throw new Error(
      `ZIP entry ${target.fileName} size mismatch: expected ${target.uncompressedSize}, got ${rawBytes.length}`,
    );
  }

  return { fileName: target.fileName, rawBytes };
}
