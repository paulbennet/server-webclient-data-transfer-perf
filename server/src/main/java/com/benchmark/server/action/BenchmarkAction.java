package com.benchmark.server.action;

import com.benchmark.server.generator.EventDataGenerator;
import com.benchmark.server.metrics.RequestMetrics;
import com.benchmark.server.model.CalendarEvent;
import com.benchmark.server.serialization.BinarySerializer;
import com.benchmark.server.serialization.Format;
import com.benchmark.server.serialization.SerializerRegistry;
import com.opensymphony.xwork2.ActionSupport;
import org.apache.struts2.ServletActionContext;

import javax.servlet.http.HttpServletResponse;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.List;

public class BenchmarkAction extends ActionSupport {
    private static final int SIZE_SMALL = 1000;
    private static final int SIZE_MEDIUM = 10000;
    private static final int SIZE_LARGE = 50000;

    private final EventDataGenerator generator = new EventDataGenerator();
    private InputStream inputStream;
    private String contentType;
    private long contentLength;

    private String format;
    private String size;

    @Override
    public String execute() throws Exception {
        Format parsedFormat = Format.fromId(format);
        if (parsedFormat == null) {
            return respondError(HttpServletResponse.SC_BAD_REQUEST, "Unknown format");
        }

        BinarySerializer serializer = SerializerRegistry.getInstance().get(parsedFormat);
        if (serializer == null) {
            return respondError(HttpServletResponse.SC_NOT_IMPLEMENTED, "Format not implemented");
        }

        int count = resolveSize(size);
        List<CalendarEvent> events = generator.generate(count);

        // Start metrics collection
        RequestMetrics metrics = RequestMetrics.start();

        byte[] payload;
        try {
            payload = serializer.serialize(events);
        } catch (Exception ex) {
            return respondError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, ex.getMessage());
        }

        // End metrics collection
        metrics.end();

        HttpServletResponse response = ServletActionContext.getResponse();
        applyCors(response);

        // Timing metrics
        response.setHeader("X-Serialize-Nanos", Long.toString(metrics.getElapsedNanos()));
        response.setHeader("X-Payload-Bytes", Integer.toString(payload.length));
        response.setHeader("X-Format", parsedFormat.id());

        // Memory metrics
        response.setHeader("X-Heap-Used-Before", Long.toString(metrics.getHeapUsedBefore()));
        response.setHeader("X-Heap-Used-After", Long.toString(metrics.getHeapUsedAfter()));
        response.setHeader("X-Heap-Delta", Long.toString(metrics.getHeapDelta()));

        // GC metrics
        response.setHeader("X-GC-Count", Long.toString(metrics.getGcCountDelta()));
        response.setHeader("X-GC-Time-Ms", Long.toString(metrics.getGcTimeMsDelta()));

        // CPU metrics
        response.setHeader("X-CPU-Time-Nanos", Long.toString(metrics.getCpuTimeNanosDelta()));

        // Event count for efficiency calculations
        response.setHeader("X-Event-Count", Integer.toString(count));

        contentType = serializer.contentType();
        contentLength = payload.length;
        inputStream = new ByteArrayInputStream(payload);

        return SUCCESS;
    }

    private int resolveSize(String size) {
        if (size == null || size.isBlank()) {
            return SIZE_SMALL;
        }
        String trimmed = size.trim().toLowerCase();
        if ("small".equals(trimmed)) {
            return SIZE_SMALL;
        }
        if ("medium".equals(trimmed)) {
            return SIZE_MEDIUM;
        }
        if ("large".equals(trimmed)) {
            return SIZE_LARGE;
        }
        try {
            return Integer.parseInt(trimmed);
        } catch (NumberFormatException ex) {
            return SIZE_SMALL;
        }
    }

    private String respondError(int status, String message) {
        HttpServletResponse response = ServletActionContext.getResponse();
        applyCors(response);
        response.setStatus(status);
        contentType = "text/plain";
        byte[] payload = message.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        contentLength = payload.length;
        inputStream = new ByteArrayInputStream(payload);
        return SUCCESS;
    }

    private static final String EXPOSED_HEADERS = String.join(", ",
            "X-Serialize-Nanos",
            "X-Payload-Bytes",
            "X-Format",
            "X-Heap-Used-Before",
            "X-Heap-Used-After",
            "X-Heap-Delta",
            "X-GC-Count",
            "X-GC-Time-Ms",
            "X-CPU-Time-Nanos",
            "X-Event-Count");

    private void applyCors(HttpServletResponse response) {
        response.setHeader("Access-Control-Allow-Origin", "*");
        response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type");
        response.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS);
        // Enable Resource Timing API access for TTFB measurements
        response.setHeader("Timing-Allow-Origin", "*");
    }

    public InputStream getInputStream() {
        return inputStream;
    }

    public String getContentType() {
        return contentType;
    }

    public long getContentLength() {
        return contentLength;
    }

    public void setFormat(String format) {
        this.format = format;
    }

    public void setSize(String size) {
        this.size = size;
    }
}
