package com.benchmark.server.serialization;

import com.benchmark.server.model.CalendarEvent;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class JacksonStreamingSerializer implements BinarySerializer {
    private static final JsonFactory JSON_FACTORY = new JsonFactory();

    @Override
    public String format() {
        return Format.JACKSONSTREAM.id();
    }

    @Override
    public String contentType() {
        return "application/json; charset=utf-8";
    }

    @Override
    public byte[] serialize(List<CalendarEvent> events) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (JsonGenerator generator = JSON_FACTORY.createGenerator(output)) {
            generator.writeStartArray();
            for (CalendarEvent event : events) {
                writeEvent(generator, event);
            }
            generator.writeEndArray();
        }
        return output.toByteArray();
    }

    @Override
    public List<CalendarEvent> deserialize(byte[] payload) throws Exception {
        try (JsonParser parser = JSON_FACTORY.createParser(payload)) {
            if (parser.nextToken() != JsonToken.START_ARRAY) {
                return Collections.emptyList();
            }
            List<CalendarEvent> events = new ArrayList<>();
            while (parser.nextToken() == JsonToken.START_OBJECT) {
                events.add(readEvent(parser));
            }
            return events;
        }
    }

    private void writeEvent(JsonGenerator generator, CalendarEvent event) throws Exception {
        generator.writeStartObject();
        generator.writeNumberField("id", event.getId());
        writeNullableString(generator, "title", event.getTitle());
        writeNullableString(generator, "location", event.getLocation());
        writeNullableString(generator, "organizer", event.getOrganizer());
        generator.writeNumberField("startTime", event.getStartTime());
        generator.writeNumberField("endTime", event.getEndTime());
        generator.writeNumberField("attendees", event.getAttendees());
        generator.writeBooleanField("allDay", event.isAllDay());
        writeNullableString(generator, "description", event.getDescription());
        writeStringArray(generator, "tags", event.getTags());
        writeStringArray(generator, "resources", event.getResources());
        generator.writeNumberField("createdAt", event.getCreatedAt());
        generator.writeNumberField("updatedAt", event.getUpdatedAt());
        generator.writeNumberField("priority", event.getPriority());
        writeNullableString(generator, "timezone", event.getTimezone());
        generator.writeEndObject();
    }

    private void writeStringArray(JsonGenerator generator, String name, List<String> values) throws Exception {
        generator.writeArrayFieldStart(name);
        if (values != null) {
            for (String value : values) {
                generator.writeString(value);
            }
        }
        generator.writeEndArray();
    }

    private void writeNullableString(JsonGenerator generator, String name, String value) throws Exception {
        generator.writeFieldName(name);
        if (value == null) {
            generator.writeNull();
        } else {
            generator.writeString(value);
        }
    }

    private CalendarEvent readEvent(JsonParser parser) throws Exception {
        CalendarEvent event = new CalendarEvent();
        List<String> tags = Collections.emptyList();
        List<String> resources = Collections.emptyList();

        while (parser.nextToken() != JsonToken.END_OBJECT) {
            String fieldName = parser.getCurrentName();
            if (fieldName == null) {
                parser.skipChildren();
                continue;
            }
            parser.nextToken();
            switch (fieldName) {
                case "id":
                    event.setId(readLong(parser));
                    break;
                case "title":
                    event.setTitle(parser.getValueAsString());
                    break;
                case "location":
                    event.setLocation(parser.getValueAsString());
                    break;
                case "organizer":
                    event.setOrganizer(parser.getValueAsString());
                    break;
                case "startTime":
                    event.setStartTime(readLong(parser));
                    break;
                case "endTime":
                    event.setEndTime(readLong(parser));
                    break;
                case "attendees":
                    event.setAttendees(readInt(parser));
                    break;
                case "allDay":
                    event.setAllDay(readBoolean(parser));
                    break;
                case "description":
                    event.setDescription(parser.getValueAsString());
                    break;
                case "tags":
                    tags = readStringArray(parser);
                    break;
                case "resources":
                    resources = readStringArray(parser);
                    break;
                case "createdAt":
                    event.setCreatedAt(readLong(parser));
                    break;
                case "updatedAt":
                    event.setUpdatedAt(readLong(parser));
                    break;
                case "priority":
                    event.setPriority(readInt(parser));
                    break;
                case "timezone":
                    event.setTimezone(parser.getValueAsString());
                    break;
                default:
                    parser.skipChildren();
                    break;
            }
        }

        event.setTags(tags);
        event.setResources(resources);
        return event;
    }

    private List<String> readStringArray(JsonParser parser) throws Exception {
        if (parser.currentToken() == JsonToken.VALUE_NULL) {
            return Collections.emptyList();
        }
        if (parser.currentToken() != JsonToken.START_ARRAY) {
            parser.skipChildren();
            return Collections.emptyList();
        }
        List<String> values = new ArrayList<>();
        while (parser.nextToken() != JsonToken.END_ARRAY) {
            values.add(parser.getValueAsString());
        }
        return values;
    }

    private long readLong(JsonParser parser) throws Exception {
        if (parser.currentToken() == JsonToken.VALUE_NULL) {
            return 0L;
        }
        return parser.getLongValue();
    }

    private int readInt(JsonParser parser) throws Exception {
        if (parser.currentToken() == JsonToken.VALUE_NULL) {
            return 0;
        }
        return parser.getIntValue();
    }

    private boolean readBoolean(JsonParser parser) throws Exception {
        if (parser.currentToken() == JsonToken.VALUE_NULL) {
            return false;
        }
        return parser.getBooleanValue();
    }
}
