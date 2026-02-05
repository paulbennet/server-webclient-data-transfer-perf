package com.benchmark.server.model;

import java.util.List;

public class CalendarEvent {
    private long id;
    private String title;
    private String location;
    private String organizer;
    private long startTime;
    private long endTime;
    private int attendees;
    private boolean allDay;
    private String description;
    private List<String> tags;
    private List<String> resources;
    private long createdAt;
    private long updatedAt;
    private int priority;
    private String timezone;

    public CalendarEvent() {
    }

    public CalendarEvent(long id,
            String title,
            String location,
            String organizer,
            long startTime,
            long endTime,
            int attendees,
            boolean allDay,
            String description,
            List<String> tags,
            List<String> resources,
            long createdAt,
            long updatedAt,
            int priority,
            String timezone) {
        this.id = id;
        this.title = title;
        this.location = location;
        this.organizer = organizer;
        this.startTime = startTime;
        this.endTime = endTime;
        this.attendees = attendees;
        this.allDay = allDay;
        this.description = description;
        this.tags = tags;
        this.resources = resources;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.priority = priority;
        this.timezone = timezone;
    }

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getOrganizer() {
        return organizer;
    }

    public void setOrganizer(String organizer) {
        this.organizer = organizer;
    }

    public long getStartTime() {
        return startTime;
    }

    public void setStartTime(long startTime) {
        this.startTime = startTime;
    }

    public long getEndTime() {
        return endTime;
    }

    public void setEndTime(long endTime) {
        this.endTime = endTime;
    }

    public int getAttendees() {
        return attendees;
    }

    public void setAttendees(int attendees) {
        this.attendees = attendees;
    }

    public boolean isAllDay() {
        return allDay;
    }

    public void setAllDay(boolean allDay) {
        this.allDay = allDay;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }

    public List<String> getResources() {
        return resources;
    }

    public void setResources(List<String> resources) {
        this.resources = resources;
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(long createdAt) {
        this.createdAt = createdAt;
    }

    public long getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(long updatedAt) {
        this.updatedAt = updatedAt;
    }

    public int getPriority() {
        return priority;
    }

    public void setPriority(int priority) {
        this.priority = priority;
    }

    public String getTimezone() {
        return timezone;
    }

    public void setTimezone(String timezone) {
        this.timezone = timezone;
    }
}
