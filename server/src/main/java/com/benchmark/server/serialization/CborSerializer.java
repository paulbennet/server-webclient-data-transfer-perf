package com.benchmark.server.serialization;

import com.benchmark.server.model.CalendarEvent;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.dataformat.cbor.CBORFactory;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;

public class CborSerializer implements BinarySerializer {
    private static final ObjectMapper MAPPER = new ObjectMapper(new CBORFactory());

    @Override
    public String format() {
        return Format.CBOR.id();
    }

    @Override
    public String contentType() {
        return "application/cbor";
    }

    @Override
    public byte[] serialize(List<CalendarEvent> events) throws Exception {
        return MAPPER.writeValueAsBytes(events);
    }

    @Override
    public List<CalendarEvent> deserialize(byte[] payload) throws Exception {
        return MAPPER.readValue(payload, new TypeReference<List<CalendarEvent>>() {
        });
    }
}
