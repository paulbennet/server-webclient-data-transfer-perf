package com.benchmark.server.serialization;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public class SerializerRegistry {
    private static final SerializerRegistry INSTANCE = new SerializerRegistry();

    private final Map<Format, BinarySerializer> serializers = new HashMap<>();

    private SerializerRegistry() {
        register(new OrgJsonSerializer());
        register(new JacksonStreamingSerializer());
        register(new FlexBuffersSerializer());
        register(new FlatBuffersSerializer());
        register(new MessagePackSerializer());
        register(new CborSerializer());
        register(new ArrowSerializer());
    }

    public static SerializerRegistry getInstance() {
        return INSTANCE;
    }

    public Map<Format, BinarySerializer> all() {
        return Collections.unmodifiableMap(serializers);
    }

    public BinarySerializer get(Format format) {
        return serializers.get(format);
    }

    private void register(BinarySerializer serializer) {
        Format format = Format.fromId(serializer.format());
        if (format != null) {
            serializers.put(format, serializer);
        }
    }
}
