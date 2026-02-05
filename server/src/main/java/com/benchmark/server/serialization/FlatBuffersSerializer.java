package com.benchmark.server.serialization;

import com.benchmark.server.flatbuffers.CalendarEventList;
import com.benchmark.server.model.CalendarEvent;
import com.google.flatbuffers.FlatBufferBuilder;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;

public class FlatBuffersSerializer implements BinarySerializer {
    @Override
    public String format() {
        return Format.FLATBUFFERS.id();
    }

    @Override
    public String contentType() {
        return "application/x-flatbuffers";
    }

    @Override
    public byte[] serialize(List<CalendarEvent> events) {
        FlatBufferBuilder builder = new FlatBufferBuilder(1024);
        int[] eventOffsets = new int[events.size()];
        for (int i = 0; i < events.size(); i++) {
            CalendarEvent event = events.get(i);
            int titleOffset = builder.createString(event.getTitle());
            int locationOffset = builder.createString(event.getLocation());
            int organizerOffset = builder.createString(event.getOrganizer());
            int descriptionOffset = builder.createString(event.getDescription());
            int timezoneOffset = builder.createString(event.getTimezone());
            int tagsOffset = com.benchmark.server.flatbuffers.CalendarEvent.createTagsVector(builder,
                    createStringOffsets(builder, event.getTags()));
            int resourcesOffset = com.benchmark.server.flatbuffers.CalendarEvent.createResourcesVector(builder,
                    createStringOffsets(builder, event.getResources()));

            eventOffsets[i] = com.benchmark.server.flatbuffers.CalendarEvent.createCalendarEvent(
                    builder,
                    event.getId(),
                    titleOffset,
                    locationOffset,
                    organizerOffset,
                    event.getStartTime(),
                    event.getEndTime(),
                    event.getAttendees(),
                    event.isAllDay(),
                    descriptionOffset,
                    tagsOffset,
                    resourcesOffset,
                    event.getCreatedAt(),
                    event.getUpdatedAt(),
                    event.getPriority(),
                    timezoneOffset);
        }
        int eventsVector = CalendarEventList.createEventsVector(builder, eventOffsets);
        int listOffset = CalendarEventList.createCalendarEventList(builder, eventsVector);
        CalendarEventList.finishCalendarEventListBuffer(builder, listOffset);

        return builder.sizedByteArray();
    }

    @Override
    public List<CalendarEvent> deserialize(byte[] payload) {
        ByteBuffer buffer = ByteBuffer.wrap(payload).order(ByteOrder.LITTLE_ENDIAN);
        CalendarEventList list = CalendarEventList.getRootAsCalendarEventList(buffer);
        int count = list.eventsLength();
        List<CalendarEvent> events = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            com.benchmark.server.flatbuffers.CalendarEvent fbEvent = list.events(i);
            if (fbEvent == null) {
                continue;
            }
            events.add(new CalendarEvent(
                    fbEvent.id(),
                    fbEvent.title(),
                    fbEvent.location(),
                    fbEvent.organizer(),
                    fbEvent.startTime(),
                    fbEvent.endTime(),
                    fbEvent.attendees(),
                    fbEvent.allDay(),
                    fbEvent.description(),
                    extractStringVector(fbEvent, true),
                    extractStringVector(fbEvent, false),
                    fbEvent.createdAt(),
                    fbEvent.updatedAt(),
                    fbEvent.priority(),
                    fbEvent.timezone()));
        }
        return events;
    }

    private int[] createStringOffsets(FlatBufferBuilder builder, List<String> values) {
        int[] offsets = new int[values.size()];
        for (int i = 0; i < values.size(); i++) {
            offsets[i] = builder.createString(values.get(i));
        }
        return offsets;
    }

    private List<String> extractStringVector(com.benchmark.server.flatbuffers.CalendarEvent fbEvent, boolean tags) {
        int length = tags ? fbEvent.tagsLength() : fbEvent.resourcesLength();
        List<String> values = new ArrayList<>(length);
        for (int i = 0; i < length; i++) {
            values.add(tags ? fbEvent.tags(i) : fbEvent.resources(i));
        }
        return values;
    }
}
