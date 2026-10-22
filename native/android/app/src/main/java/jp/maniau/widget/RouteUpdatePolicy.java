package jp.maniau.widget;

import java.util.ArrayList;

/** One request at a time, quiet while stationary, and conservative local quota below the shared server quota. */
public final class RouteUpdatePolicy {
    private final ArrayList<Long> attempts = new ArrayList<>();
    private long lastAttempt = Long.MIN_VALUE, retryAfter;
    private boolean busy;
    private int failures;
    public static boolean freshFix(long now, long observedAt, double accuracyMeters) {
        return Double.isFinite(accuracyMeters) && accuracyMeters >= 0 && accuracyMeters <= 100 && observedAt <= now + 30_000 && now - observedAt < 300_000;
    }
    public boolean acquire(long now, double movedMeters, boolean hasPriorRoute) {
        attempts.removeIf(value -> now - value >= 3_600_000);
        if (busy || now < retryAfter || (lastAttempt != Long.MIN_VALUE && (now < lastAttempt || now - lastAttempt < 150_000))) return false;
        if (hasPriorRoute && movedMeters < 60 && lastAttempt != Long.MIN_VALUE && now - lastAttempt < 240_000) return false;
        if (attempts.size() >= 24) return false;
        busy = true; lastAttempt = now; attempts.add(now); return true;
    }
    public void success() { busy = false; failures = 0; retryAfter = 0; }
    public void failure(long now) { busy = false; failures = Math.min(failures + 1, 4); retryAfter = now + Math.min(1_200_000L, 150_000L * (1L << failures)); }
}
