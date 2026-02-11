package opencall;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Async state machine and chunked retrieval support for the OpenCALL Todo API.
 */
public final class State {

    public static class Chunk {
        public final int offset;
        public final String data;
        public final String checksum;
        public final String checksumPrevious;
        public final String state; // "partial" or "complete"
        public final String cursor;

        public Chunk(int offset, String data, String checksum, String checksumPrevious,
                     String state, String cursor) {
            this.offset = offset;
            this.data = data;
            this.checksum = checksum;
            this.checksumPrevious = checksumPrevious;
            this.state = state;
            this.cursor = cursor;
        }

        public Map<String, Object> toMap() {
            LinkedHashMap<String, Object> map = new LinkedHashMap<>();
            map.put("offset", offset);
            map.put("data", data);
            map.put("checksum", checksum);
            map.put("checksumPrevious", checksumPrevious);
            map.put("state", state);
            map.put("cursor", cursor);
            return map;
        }
    }

    public static class OperationInstance {
        public final String requestId;
        public final String op;
        public volatile String state;
        public volatile Object result;
        public volatile Map<String, Object> error;
        public final int retryAfterMs;
        public final String createdAt;
        public volatile List<Chunk> chunks;

        public OperationInstance(String requestId, String op) {
            this.requestId = requestId;
            this.op = op;
            this.state = "accepted";
            this.result = null;
            this.error = null;
            this.retryAfterMs = 100;
            this.createdAt = Instant.now().toString();
            this.chunks = null;
        }
    }

    private static ConcurrentHashMap<String, OperationInstance> instances = new ConcurrentHashMap<>();

    public static OperationInstance createInstance(String requestId, String op) {
        OperationInstance instance = new OperationInstance(requestId, op);
        instances.put(requestId, instance);
        return instance;
    }

    public static OperationInstance transitionTo(String requestId, String state,
                                                  Object result,
                                                  Map<String, Object> error,
                                                  List<Chunk> chunks) {
        OperationInstance instance = instances.get(requestId);
        if (instance == null) return null;
        instance.state = state;
        if (result != null) instance.result = result;
        if (error != null) instance.error = error;
        if (chunks != null) instance.chunks = chunks;
        return instance;
    }

    public static OperationInstance transitionTo(String requestId, String state) {
        return transitionTo(requestId, state, null, null, null);
    }

    public static OperationInstance getInstance(String requestId) {
        return instances.get(requestId);
    }

    public static void resetInstances() {
        instances = new ConcurrentHashMap<>();
    }

    public static String computeSha256(String data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return "sha256:" + hex;
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }

    public static List<Chunk> buildChunks(String data) {
        return buildChunks(data, 512);
    }

    public static List<Chunk> buildChunks(String data, int chunkSize) {
        List<Chunk> chunks = new ArrayList<>();
        int offset = 0;
        String previousChecksum = null;

        while (offset < data.length()) {
            int end = Math.min(offset + chunkSize, data.length());
            String chunkData = data.substring(offset, end);
            String checksum = computeSha256(chunkData);
            boolean isLast = end >= data.length();
            String cursor = isLast ? null :
                Base64.getEncoder().encodeToString(String.valueOf(end).getBytes(StandardCharsets.UTF_8));

            chunks.add(new Chunk(
                offset,
                chunkData,
                checksum,
                previousChecksum,
                isLast ? "complete" : "partial",
                cursor
            ));

            previousChecksum = checksum;
            offset = end;
        }

        return chunks;
    }
}
