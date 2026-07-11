import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const appPackage = 'com.actionanand.scrollix.app';
const javaDir = join('android', 'app', 'src', 'main', 'java', ...appPackage.split('.'));
const mainActivityPath = join(javaDir, 'MainActivity.java');
const pipPluginPath = join(javaDir, 'ScrollixPipPlugin.java');
const browserPluginPath = join(javaDir, 'ScrollixBrowserPlugin.java');
const postActivityPath = join(javaDir, 'ScrollixPostActivity.java');
const manifestPath = join('android', 'app', 'src', 'main', 'AndroidManifest.xml');
const stylesPaths = [
  join('android', 'app', 'src', 'main', 'res', 'values', 'styles.xml'),
  join('android', 'app', 'src', 'main', 'res', 'values-v31', 'styles.xml'),
];

mkdirSync(javaDir, { recursive: true });

writeFileSync(
  pipPluginPath,
  `package ${appPackage};

import android.app.PictureInPictureParams;
import android.os.Build;
import android.util.Rational;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScrollixPip")
public class ScrollixPipPlugin extends Plugin {
  @PluginMethod
  public void isSupported(PluginCall call) {
    JSObject result = new JSObject();
    result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
    call.resolve(result);
  }

  @PluginMethod
  public void enter(PluginCall call) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      call.reject("Picture-in-picture requires Android 8.0 or newer.");
      return;
    }

    int width = Math.max(1, call.getInt("width", 400));
    int height = Math.max(1, call.getInt("height", 225));
    PictureInPictureParams params = new PictureInPictureParams.Builder()
      .setAspectRatio(new Rational(width, height))
      .build();
    getActivity().enterPictureInPictureMode(params);
    call.resolve();
  }
}
`,
);

writeFileSync(
  browserPluginPath,
  `package ${appPackage};

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "ScrollixBrowser")
public class ScrollixBrowserPlugin extends Plugin {
  @PluginMethod
  public void open(PluginCall call) {
    String url = call.getString("url");
    if (url == null || url.trim().isEmpty()) {
      call.reject("A URL is required.");
      return;
    }

    Intent intent = new Intent(getActivity(), ScrollixPostActivity.class);
    intent.putExtra("url", url);
    intent.putExtra("title", call.getString("title", "Post"));
    getActivity().startActivity(intent);
    call.resolve();
  }

  @PluginMethod
  public void openOffline(PluginCall call) {
    String url = call.getString("url");
    String html = call.getString("html");
    if (url == null || url.trim().isEmpty() || html == null || html.trim().isEmpty()) {
      call.reject("A URL and HTML are required.");
      return;
    }

    ScrollixPostActivity.pendingHtml = html;
    ScrollixPostActivity.pendingBaseUrl = call.getString("baseUrl", url);

    Intent intent = new Intent(getActivity(), ScrollixPostActivity.class);
    intent.putExtra("url", url);
    intent.putExtra("title", call.getString("title", "Post"));
    intent.putExtra("offline", true);
    getActivity().startActivity(intent);
    call.resolve();
  }

  @PluginMethod
  public void openExternal(PluginCall call) {
    String url = call.getString("url");
    if (url == null || url.trim().isEmpty()) {
      call.reject("A URL is required.");
      return;
    }

    try {
      Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
      getActivity().startActivity(intent);
      call.resolve();
    } catch (Exception ex) {
      call.reject("No browser can handle this URL.");
    }
  }

  @PluginMethod
  public void fetchHtml(PluginCall call) {
    String url = call.getString("url");
    if (url == null || url.trim().isEmpty()) {
      call.reject("A URL is required.");
      return;
    }

    new Thread(() -> {
      try {
        String html = downloadHtml(url).html;
        JSObject result = new JSObject();
        result.put("html", html);
        getActivity().runOnUiThread(() -> call.resolve(result));
      } catch (Exception ex) {
        getActivity().runOnUiThread(() -> call.reject("Unable to fetch offline content."));
      }
    }).start();
  }

  @PluginMethod
  public void consumeAppLink(PluginCall call) {
    JSObject result = new JSObject();
    result.put("url", MainActivity.consumePendingAppLink());
    call.resolve(result);
  }

  @PluginMethod
  public void fetchPreview(PluginCall call) {
    String url = call.getString("url");
    if (url == null || url.trim().isEmpty()) {
      call.reject("A URL is required.");
      return;
    }

    new Thread(() -> {
      try {
        boolean useCrawler = prefersCrawlerUserAgent(url);
        DownloadedHtml page = downloadHtml(url, useCrawler);
        if (!useCrawler && isChallengePage(page.html)) {
          // Sites such as Reddit serve a "please wait" verification wall to normal
          // browsers but return proper Open Graph tags to link-preview crawlers.
          useCrawler = true;
          page = downloadHtml(url, true);
        }
        page = resolvePreviewPage(page, url, useCrawler);
        JSObject result = extractPreview(page.html, page.finalUrl);
        getActivity().runOnUiThread(() -> call.resolve(result));
      } catch (Exception ex) {
        getActivity().runOnUiThread(() -> call.reject("Unable to fetch link preview."));
      }
    }).start();
  }

  private DownloadedHtml downloadHtml(String rawUrl) throws Exception {
    return downloadHtml(rawUrl, false);
  }

  private DownloadedHtml downloadHtml(String rawUrl, boolean useCrawlerUserAgent) throws Exception {
    return downloadHtml(rawUrl, 0, useCrawlerUserAgent);
  }

  private DownloadedHtml downloadHtml(String rawUrl, int redirects, boolean useCrawlerUserAgent) throws Exception {
    HttpURLConnection connection = (HttpURLConnection) new URL(rawUrl).openConnection();
    connection.setInstanceFollowRedirects(true);
    connection.setConnectTimeout(15000);
    connection.setReadTimeout(20000);
    connection.setRequestProperty("User-Agent", useCrawlerUserAgent
      ? "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
      : "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 Scrollix");
    connection.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    connection.setRequestProperty("Accept-Language", "en-US,en;q=0.9");

    int status = connection.getResponseCode();
    if (status >= 300 && status < 400 && redirects < 5) {
      String location = connection.getHeaderField("Location");
      connection.disconnect();
      if (location != null && !location.trim().isEmpty()) {
        return downloadHtml(new URL(new URL(rawUrl), location).toString(), redirects + 1, useCrawlerUserAgent);
      }
    }

    try (InputStream input = connection.getInputStream();
         BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
      StringBuilder html = new StringBuilder();
      String line;
      while ((line = reader.readLine()) != null) {
        html.append(line).append('\\n');
      }
      return new DownloadedHtml(html.toString(), connection.getURL().toString());
    } finally {
      connection.disconnect();
    }
  }

  private static class DownloadedHtml {
    final String html;
    final String finalUrl;

    DownloadedHtml(String html, String finalUrl) {
      this.html = html;
      this.finalUrl = finalUrl;
    }
  }

  private DownloadedHtml resolvePreviewPage(DownloadedHtml page, String originalUrl, boolean useCrawlerUserAgent) {
    if (!isFacebookUrl(originalUrl) || hasUsefulPreview(page.html)) return page;

    DownloadedHtml best = page;
    String target = firstNonEmpty(
      metaContent(page.html, "property", "og:url"),
      linkHref(page.html, "canonical"),
      metaRefreshUrl(page.html),
      facebookContentUrl(page.html)
    );

    best = tryPreviewTarget(best, target, useCrawlerUserAgent);
    if (hasUsefulPreview(best.html)) return best;

    String shareCode = facebookShareCode(originalUrl);
    if (!shareCode.isEmpty()) {
      String[] candidates = new String[] {
        "https://m.facebook.com/share/p/" + shareCode + "/",
        "https://mbasic.facebook.com/share/p/" + shareCode + "/",
        "https://www.facebook.com/share/p/" + shareCode + "/?mibextid=wwXIfr"
      };
      for (String candidate : candidates) {
        best = tryPreviewTarget(best, candidate, useCrawlerUserAgent);
        if (hasUsefulPreview(best.html)) return best;
      }
    }

    return best;
  }

  private DownloadedHtml tryPreviewTarget(DownloadedHtml fallback, String target, boolean useCrawlerUserAgent) {
    if (target == null || target.trim().isEmpty()) return fallback;
    String resolvedTarget = absoluteUrl(fallback.finalUrl, target.trim());
    if (resolvedTarget.equals(fallback.finalUrl)) return fallback;

    try {
      return downloadHtml(resolvedTarget, useCrawlerUserAgent);
    } catch (Exception ignored) {
      return fallback;
    }
  }

  private boolean hasUsefulPreview(String html) {
    String image = firstNonEmpty(
      metaContent(html, "property", "og:image"),
      metaContent(html, "property", "og:image:url"),
      metaContent(html, "name", "twitter:image"),
      firstImageSrc(html)
    );
    return isUsefulImage(image);
  }

  private JSObject extractPreview(String html, String sourceUrl) {
    String title = firstNonEmpty(
      metaContent(html, "property", "og:title"),
      metaContent(html, "name", "twitter:title"),
      titleTag(html)
    );
    String description = firstNonEmpty(
      metaContent(html, "property", "og:description"),
      metaContent(html, "name", "description"),
      metaContent(html, "name", "twitter:description")
    );
    String image = firstNonEmpty(
      metaContent(html, "property", "og:image"),
      metaContent(html, "property", "og:image:url"),
      metaContent(html, "name", "twitter:image"),
      metaContent(html, "name", "thumbnail"),
      firstImageSrc(html)
    );
    String previewUrl = firstNonEmpty(
      metaContent(html, "property", "og:url"),
      linkHref(html, "canonical"),
      sourceUrl
    );
    String logo = firstNonEmpty(
      metaContent(html, "property", "og:logo"),
      linkHref(html, "apple-touch-icon"),
      linkHref(html, "icon")
    );

    JSObject result = new JSObject();
    result.put("title", cleanText(title));
    result.put("description", cleanText(description));
    result.put("image", resolveImage(sourceUrl, image));
    result.put("url", absoluteUrl(sourceUrl, cleanText(previewUrl)));
    result.put("logo", absoluteUrl(sourceUrl, cleanText(logo)));
    return result;
  }

  private String resolveImage(String sourceUrl, String image) {
    String cleaned = cleanImageUrl(sourceUrl, image);
    if (cleaned.isEmpty()) return "";
    // Facebook/Instagram/Reddit CDN images reject requests whose referer is the app
    // origin (https://localhost), so download them natively and inline as a data URI.
    // This mirrors how link-preview crawlers (e.g. WhatsApp) render the image reliably.
    if (!prefersCrawlerUserAgent(sourceUrl)) return cleaned;
    String inlined = inlineImage(cleaned);
    return inlined.isEmpty() ? cleaned : inlined;
  }

  private String inlineImage(String imageUrl) {
    if (imageUrl == null || imageUrl.trim().isEmpty()) return "";
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(imageUrl).openConnection();
      connection.setInstanceFollowRedirects(true);
      connection.setConnectTimeout(15000);
      connection.setReadTimeout(20000);
      connection.setRequestProperty("User-Agent", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)");
      connection.setRequestProperty("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8");

      int status = connection.getResponseCode();
      if (status < 200 || status >= 300) return "";

      String contentType = connection.getContentType();
      String mime = contentType != null && contentType.toLowerCase().startsWith("image/")
        ? contentType.split(";")[0].trim()
        : "image/jpeg";

      try (InputStream input = connection.getInputStream();
           ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
        byte[] chunk = new byte[8192];
        long total = 0;
        long max = 3L * 1024 * 1024;
        int read;
        while ((read = input.read(chunk)) != -1) {
          total += read;
          if (total > max) return "";
          buffer.write(chunk, 0, read);
        }
        if (buffer.size() == 0) return "";
        return "data:" + mime + ";base64," + Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
      }
    } catch (Exception ignored) {
      return "";
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  private boolean prefersCrawlerUserAgent(String rawUrl) {
    return isFacebookUrl(rawUrl) || isInstagramUrl(rawUrl) || isRedditUrl(rawUrl);
  }

  private boolean isChallengePage(String html) {
    if (html == null || html.isEmpty()) return false;
    // A genuine article can mention these words, so only treat the page as a wall
    // when it also lacks Open Graph title and image metadata.
    if (!metaContent(html, "property", "og:title").trim().isEmpty()
      || !metaContent(html, "property", "og:image").trim().isEmpty()) {
      return false;
    }
    String lower = html.toLowerCase();
    return lower.contains("please wait")
      || lower.contains("checking your browser")
      || lower.contains("just a moment")
      || lower.contains("verifying you are human")
      || lower.contains("enable javascript and cookies")
      || lower.contains("whoa there")
      || lower.contains("captcha");
  }

  private boolean isFacebookUrl(String rawUrl) {
    return hostEndsWith(rawUrl, "facebook.com") || hostEndsWith(rawUrl, "fb.com");
  }

  private boolean isInstagramUrl(String rawUrl) {
    return hostEndsWith(rawUrl, "instagram.com");
  }

  private boolean isRedditUrl(String rawUrl) {
    return hostEndsWith(rawUrl, "reddit.com") || hostEndsWith(rawUrl, "redd.it");
  }

  private boolean hostEndsWith(String rawUrl, String suffix) {
    try {
      String host = new URL(rawUrl).getHost();
      return host != null && host.toLowerCase().endsWith(suffix);
    } catch (Exception ignored) {
      return false;
    }
  }

  private String facebookShareCode(String rawUrl) {
    try {
      String[] segments = new URL(rawUrl).getPath().split("/");
      for (int index = 0; index < segments.length - 2; index++) {
        if (segments[index].equals("share") && segments[index + 1].equals("p")) {
          return segments[index + 2];
        }
      }
    } catch (Exception ignored) {
      // Fall through to empty.
    }
    return "";
  }

  private String metaRefreshUrl(String html) {
    Matcher matcher = Pattern.compile("<meta\\\\b[^>]*>", Pattern.CASE_INSENSITIVE).matcher(html);
    while (matcher.find()) {
      String tag = matcher.group();
      if (!attribute(tag, "http-equiv").equalsIgnoreCase("refresh")) continue;
      String content = attribute(tag, "content");
      Matcher urlMatcher = Pattern.compile("url\\\\s*=\\\\s*([^;]+)", Pattern.CASE_INSENSITIVE).matcher(content);
      if (urlMatcher.find()) return urlMatcher.group(1).trim();
    }
    return "";
  }

  private String facebookContentUrl(String html) {
    String normalized = htmlDecode(html).replace("\\\\/", "/");
    Matcher matcher = Pattern
      .compile("https?://(?:www\\\\.|m\\\\.)facebook\\\\.com/[^\\\\s<>]+", Pattern.CASE_INSENSITIVE)
      .matcher(normalized);
    while (matcher.find()) {
      String candidate = matcher.group();
      if (isLikelyFacebookContentUrl(candidate)) return candidate;
    }
    return "";
  }

  private boolean isLikelyFacebookContentUrl(String url) {
    String lower = url.toLowerCase();
    if (lower.contains("/share/p/") || lower.contains("/login") || lower.contains("/help")) return false;
    return lower.contains("/posts/") ||
      lower.contains("/permalink.php") ||
      lower.contains("/story.php") ||
      lower.contains("/photo.php") ||
      lower.contains("/photos/") ||
      lower.contains("/groups/");
  }

  private String firstImageSrc(String html) {
    Matcher matcher = Pattern.compile("<img\\\\b[^>]*>", Pattern.CASE_INSENSITIVE).matcher(html);
    while (matcher.find()) {
      String src = attribute(matcher.group(), "src");
      if (isUsefulImage(src)) return src;
    }
    return "";
  }

  private boolean isUsefulImage(String src) {
    if (src == null || src.trim().isEmpty()) return false;
    String lower = src.toLowerCase();
    return !lower.startsWith("data:") &&
      !lower.contains("emoji") &&
      !lower.contains("static.xx.fbcdn.net/rsrc.php") &&
      !lower.contains("/images/emoji.php") &&
      (lower.contains("fbcdn.net") || lower.startsWith("http"));
  }

  private String cleanImageUrl(String baseUrl, String value) {
    String image = absoluteUrl(baseUrl, cleanText(value));
    return isUsefulImage(image) ? image : "";
  }

  private String metaContent(String html, String keyAttribute, String keyValue) {
    Matcher matcher = Pattern.compile("<meta\\\\b[^>]*>", Pattern.CASE_INSENSITIVE).matcher(html);
    while (matcher.find()) {
      String tag = matcher.group();
      String candidate = attribute(tag, keyAttribute);
      if (candidate.equalsIgnoreCase(keyValue)) {
        return attribute(tag, "content");
      }
    }
    return "";
  }

  private String linkHref(String html, String relValue) {
    Matcher matcher = Pattern.compile("<link\\\\b[^>]*>", Pattern.CASE_INSENSITIVE).matcher(html);
    while (matcher.find()) {
      String tag = matcher.group();
      String rel = attribute(tag, "rel").toLowerCase();
      if (rel.equals(relValue) || rel.contains(" " + relValue) || rel.contains(relValue + " ")) {
        return attribute(tag, "href");
      }
    }
    return "";
  }

  private String attribute(String tag, String name) {
    String quoted = "\\\\b" + Pattern.quote(name) + "\\\\s*=\\\\s*([\\\\\\\"'])(.*?)\\\\1";
    Matcher quotedMatcher = Pattern.compile(quoted, Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(tag);
    if (quotedMatcher.find()) return htmlDecode(quotedMatcher.group(2));

    String unquoted = "\\\\b" + Pattern.quote(name) + "\\\\s*=\\\\s*([^\\\\s>]+)";
    Matcher unquotedMatcher = Pattern.compile(unquoted, Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(tag);
    return unquotedMatcher.find() ? htmlDecode(unquotedMatcher.group(1)) : "";
  }

  private String titleTag(String html) {
    Matcher matcher = Pattern
      .compile("<title\\\\b[^>]*>(.*?)</title>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL)
      .matcher(html);
    return matcher.find() ? htmlDecode(matcher.group(1).replaceAll("<[^>]+>", "")) : "";
  }

  private String firstNonEmpty(String... values) {
    for (String value : values) {
      if (value != null && !value.trim().isEmpty()) return value;
    }
    return "";
  }

  private String cleanText(String value) {
    return htmlDecode(value == null ? "" : value).replaceAll("\\\\s+", " ").trim();
  }

  private String absoluteUrl(String baseUrl, String value) {
    if (value == null || value.trim().isEmpty()) return "";
    try {
      return new URL(new URL(baseUrl), value).toString();
    } catch (Exception ignored) {
      return value;
    }
  }

  private String htmlDecode(String value) {
    if (value == null) return "";
    String quote = String.valueOf((char) 34);
    String decoded = value;
    for (int index = 0; index < 3; index++) {
      String next = decoded
        .replace("&amp;", "&")
        .replace("&quot;", quote)
        .replace("&#34;", quote)
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">");
      next = decodeNumericEntities(next);
      if (next.equals(decoded)) break;
      decoded = next;
    }
    return decoded.trim();
  }

  private String decodeNumericEntities(String value) {
    Matcher matcher = Pattern.compile("&#(x?[0-9A-Fa-f]+);").matcher(value);
    StringBuffer out = new StringBuffer();
    while (matcher.find()) {
      String raw = matcher.group(1);
      try {
        int codePoint = raw.startsWith("x") || raw.startsWith("X")
          ? Integer.parseInt(raw.substring(1), 16)
          : Integer.parseInt(raw, 10);
        matcher.appendReplacement(out, Matcher.quoteReplacement(new String(Character.toChars(codePoint))));
      } catch (Exception ignored) {
        matcher.appendReplacement(out, Matcher.quoteReplacement(matcher.group(0)));
      }
    }
    matcher.appendTail(out);
    return out.toString();
  }
}
`,
);

writeFileSync(
  postActivityPath,
  `package ${appPackage};

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class ScrollixPostActivity extends Activity {
  public static String pendingHtml;
  public static String pendingBaseUrl;

  private WebView webView;
  private String url;
  private String offlineHtml;
  private String offlineBaseUrl;
  private final int primaryColor = Color.rgb(40, 71, 199);

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    url = getIntent().getStringExtra("url");
    String title = getIntent().getStringExtra("title");
    if (url == null || url.trim().isEmpty()) {
      finish();
      return;
    }
    offlineHtml = getIntent().getBooleanExtra("offline", false) ? pendingHtml : null;
    offlineBaseUrl = pendingBaseUrl != null ? pendingBaseUrl : url;
    pendingHtml = null;
    pendingBaseUrl = null;

    getWindow().setStatusBarColor(primaryColor);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      getWindow().setDecorFitsSystemWindows(true);
    }

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.WHITE);
    setContentView(root);

    LinearLayout bar = new LinearLayout(this);
    bar.setOrientation(LinearLayout.HORIZONTAL);
    bar.setGravity(Gravity.CENTER_VERTICAL);
    bar.setPadding(dp(12), dp(10) + statusBarHeight(), dp(12), dp(10));
    bar.setBackgroundColor(primaryColor);
    root.addView(bar, new LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    ));

    Button close = toolbarButton("Close");
    close.setOnClickListener((view) -> finish());
    bar.addView(close);

    LinearLayout info = new LinearLayout(this);
    info.setOrientation(LinearLayout.VERTICAL);
    info.setPadding(dp(12), 0, dp(12), 0);
    bar.addView(info, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

    TextView titleView = new TextView(this);
    titleView.setText((title == null || title.trim().isEmpty()) ? "Post" : title);
    titleView.setTextColor(Color.WHITE);
    titleView.setTextSize(18);
    titleView.setTypeface(Typeface.DEFAULT_BOLD);
    titleView.setSingleLine(true);
    info.addView(titleView);

    TextView domainView = new TextView(this);
    domainView.setText(domainFromUrl(url));
    domainView.setTextColor(Color.argb(190, 255, 255, 255));
    domainView.setTextSize(13);
    domainView.setSingleLine(true);
    info.addView(domainView);

    Button browser = toolbarButton("Browser");
    browser.setTextColor(Color.rgb(31, 58, 168));
    browser.setBackgroundColor(Color.WHITE);
    browser.setOnClickListener((view) -> openExternal());
    bar.addView(browser);

    webView = new WebView(this);
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setLoadsImagesAutomatically(true);
    settings.setMediaPlaybackRequiresUserGesture(true);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
    }
    webView.setWebViewClient(new WebViewClient() {
      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return handleUrl(request.getUrl().toString());
      }

      @Override
      public boolean shouldOverrideUrlLoading(WebView view, String nextUrl) {
        return handleUrl(nextUrl);
      }
    });
    root.addView(webView, new LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      0,
      1
    ));
    if (offlineHtml != null && !offlineHtml.trim().isEmpty()) {
      webView.loadDataWithBaseURL(offlineBaseUrl, offlineHtml, "text/html", "UTF-8", url);
    } else {
      webView.loadUrl(url);
    }
  }

  @Override
  public void onBackPressed() {
    if (webView != null && webView.canGoBack()) {
      webView.goBack();
      return;
    }
    super.onBackPressed();
  }

  @Override
  protected void onDestroy() {
    if (webView != null) {
      webView.destroy();
      webView = null;
    }
    super.onDestroy();
  }

  private Button toolbarButton(String text) {
    Button button = new Button(this);
    button.setText(text);
    button.setAllCaps(false);
    button.setTextSize(15);
    button.setTypeface(Typeface.DEFAULT_BOLD);
    button.setMinHeight(dp(44));
    button.setMinWidth(dp(86));
    return button;
  }

  private void openExternal() {
    try {
      Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
      startActivity(intent);
    } catch (Exception ignored) {
      // Keep the user in the in-app reader when no browser can handle the URL.
    }
  }

  private boolean handleUrl(String nextUrl) {
    Uri uri = Uri.parse(nextUrl);
    String scheme = uri.getScheme();
    if (scheme == null || scheme.equals("http") || scheme.equals("https")) {
      return false;
    }

    try {
      startActivity(new Intent(Intent.ACTION_VIEW, uri));
    } catch (Exception ignored) {
      // Ignore unsupported custom schemes inside the in-app reader.
    }
    return true;
  }

  private String domainFromUrl(String rawUrl) {
    try {
      String host = Uri.parse(rawUrl).getHost();
      if (host == null) return rawUrl;
      return host.startsWith("www.") ? host.substring(4) : host;
    } catch (Exception ignored) {
      return rawUrl;
    }
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  private int statusBarHeight() {
    int resourceId = getResources().getIdentifier("status_bar_height", "dimen", "android");
    if (resourceId <= 0) return 0;
    return getResources().getDimensionPixelSize(resourceId);
  }
}
`,
);

writeFileSync(
  mainActivityPath,
  `package ${appPackage};

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static String pendingAppLink = "";
  private final int primaryColor = Color.rgb(40, 71, 199);

  @Override
  public void onCreate(Bundle savedInstanceState) {
    configureSystemBars();
    storeAppLink(getIntent());
    registerPlugin(ScrollixPipPlugin.class);
    registerPlugin(ScrollixBrowserPlugin.class);
    super.onCreate(savedInstanceState);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    storeAppLink(intent);
  }

  public static synchronized String consumePendingAppLink() {
    String link = pendingAppLink == null ? "" : pendingAppLink;
    pendingAppLink = "";
    return link;
  }

  private static synchronized void storeAppLink(Intent intent) {
    if (intent == null) return;
    Uri data = intent.getData();
    pendingAppLink = data == null ? "" : data.toString();
  }

  private void configureSystemBars() {
    Window window = getWindow();
    window.setStatusBarColor(primaryColor);
    window.setNavigationBarColor(Color.WHITE);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      int flags = window.getDecorView().getSystemUiVisibility();
      window.getDecorView().setSystemUiVisibility(flags & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && window.getInsetsController() != null) {
      window.getInsetsController().setSystemBarsAppearance(
        0,
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
      );
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.setDecorFitsSystemWindows(true);
    }
  }
}
`,
);

let manifest = readFileSync(manifestPath, 'utf8');
if (!/android\.permission\.INTERNET/.test(manifest)) {
  manifest = manifest.replace(
    /<manifest([^>]*)>/,
    '<manifest$1>\n    <uses-permission android:name="android.permission.INTERNET" />',
  );
}
manifest = manifest.replace(
  /<activity([\s\S]*?)android:name="\.MainActivity"([\s\S]*?)>/,
  (match) => {
    let patched = match;
    if (!/android:supportsPictureInPicture=/.test(patched)) {
      patched = patched.replace(
        /android:name="\.MainActivity"/,
        'android:name=".MainActivity" android:supportsPictureInPicture="true"',
      );
    }
    if (!/android:resizeableActivity=/.test(patched)) {
      patched = patched.replace(
        /android:name="\.MainActivity"/,
        'android:name=".MainActivity" android:resizeableActivity="true"',
      );
    }
    if (!/android:exported=/.test(patched)) {
      patched = patched.replace(
        /android:name="\.MainActivity"/,
        'android:name=".MainActivity" android:exported="true"',
      );
    } else {
      patched = patched.replace(/android:exported="false"/, 'android:exported="true"');
    }
    if (!/android:launchMode=/.test(patched)) {
      patched = patched.replace(
        /android:name="\.MainActivity"/,
        'android:name=".MainActivity" android:launchMode="singleTask"',
      );
    }
    return patched;
  },
);
if (!/android:pathPrefix="\/scrollix\/video\/"/.test(manifest)) {
  manifest = manifest.replace(
    /(<activity[\s\S]*?android:name="\.MainActivity"[\s\S]*?>)([\s\S]*?)(<\/activity>)/,
    `$1$2
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="https"
                    android:host="actionanand.github.io"
                    android:pathPrefix="/scrollix/video/" />
            </intent-filter>
        $3`,
  );
}
if (!/android:scheme="scrollix"/.test(manifest)) {
  manifest = manifest.replace(
    /(<activity[\s\S]*?android:name="\.MainActivity"[\s\S]*?>)([\s\S]*?)(<\/activity>)/,
    `$1$2
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="scrollix"
                    android:host="video" />
                <data
                    android:scheme="scrollix"
                    android:host="home" />
            </intent-filter>
        $3`,
  );
}
if (!/android:name="\.ScrollixPostActivity"/.test(manifest)) {
  manifest = manifest.replace(
    /<\/application>/,
    `        <activity
            android:name=".ScrollixPostActivity"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:exported="false" />
    </application>`,
  );
}

mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, manifest);

for (const stylesPath of stylesPaths) {
  patchAndroidStyles(stylesPath);
}

console.log('Android picture-in-picture and in-app browser plugins patched.');

function patchAndroidStyles(stylesPath) {
  if (!existsSync(stylesPath)) return;
  let styles = readFileSync(stylesPath, 'utf8');
  styles = upsertStyleItem(styles, 'android:statusBarColor', '#2847c7');
  styles = upsertStyleItem(styles, 'android:navigationBarColor', '#ffffff');
  styles = upsertStyleItem(styles, 'android:windowLightStatusBar', 'false');
  styles = upsertStyleItem(styles, 'android:windowLightNavigationBar', 'true');
  writeFileSync(stylesPath, styles);
}

function upsertStyleItem(styles, name, value) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const itemRegex = new RegExp(`<item\\s+name="${escapedName}">[^<]*<\\/item>`, 'g');
  const item = `<item name="${name}">${value}</item>`;
  if (itemRegex.test(styles)) return styles.replace(itemRegex, item);
  return styles.replace(/<\/style>/g, `    ${item}\n    </style>`);
}
