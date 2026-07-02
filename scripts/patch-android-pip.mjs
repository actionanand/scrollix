import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const appPackage = 'com.actionanand.scrollix.app';
const javaDir = join('android', 'app', 'src', 'main', 'java', ...appPackage.split('.'));
const mainActivityPath = join(javaDir, 'MainActivity.java');
const pipPluginPath = join(javaDir, 'ScrollixPipPlugin.java');
const browserPluginPath = join(javaDir, 'ScrollixBrowserPlugin.java');
const postActivityPath = join(javaDir, 'ScrollixPostActivity.java');
const manifestPath = join('android', 'app', 'src', 'main', 'AndroidManifest.xml');

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

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
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
        String html = downloadHtml(url);
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
        String html = downloadHtml(url);
        JSObject result = extractPreview(html, url);
        getActivity().runOnUiThread(() -> call.resolve(result));
      } catch (Exception ex) {
        getActivity().runOnUiThread(() -> call.reject("Unable to fetch link preview."));
      }
    }).start();
  }

  private String downloadHtml(String rawUrl) throws Exception {
    return downloadHtml(rawUrl, 0);
  }

  private String downloadHtml(String rawUrl, int redirects) throws Exception {
    HttpURLConnection connection = (HttpURLConnection) new URL(rawUrl).openConnection();
    connection.setInstanceFollowRedirects(true);
    connection.setConnectTimeout(15000);
    connection.setReadTimeout(20000);
    connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 Scrollix");
    connection.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    connection.setRequestProperty("Accept-Language", "en-US,en;q=0.9");

    int status = connection.getResponseCode();
    if (status >= 300 && status < 400 && redirects < 5) {
      String location = connection.getHeaderField("Location");
      connection.disconnect();
      if (location != null && !location.trim().isEmpty()) {
        return downloadHtml(new URL(new URL(rawUrl), location).toString(), redirects + 1);
      }
    }

    try (InputStream input = connection.getInputStream();
         BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
      StringBuilder html = new StringBuilder();
      String line;
      while ((line = reader.readLine()) != null) {
        html.append(line).append('\\n');
      }
      return html.toString();
    } finally {
      connection.disconnect();
    }
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
      metaContent(html, "name", "thumbnail")
    );
    String previewUrl = firstNonEmpty(metaContent(html, "property", "og:url"), sourceUrl);
    String logo = firstNonEmpty(
      metaContent(html, "property", "og:logo"),
      linkHref(html, "apple-touch-icon"),
      linkHref(html, "icon")
    );

    JSObject result = new JSObject();
    result.put("title", cleanText(title));
    result.put("description", cleanText(description));
    result.put("image", absoluteUrl(sourceUrl, cleanText(image)));
    result.put("url", absoluteUrl(sourceUrl, cleanText(previewUrl)));
    result.put("logo", absoluteUrl(sourceUrl, cleanText(logo)));
    return result;
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
    return value
      .replace("&amp;", "&")
      .replace("&quot;", quote)
      .replace("&#34;", quote)
      .replace("&#39;", "'")
      .replace("&apos;", "'")
      .replace("&lt;", "<")
      .replace("&gt;", ">")
      .trim();
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
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static String pendingAppLink = "";

  @Override
  public void onCreate(Bundle savedInstanceState) {
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

console.log('Android picture-in-picture and in-app browser plugins patched.');
