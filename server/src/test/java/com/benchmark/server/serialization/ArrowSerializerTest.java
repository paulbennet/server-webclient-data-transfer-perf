package com.benchmark.server.serialization;

import com.benchmark.server.generator.EventDataGenerator;
import com.benchmark.server.model.CalendarEvent;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class ArrowSerializerTest {
    @Test
    void roundTripPreservesCount() throws Exception {
        EventDataGenerator generator = new EventDataGenerator();
        List<CalendarEvent> events = generator.generate(100);
        ArrowSerializer serializer = new ArrowSerializer();

        byte[] payload = serializer.serialize(events);
        List<CalendarEvent> decoded = serializer.deserialize(payload);

        assertEquals(events.size(), decoded.size());
        SerializerAssertions.assertSameEvent(events.get(0), decoded.get(0));
        SerializerAssertions.assertSameEvent(
                events.get(events.size() - 1),
                decoded.get(decoded.size() - 1));
    }
}
