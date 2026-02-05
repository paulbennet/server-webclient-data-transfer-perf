package com.benchmark.server.serialization;

import com.benchmark.server.model.CalendarEvent;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class OrgJsonSerializer implements BinarySerializer {
    @Override
    public String format() {
        return Format.ORGJSON.id();
    }

    @Override
    public String contentType() {
        return "application/json; charset=utf-8";
    }

    @Override
    public byte[] serialize(List<CalendarEvent> events) {
        JSONArray array = new JSONArray();
        for (CalendarEvent event : events) {
            array.put(toJson(event));
        }
        return array.toString().getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public List<CalendarEvent> deserialize(byte[] payload) {
        JSONArray array = new JSONArray(new String(payload, StandardCharsets.UTF_8));
        List<CalendarEvent> events = new ArrayList<>(array.length());
        for (int i = 0; i < array.length(); i += 1) {
            JSONObject object = array.getJSONObject(i);
            events.add(fromJson(object));
        }
        return events;
    }

    private JSONObject toJson(CalendarEvent event) {
        JSONObject object = new JSONObject();
        object.put("id", event.getId());
        object.put("title", event.getTitle());
        object.put("location", event.getLocation());
        object.put("organizer", event.getOrganizer());
        object.put("startTime", event.getStartTime());
        object.put("endTime", event.getEndTime());
        object.put("attendees", event.getAttendees());
        object.put("allDay", event.isAllDay());
        object.put("description", event.getDescription());
        object.put("tags", listToJson(event.getTags()));
        object.put("resources", listToJson(event.getResources()));
        object.put("createdAt", event.getCreatedAt());
        object.put("updatedAt", event.getUpdatedAt());
        object.put("priority", event.getPriority());
        object.put("timezone", event.getTimezone());
        return object;
    }

    private JSONArray listToJson(List<String> values) {
        if (values == null) {
            return new JSONArray();
        }
        return new JSONArray(values);
    }

    private CalendarEvent fromJson(JSONObject object) {
        CalendarEvent event = new CalendarEvent();
        event.setId(object.optLong("id"));
        event.setTitle(optString(object, "title"));
        event.setLocation(optString(object, "location"));
        event.setOrganizer(optString(object, "organizer"));
        event.setStartTime(object.optLong("startTime"));
        event.setEndTime(object.optLong("endTime"));
        event.setAttendees(object.optInt("attendees"));
        event.setAllDay(object.optBoolean("allDay"));
        event.setDescription(optString(object, "description"));
        event.setTags(readStringList(object.optJSONArray("tags")));
        event.setResources(readStringList(object.optJSONArray("resources")));
        event.setCreatedAt(object.optLong("createdAt"));
        event.setUpdatedAt(object.optLong("updatedAt"));
        event.setPriority(object.optInt("priority"));
        event.setTimezone(optString(object, "timezone"));
        return event;
    }

    private String optString(JSONObject object, String key) {
        if (object.isNull(key)) {
            return null;
        }
        return object.optString(key, null);
    }

    private List<String> readStringList(JSONArray array) {
        if (array == null) {
            return Collections.emptyList();
        }
        List<String> values = new ArrayList<>(array.length());
        for (int i = 0; i < array.length(); i += 1) {
            values.add(array.optString(i, null));
        }
        return values;
    }
}
