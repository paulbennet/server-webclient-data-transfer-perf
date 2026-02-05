package com.benchmark.server;

import org.apache.catalina.Context;
import org.apache.catalina.WebResourceRoot;
import org.apache.catalina.startup.Tomcat;
import org.apache.catalina.webresources.DirResourceSet;
import org.apache.catalina.webresources.StandardRoot;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;

public class EmbeddedTomcat {
    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(System.getProperty("server.port", "8090"));
        Path webappDir = resolvePath("server.webapp", "src", "main", "webapp");
        Path classesDir = resolvePath("server.classes", "target", "classes");

        Tomcat tomcat = new Tomcat();
        tomcat.setPort(port);
        tomcat.getConnector();

        Context context = tomcat.addWebapp("", webappDir.toString());
        context.setParentClassLoader(EmbeddedTomcat.class.getClassLoader());
        WebResourceRoot resources = new StandardRoot(context);
        resources.addPreResources(new DirResourceSet(resources, "/WEB-INF/classes", classesDir.toString(), "/"));
        context.setResources(resources);

        tomcat.start();
        tomcat.getServer().await();
    }

    private static Path resolvePath(String property, String... segments) {
        String configured = System.getProperty(property);
        if (configured != null && !configured.isBlank()) {
            return Path.of(configured).toAbsolutePath();
        }
        Path candidate = joinPath(segments).toAbsolutePath();
        if (candidate.toFile().exists()) {
            return candidate;
        }
        Path serverCandidate = Paths.get("server").resolve(joinPath(segments)).toAbsolutePath();
        return serverCandidate;
    }

    private static Path joinPath(String... segments) {
        if (segments.length == 0) {
            return Paths.get("");
        }
        String first = segments[0];
        String[] rest = Arrays.copyOfRange(segments, 1, segments.length);
        return Paths.get(first, rest);
    }
}
