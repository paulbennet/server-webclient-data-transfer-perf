package com.benchmark.server.metrics;

import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryUsage;
import java.lang.management.ThreadMXBean;
import java.util.List;

/**
 * Utility class to capture JVM metrics before and after an operation.
 * Tracks heap memory, GC activity, and CPU time for benchmarking purposes.
 */
public class RequestMetrics {

    private static final MemoryMXBean MEMORY_BEAN = ManagementFactory.getMemoryMXBean();
    private static final ThreadMXBean THREAD_BEAN = ManagementFactory.getThreadMXBean();
    private static final List<GarbageCollectorMXBean> GC_BEANS = ManagementFactory.getGarbageCollectorMXBeans();

    // Snapshot fields - before
    private long heapUsedBefore;
    private long gcCountBefore;
    private long gcTimeMsBefore;
    private long cpuTimeNanosBefore;
    private long startNanos;

    // Snapshot fields - after
    private long heapUsedAfter;
    private long gcCountAfter;
    private long gcTimeMsAfter;
    private long cpuTimeNanosAfter;
    private long endNanos;

    // Computed deltas
    private long heapDelta;
    private long gcCountDelta;
    private long gcTimeMsDelta;
    private long cpuTimeNanosDelta;
    private long elapsedNanos;

    private RequestMetrics() {
        // Use factory method
    }

    /**
     * Start capturing metrics. Call this before the operation you want to measure.
     * 
     * @return A new RequestMetrics instance with before-snapshots captured
     */
    public static RequestMetrics start() {
        RequestMetrics metrics = new RequestMetrics();
        metrics.captureBeforeSnapshot();
        return metrics;
    }

    /**
     * End capturing metrics. Call this after the operation completes.
     * Calculates all deltas between before and after snapshots.
     * 
     * @return this instance for chaining
     */
    public RequestMetrics end() {
        captureAfterSnapshot();
        calculateDeltas();
        return this;
    }

    private void captureBeforeSnapshot() {
        // Force GC metrics to be current (optional, may add overhead)
        // System.gc(); // Disabled - too expensive for benchmarks

        startNanos = System.nanoTime();
        heapUsedBefore = getHeapUsed();
        gcCountBefore = getTotalGcCount();
        gcTimeMsBefore = getTotalGcTimeMs();
        cpuTimeNanosBefore = getCurrentThreadCpuTime();
    }

    private void captureAfterSnapshot() {
        endNanos = System.nanoTime();
        cpuTimeNanosAfter = getCurrentThreadCpuTime();
        heapUsedAfter = getHeapUsed();
        gcCountAfter = getTotalGcCount();
        gcTimeMsAfter = getTotalGcTimeMs();
    }

    private void calculateDeltas() {
        elapsedNanos = endNanos - startNanos;
        heapDelta = heapUsedAfter - heapUsedBefore;
        gcCountDelta = gcCountAfter - gcCountBefore;
        gcTimeMsDelta = gcTimeMsAfter - gcTimeMsBefore;
        cpuTimeNanosDelta = cpuTimeNanosAfter - cpuTimeNanosBefore;
    }

    private static long getHeapUsed() {
        MemoryUsage heap = MEMORY_BEAN.getHeapMemoryUsage();
        return heap.getUsed();
    }

    private static long getTotalGcCount() {
        long total = 0;
        for (GarbageCollectorMXBean gc : GC_BEANS) {
            long count = gc.getCollectionCount();
            if (count >= 0) {
                total += count;
            }
        }
        return total;
    }

    private static long getTotalGcTimeMs() {
        long total = 0;
        for (GarbageCollectorMXBean gc : GC_BEANS) {
            long time = gc.getCollectionTime();
            if (time >= 0) {
                total += time;
            }
        }
        return total;
    }

    private static long getCurrentThreadCpuTime() {
        if (THREAD_BEAN.isCurrentThreadCpuTimeSupported()) {
            return THREAD_BEAN.getCurrentThreadCpuTime();
        }
        return -1;
    }

    // Getters for before snapshots

    public long getHeapUsedBefore() {
        return heapUsedBefore;
    }

    public long getGcCountBefore() {
        return gcCountBefore;
    }

    public long getGcTimeMsBefore() {
        return gcTimeMsBefore;
    }

    // Getters for after snapshots

    public long getHeapUsedAfter() {
        return heapUsedAfter;
    }

    public long getGcCountAfter() {
        return gcCountAfter;
    }

    public long getGcTimeMsAfter() {
        return gcTimeMsAfter;
    }

    // Getters for deltas

    /**
     * @return Change in heap memory used (bytes). Positive means allocation,
     *         negative means GC freed memory.
     */
    public long getHeapDelta() {
        return heapDelta;
    }

    /**
     * @return Number of GC collections that occurred during the operation
     */
    public long getGcCountDelta() {
        return gcCountDelta;
    }

    /**
     * @return Total GC pause time during the operation (milliseconds)
     */
    public long getGcTimeMsDelta() {
        return gcTimeMsDelta;
    }

    /**
     * @return CPU time consumed by the current thread (nanoseconds). -1 if not
     *         supported.
     */
    public long getCpuTimeNanosDelta() {
        return cpuTimeNanosDelta;
    }

    /**
     * @return Wall-clock elapsed time (nanoseconds)
     */
    public long getElapsedNanos() {
        return elapsedNanos;
    }

    /**
     * @return true if CPU time measurement is supported on this JVM
     */
    public boolean isCpuTimeSupported() {
        return THREAD_BEAN.isCurrentThreadCpuTimeSupported();
    }

    @Override
    public String toString() {
        return String.format(
                "RequestMetrics[elapsed=%dns, heapDelta=%d, gcCount=%d, gcTime=%dms, cpuTime=%dns]",
                elapsedNanos, heapDelta, gcCountDelta, gcTimeMsDelta, cpuTimeNanosDelta);
    }
}
