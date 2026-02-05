package com.benchmark.server.serialization;

import com.benchmark.server.model.CalendarEvent;
import org.msgpack.core.MessagePack;
import org.msgpack.core.MessagePacker;
import org.msgpack.core.MessageUnpacker;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MessagePackSerializer implements BinarySerializer {
    private static final String[] KEYS = {
            "id", "title", "location", "organizer", "startTime", "endTime",
            "attendees", "allDay", "description", "tags", "resources",
            "createdAt", "updatedAt", "priority", "timezone"
    };

    @Override
    public String format() {
        return Format.MESSAGEPACK.id();
    }

    @Override
    public String contentType() {
        return "application/x-msgpack";
    }

    @Override
    public byte[] serialize(List<CalendarEvent> events) throws Exception {
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        MessagePacker packer = MessagePack.newDefaultPacker(outputStream);
        packer.packArrayHeader(events.size());
        for (CalendarEvent event : events) {
            packer.packMapHeader(KEYS.length);
            packer.packString("id").packLong(event.getId());
            packer.packString("title").packString(event.getTitle());
            packer.packString("location").packString(event.getLocation());
            packer.packString("organizer").packString(event.getOrganizer());
            packer.packString("startTime").packLong(event.getStartTime());
            packer.packString("endTime").packLong(event.getEndTime());
            packer.packString("attendees").packInt(event.getAttendees());
            packer.packString("allDay").packBoolean(event.isAllDay());
            packer.packString("description").packString(event.getDescription());
            packer.packString("tags");
            packer.packArrayHeader(event.getTags().size());
            for (String tag : event.getTags()) {
                packer.packString(tag);
            }
            packer.packString("resources");
            packer.packArrayHeader(event.getResources().size());
            for (String resource : event.getResources()) {
                packer.packString(resource);
            }
            packer.packString("createdAt").packLong(event.getCreatedAt());
            packer.packString("updatedAt").packLong(event.getUpdatedAt());
            packer.packString("priority").packInt(event.getPriority());
            packer.packString("timezone").packString(event.getTimezone());
        }
        packer.flush();
        return outputStream.toByteArray();
    }

    @Override
    public List<CalendarEvent> deserialize(byte[] payload) throws Exception {
        MessageUnpacker unpacker = MessagePack.newDefaultUnpacker(new ByteArrayInputStream(payload));
        int size = unpacker.unpackArrayHeader();
        List<CalendarEvent> events = new ArrayList<>(size);
        for (int i = 0; i < size; i++) {
            int mapSize = unpacker.unpackMapHeader();
            Map<String, Object> values = new HashMap<>(mapSize);
            for (int j = 0; j < mapSize; j++) {
                String key = unpacker.unpackString();
                switch (key) {
                    case "id":
                        values.put(key, unpacker.unpackLong());
                        break;
                    case "title":
                    case "location":
                    case "organizer":
                    case "description":
                    case "timezone":
                        values.put(key, unpacker.unpackString());
                        break;
                    case "startTime":
                    case "endTime":
                    case "createdAt":
                    case "updatedAt":
                        values.put(key, unpacker.unpackLong());
                        break;
                    case "attendees":
                    case "priority":
                        values.put(key, unpacker.unpackInt());
                        break;
                    case "allDay":
                        values.put(key, unpacker.unpackBoolean());
                        break;
                    case "tags":
                    case "resources":
                        int listSize = unpacker.unpackArrayHeader();
                        List<String> list = new ArrayList<>(listSize);
                        for (int k = 0; k < listSize; k++) {
                            list.add(unpacker.unpackString());
                        }
                        values.put(key, list);
                        break;
                    default:
                        unpacker.skipValue();
                        break;
                }
            }
            events.add(new CalendarEvent(
                    toLong(values.get("id")),
                    (String) values.get("title"),
                    (String) values.get("location"),
                    (String) values.get("organizer"),
                    toLong(values.get("startTime")),
                    toLong(values.get("endTime")),
                    toInt(values.get("attendees")),
                    toBoolean(values.get("allDay")),
                    (String) values.get("description"),
                    castList(values.get("tags")),
                    castList(values.get("resources")),
                    toLong(values.get("createdAt")),
                    toLong(values.get("updatedAt")),
                    toInt(values.get("priority")),
                    (String) values.get("timezone")));
        }
        return events;
    }

    @SuppressWarnings("unchecked")
    private List<String> castList(Object value) {
        return (List<String>) value;
    }

    private long toLong(Object value) {
        return value == null ? 0L : ((Number) value).longValue();
    }

    private int toInt(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }

    private boolean toBoolean(Object value) {
        return value != null && (Boolean) value;
    }
}
