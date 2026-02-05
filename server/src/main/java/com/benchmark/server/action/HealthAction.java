package com.benchmark.server.action;

import com.opensymphony.xwork2.ActionSupport;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class HealthAction extends ActionSupport {
    private InputStream inputStream;

    @Override
    public String execute() {
        inputStream = new ByteArrayInputStream("ok".getBytes(StandardCharsets.UTF_8));
        return SUCCESS;
    }

    public InputStream getInputStream() {
        return inputStream;
    }
}
