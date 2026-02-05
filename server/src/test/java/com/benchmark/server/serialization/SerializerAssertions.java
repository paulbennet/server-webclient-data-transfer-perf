package com.benchmark.server.serialization;

import com.benchmark.server.model.CalendarEvent;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;

final class SerializerAssertions {
    private SerializerAssertions() {
    }

    static void assertSameEvent(CalendarEvent expected, CalendarEvent actual) {
        assertAll(
                () -> assertEquals(expected.getId(), actual.getId()),
                () -> assertEquals(expected.getTitle(), actual.getTitle()),
                () -> assertEquals(expected.getLocation(), actual.getLocation()),
                () -> assertEquals(expected.getOrganizer(), actual.getOrganizer()),
                () -> assertEquals(expected.getStartTime(), actual.getStartTime()),
                () -> assertEquals(expected.getEndTime(), actual.getEndTime()),
                () -> assertEquals(expected.getAttendees(), actual.getAttendees()),
                () -> assertEquals(expected.isAllDay(), actual.isAllDay()),
                () -> assertEquals(expected.getDescription(), actual.getDescription()),
                () -> assertEquals(expected.getTags(), actual.getTags()),
                () -> assertEquals(expected.getResources(), actual.getResources()),
                () -> assertEquals(expected.getCreatedAt(), actual.getCreatedAt()),
                () -> assertEquals(expected.getUpdatedAt(), actual.getUpdatedAt()),
                () -> assertEquals(expected.getPriority(), actual.getPriority()),
                () -> assertEquals(expected.getTimezone(), actual.getTimezone()));
    }
}
