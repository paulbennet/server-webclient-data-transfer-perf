package com.benchmark.server.serialization;

import com.benchmark.server.model.CalendarEvent;
import org.apache.arrow.memory.BufferAllocator;
import org.apache.arrow.memory.RootAllocator;
import org.apache.arrow.vector.BigIntVector;
import org.apache.arrow.vector.BitVector;
import org.apache.arrow.vector.IntVector;
import org.apache.arrow.vector.VarCharVector;
import org.apache.arrow.vector.complex.ListVector;
import org.apache.arrow.vector.ipc.ArrowStreamReader;
import org.apache.arrow.vector.ipc.ArrowStreamWriter;
import org.apache.arrow.vector.types.pojo.ArrowType;
import org.apache.arrow.vector.types.pojo.Field;
import org.apache.arrow.vector.types.pojo.FieldType;
import org.apache.arrow.vector.types.pojo.Schema;
import org.apache.arrow.vector.VectorSchemaRoot;
import org.apache.arrow.vector.FieldVector;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class ArrowSerializer implements BinarySerializer {
    @Override
    public String format() {
        return Format.ARROW.id();
    }

    @Override
    public String contentType() {
        return "application/vnd.apache.arrow.stream";
    }

    @Override
    public byte[] serialize(List<CalendarEvent> events) throws Exception {
        try (BufferAllocator allocator = new RootAllocator(Long.MAX_VALUE)) {
            List<Field> fields = new ArrayList<>();
            List<FieldVector> vectors = new ArrayList<>();

            BigIntVector idVector = new BigIntVector("id", allocator);
            VarCharVector titleVector = new VarCharVector("title", allocator);
            VarCharVector locationVector = new VarCharVector("location", allocator);
            VarCharVector organizerVector = new VarCharVector("organizer", allocator);
            BigIntVector startTimeVector = new BigIntVector("startTime", allocator);
            BigIntVector endTimeVector = new BigIntVector("endTime", allocator);
            IntVector attendeesVector = new IntVector("attendees", allocator);
            BitVector allDayVector = new BitVector("allDay", allocator);
            VarCharVector descriptionVector = new VarCharVector("description", allocator);
            ListVector tagsVector = ListVector.empty("tags", allocator);
            ListVector resourcesVector = ListVector.empty("resources", allocator);
            BigIntVector createdAtVector = new BigIntVector("createdAt", allocator);
            BigIntVector updatedAtVector = new BigIntVector("updatedAt", allocator);
            IntVector priorityVector = new IntVector("priority", allocator);
            VarCharVector timezoneVector = new VarCharVector("timezone", allocator);

            Collections.addAll(vectors,
                    idVector,
                    titleVector,
                    locationVector,
                    organizerVector,
                    startTimeVector,
                    endTimeVector,
                    attendeesVector,
                    allDayVector,
                    descriptionVector,
                    tagsVector,
                    resourcesVector,
                    createdAtVector,
                    updatedAtVector,
                    priorityVector,
                    timezoneVector);

            fields.add(new Field("id", FieldType.nullable(new ArrowType.Int(64, true)), null));
            fields.add(new Field("title", FieldType.nullable(new ArrowType.Utf8()), null));
            fields.add(new Field("location", FieldType.nullable(new ArrowType.Utf8()), null));
            fields.add(new Field("organizer", FieldType.nullable(new ArrowType.Utf8()), null));
            fields.add(new Field("startTime", FieldType.nullable(new ArrowType.Int(64, true)), null));
            fields.add(new Field("endTime", FieldType.nullable(new ArrowType.Int(64, true)), null));
            fields.add(new Field("attendees", FieldType.nullable(new ArrowType.Int(32, true)), null));
            fields.add(new Field("allDay", FieldType.nullable(new ArrowType.Bool()), null));
            fields.add(new Field("description", FieldType.nullable(new ArrowType.Utf8()), null));
            fields.add(new Field("tags", FieldType.nullable(new ArrowType.List()),
                    Collections.singletonList(new Field("tag", FieldType.nullable(new ArrowType.Utf8()), null))));
            fields.add(new Field("resources", FieldType.nullable(new ArrowType.List()),
                    Collections.singletonList(new Field("resource", FieldType.nullable(new ArrowType.Utf8()), null))));
            fields.add(new Field("createdAt", FieldType.nullable(new ArrowType.Int(64, true)), null));
            fields.add(new Field("updatedAt", FieldType.nullable(new ArrowType.Int(64, true)), null));
            fields.add(new Field("priority", FieldType.nullable(new ArrowType.Int(32, true)), null));
            fields.add(new Field("timezone", FieldType.nullable(new ArrowType.Utf8()), null));

            int count = events.size();
            allocateVectors(count, vectors);

            int tagsIndex = 0;
            int resourcesIndex = 0;
            FieldType listChildType = FieldType.nullable(new ArrowType.Utf8());
            VarCharVector tagsData = (VarCharVector) tagsVector.addOrGetVector(listChildType).getVector();
            VarCharVector resourcesData = (VarCharVector) resourcesVector.addOrGetVector(listChildType).getVector();
            tagsData.allocateNew();
            resourcesData.allocateNew();

            for (int i = 0; i < count; i++) {
                CalendarEvent event = events.get(i);
                idVector.setSafe(i, event.getId());
                titleVector.setSafe(i, event.getTitle().getBytes(StandardCharsets.UTF_8));
                locationVector.setSafe(i, event.getLocation().getBytes(StandardCharsets.UTF_8));
                organizerVector.setSafe(i, event.getOrganizer().getBytes(StandardCharsets.UTF_8));
                startTimeVector.setSafe(i, event.getStartTime());
                endTimeVector.setSafe(i, event.getEndTime());
                attendeesVector.setSafe(i, event.getAttendees());
                allDayVector.setSafe(i, event.isAllDay() ? 1 : 0);
                descriptionVector.setSafe(i, event.getDescription().getBytes(StandardCharsets.UTF_8));
                tagsVector.startNewValue(i);
                for (String tag : event.getTags()) {
                    tagsData.setSafe(tagsIndex++, tag.getBytes(StandardCharsets.UTF_8));
                }
                tagsVector.endValue(i, event.getTags().size());
                resourcesVector.startNewValue(i);
                for (String resource : event.getResources()) {
                    resourcesData.setSafe(resourcesIndex++, resource.getBytes(StandardCharsets.UTF_8));
                }
                resourcesVector.endValue(i, event.getResources().size());
                createdAtVector.setSafe(i, event.getCreatedAt());
                updatedAtVector.setSafe(i, event.getUpdatedAt());
                priorityVector.setSafe(i, event.getPriority());
                timezoneVector.setSafe(i, event.getTimezone().getBytes(StandardCharsets.UTF_8));
            }

            idVector.setValueCount(count);
            titleVector.setValueCount(count);
            locationVector.setValueCount(count);
            organizerVector.setValueCount(count);
            startTimeVector.setValueCount(count);
            endTimeVector.setValueCount(count);
            attendeesVector.setValueCount(count);
            allDayVector.setValueCount(count);
            descriptionVector.setValueCount(count);
            tagsVector.setValueCount(count);
            resourcesVector.setValueCount(count);
            createdAtVector.setValueCount(count);
            updatedAtVector.setValueCount(count);
            priorityVector.setValueCount(count);
            timezoneVector.setValueCount(count);
            tagsData.setValueCount(tagsIndex);
            resourcesData.setValueCount(resourcesIndex);

            Schema schema = new Schema(fields);
            try (VectorSchemaRoot root = new VectorSchemaRoot(schema, vectors, count);
                    ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                    ArrowStreamWriter writer = new ArrowStreamWriter(root, null, outputStream)) {
                writer.start();
                writer.writeBatch();
                writer.end();
                return outputStream.toByteArray();
            }
        }
    }

    @Override
    public List<CalendarEvent> deserialize(byte[] payload) throws Exception {
        try (BufferAllocator allocator = new RootAllocator(Long.MAX_VALUE);
                ArrowStreamReader reader = new ArrowStreamReader(new ByteArrayInputStream(payload), allocator)) {
            List<CalendarEvent> events = new ArrayList<>();
            while (reader.loadNextBatch()) {
                VectorSchemaRoot root = reader.getVectorSchemaRoot();
                int count = root.getRowCount();
                BigIntVector idVector = (BigIntVector) root.getVector("id");
                VarCharVector titleVector = (VarCharVector) root.getVector("title");
                VarCharVector locationVector = (VarCharVector) root.getVector("location");
                VarCharVector organizerVector = (VarCharVector) root.getVector("organizer");
                BigIntVector startTimeVector = (BigIntVector) root.getVector("startTime");
                BigIntVector endTimeVector = (BigIntVector) root.getVector("endTime");
                IntVector attendeesVector = (IntVector) root.getVector("attendees");
                BitVector allDayVector = (BitVector) root.getVector("allDay");
                VarCharVector descriptionVector = (VarCharVector) root.getVector("description");
                ListVector tagsVector = (ListVector) root.getVector("tags");
                ListVector resourcesVector = (ListVector) root.getVector("resources");
                BigIntVector createdAtVector = (BigIntVector) root.getVector("createdAt");
                BigIntVector updatedAtVector = (BigIntVector) root.getVector("updatedAt");
                IntVector priorityVector = (IntVector) root.getVector("priority");
                VarCharVector timezoneVector = (VarCharVector) root.getVector("timezone");

                for (int i = 0; i < count; i++) {
                    events.add(new CalendarEvent(
                            idVector.get(i),
                            toString(titleVector, i),
                            toString(locationVector, i),
                            toString(organizerVector, i),
                            startTimeVector.get(i),
                            endTimeVector.get(i),
                            attendeesVector.get(i),
                            allDayVector.get(i) == 1,
                            toString(descriptionVector, i),
                            toStringList(tagsVector.getObject(i)),
                            toStringList(resourcesVector.getObject(i)),
                            createdAtVector.get(i),
                            updatedAtVector.get(i),
                            priorityVector.get(i),
                            toString(timezoneVector, i)));
                }
            }
            return events;
        }
    }

    private void allocateVectors(int count, List<FieldVector> vectors) {
        for (FieldVector vector : vectors) {
            vector.allocateNew();
            vector.setValueCount(count);
        }
    }

    private String toString(VarCharVector vector, int index) {
        byte[] bytes = vector.get(index);
        return bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8);
    }

    private List<String> toStringList(Object value) {
        if (value == null) {
            return Collections.emptyList();
        }
        List<?> list = (List<?>) value;
        List<String> values = new ArrayList<>(list.size());
        for (Object item : list) {
            if (item == null) {
                values.add("");
            } else {
                values.add(item.toString());
            }
        }
        return values;
    }
}
