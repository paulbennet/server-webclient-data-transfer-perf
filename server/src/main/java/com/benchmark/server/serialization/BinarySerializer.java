package com.benchmark.server.serialization;

import com.benchmark.server.model.CalendarEvent;

import java.util.List;

public interface BinarySerializer {
    String format();

    String contentType();

    byte[] serialize(List<CalendarEvent> events) throws Exception;

    List<CalendarEvent> deserialize(byte[] payload) throws Exception;
}
