package com.benchmark.server.serialization;

import com.benchmark.server.model.CalendarEvent;
import com.google.flatbuffers.FlexBuffers;
import com.google.flatbuffers.FlexBuffersBuilder;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

public class FlexBuffersSerializer implements BinarySerializer {
    @Override
    public String format() {
        return Format.FLEXBUFFERS.id();
    }

    @Override
    public String contentType() {
        return "application/x-flexbuffers";
    }

    @Override
    public byte[] serialize(List<CalendarEvent> events) {
        FlexBuffersBuilder builder = new FlexBuffersBuilder(1024);
        int vector = builder.startVector();
        for (CalendarEvent event : events) {
            int map = builder.startMap();
            builder.putInt("id", event.getId());
            builder.putString("title", event.getTitle());
            builder.putString("location", event.getLocation());
            builder.putString("organizer", event.getOrganizer());
            builder.putInt("startTime", event.getStartTime());
            builder.putInt("endTime", event.getEndTime());
            builder.putInt("attendees", event.getAttendees());
            builder.putBoolean("allDay", event.isAllDay());
            builder.putString("description", event.getDescription());
            int tagsVector = builder.startVector();
            for (String tag : event.getTags()) {
                builder.putString(null, tag);
            }
            builder.endVector("tags", tagsVector, false, false);
            int resourcesVector = builder.startVector();
            for (String resource : event.getResources()) {
                builder.putString(null, resource);
            }
            builder.endVector("resources", resourcesVector, false, false);
            builder.putInt("createdAt", event.getCreatedAt());
            builder.putInt("updatedAt", event.getUpdatedAt());
            builder.putInt("priority", event.getPriority());
            builder.putString("timezone", event.getTimezone());
            builder.endMap(null, map);
        }
        builder.endVector(null, vector, false, false);
        ByteBuffer buffer = builder.finish();
        byte[] payload = new byte[buffer.remaining()];
        buffer.get(payload);
        return payload;
    }

    @Override
    public List<CalendarEvent> deserialize(byte[] payload) {
        FlexBuffers.Reference root = FlexBuffers.getRoot(ByteBuffer.wrap(payload));
        FlexBuffers.Vector vector = root.asVector();
        List<CalendarEvent> events = new ArrayList<>(vector.size());
        for (int i = 0; i < vector.size(); i++) {
            FlexBuffers.Map map = vector.get(i).asMap();
            List<String> tags = toStringList(map.get("tags").asVector());
            List<String> resources = toStringList(map.get("resources").asVector());
            events.add(new CalendarEvent(
                    map.get("id").asLong(),
                    map.get("title").asString(),
                    map.get("location").asString(),
                    map.get("organizer").asString(),
                    map.get("startTime").asLong(),
                    map.get("endTime").asLong(),
                    map.get("attendees").asInt(),
                    map.get("allDay").asBoolean(),
                    map.get("description").asString(),
                    tags,
                    resources,
                    map.get("createdAt").asLong(),
                    map.get("updatedAt").asLong(),
                    map.get("priority").asInt(),
                    map.get("timezone").asString()));
        }
        return events;
    }

    private List<String> toStringList(FlexBuffers.Vector vector) {
        List<String> values = new ArrayList<>(vector.size());
        for (int i = 0; i < vector.size(); i++) {
            values.add(vector.get(i).asString());
        }
        return values;
    }
}
