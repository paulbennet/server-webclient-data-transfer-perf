package com.benchmark.server.action;

import com.opensymphony.xwork2.ActionSupport;
import org.apache.struts2.ServletActionContext;

import javax.servlet.http.HttpServletResponse;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Action to trigger garbage collection for benchmark isolation.
 * This helps ensure consistent memory measurements between benchmark runs.
 */
public class GcAction extends ActionSupport {

    private InputStream inputStream;
    private String contentType = "application/json";
    private long contentLength;

    @Override
    public String execute() throws Exception {
        HttpServletResponse response = ServletActionContext.getResponse();
        applyCors(response);

        // Suggest GC to the JVM (no guarantee it will run immediately)
        long heapBefore = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory();
        System.gc();
        // Small delay to let GC potentially complete
        Thread.sleep(50);
        long heapAfter = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory();
        long freed = heapBefore - heapAfter;

        String json = String.format("{\"status\":\"ok\",\"heapBefore\":%d,\"heapAfter\":%d,\"freed\":%d}",
                heapBefore, heapAfter, freed);

        byte[] payload = json.getBytes(StandardCharsets.UTF_8);
        contentLength = payload.length;
        inputStream = new ByteArrayInputStream(payload);

        return SUCCESS;
    }

    private void applyCors(HttpServletResponse response) {
        response.setHeader("Access-Control-Allow-Origin", "*");
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
}
