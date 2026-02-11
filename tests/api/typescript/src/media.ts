export interface StoredMedia {
  id: string;
  data: Uint8Array;
  contentType: string;
  filename: string;
}

let mediaStore = new Map<string, StoredMedia>();

export function storeMedia(data: Uint8Array, contentType: string, filename: string): StoredMedia {
  const id = crypto.randomUUID();
  const media: StoredMedia = { id, data, contentType, filename };
  mediaStore.set(id, media);
  return media;
}

export function getMedia(id: string): StoredMedia | null {
  return mediaStore.get(id) || null;
}

export function resetMedia(): void {
  mediaStore = new Map();
}

export const ACCEPTED_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "text/plain",
];

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10MB
