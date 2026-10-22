package jp.maniau.widget;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** The user chooses one HTTPS deployment; credentials, fragments and non-HTTPS URLs are rejected. */
public final class TrustedOrigin {
    public final String origin;
    private TrustedOrigin(String origin) { this.origin = origin; }
    public static TrustedOrigin from(String input) {
        if (input == null || input.length() > 2048) throw new IllegalArgumentException("HTTPS URL required");
        try {
            URI uri = new URI(input.trim());
            String host = uri.getHost(); int port = uri.getPort();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getUserInfo() != null || uri.getFragment() != null || uri.getQuery() != null || (port != -1 && port != 443)) throw new IllegalArgumentException("HTTPS origin required");
            if (!(uri.getPath() == null || uri.getPath().isEmpty() || "/".equals(uri.getPath()))) throw new IllegalArgumentException("Root URL required");
            return new TrustedOrigin("https://" + host.toLowerCase(Locale.ROOT));
        } catch (URISyntaxException e) { throw new IllegalArgumentException("Invalid HTTPS URL"); }
    }
    public boolean permits(String input) {
        try {
            URI uri = new URI(input); URI trusted = URI.create(origin);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getUserInfo() == null && trusted.getHost().equalsIgnoreCase(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (RuntimeException | URISyntaxException e) { return false; }
    }
}
