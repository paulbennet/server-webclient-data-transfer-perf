package com.benchmark.server.generator;

import com.benchmark.server.model.CalendarEvent;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class EventDataGenerator {
    private static final long SEED = 42L;
    private static final String[] TITLES = {
            "Standup", "Planning", "1:1", "Design Review", "Incident Review",
            "Roadmap", "Sprint Demo", "Retro", "All Hands", "Ops Sync"
    };
    private static final String[] LOCATIONS = {
            "Room 1", "Room 2", "Room 3", "HQ", "Remote", "Zoom"
    };
    private static final String[] TAGS = {
            "team", "urgent", "customer", "internal", "release", "oncall"
    };
    private static final String[] RESOURCES = {
            "Projector", "Whiteboard", "Conference Phone", "Screen Share"
    };
    private static final String[] TIMEZONES = {
            "UTC", "America/Los_Angeles", "Europe/London", "Asia/Kolkata"
    };

    public List<CalendarEvent> generate(int count) {
        Random random = new Random(SEED + count);
        List<CalendarEvent> events = new ArrayList<>(count);
        long baseTime = 1700000000000L;

        for (int i = 0; i < count; i++) {
            long start = baseTime + (i * 900_000L) + random.nextInt(300_000);
            long end = start + 1_800_000L + random.nextInt(300_000);
            int attendees = 1 + random.nextInt(25);
            boolean allDay = random.nextInt(20) == 0;
            int priority = 1 + random.nextInt(5);
            String title = TITLES[random.nextInt(TITLES.length)] + " " + (i + 1);
            String location = LOCATIONS[random.nextInt(LOCATIONS.length)];
            String organizer = "user" + (random.nextInt(500) + 1) + "@example.com";
            String description = "Event " + (i + 1) + " details";
            List<String> tags = pickMany(TAGS, random, 2 + random.nextInt(2));
            List<String> resources = pickMany(RESOURCES, random, 1 + random.nextInt(2));
            String timezone = TIMEZONES[random.nextInt(TIMEZONES.length)];
            long createdAt = start - 3_600_000L;
            long updatedAt = start - 1_800_000L;

            events.add(new CalendarEvent(
                    i + 1,
                    title,
                    location,
                    organizer,
                    start,
                    end,
                    attendees,
                    allDay,
                    description,
                    tags,
                    resources,
                    createdAt,
                    updatedAt,
                    priority,
                    timezone));
        }

        return events;
    }

    private List<String> pickMany(String[] pool, Random random, int count) {
        List<String> values = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            values.add(pool[random.nextInt(pool.length)]);
        }
        return values;
    }
}
