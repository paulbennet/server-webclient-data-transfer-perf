package com.benchmark.server.serialization;

public enum Format {
    ORGJSON("orgjson"),
    JACKSONSTREAM("jacksonstream"),
    FLEXBUFFERS("flexbuffers"),
    FLATBUFFERS("flatbuffers"),
    MESSAGEPACK("messagepack"),
    CBOR("cbor"),
    ARROW("arrow");

    private final String id;

    Format(String id) {
        this.id = id;
    }

    public String id() {
        return id;
    }

    public static Format fromId(String value) {
        for (Format format : values()) {
            if (format.id.equalsIgnoreCase(value)) {
                return format;
            }
        }
        return null;
    }
}
