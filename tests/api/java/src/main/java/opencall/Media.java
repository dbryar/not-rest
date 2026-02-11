package opencall;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Media store for the OpenCALL Todo API.
 */
public final class Media {

    public static final List<String> ACCEPTED_MEDIA_TYPES = List.of(
        "image/png", "image/jpeg", "application/pdf", "text/plain"
    );

    public static final int MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10MB

    public record StoredMedia(String id, byte[] data, String contentType, String filename) {}

    private static ConcurrentHashMap<String, StoredMedia> mediaStore = new ConcurrentHashMap<>();

    public static StoredMedia storeMedia(byte[] data, String contentType, String filename) {
        String id = UUID.randomUUID().toString();
        StoredMedia media = new StoredMedia(id, data, contentType, filename);
        mediaStore.put(id, media);
        return media;
    }

    public static StoredMedia getMedia(String id) {
        return mediaStore.get(id);
    }

    public static void resetMedia() {
        mediaStore = new ConcurrentHashMap<>();
    }
}
