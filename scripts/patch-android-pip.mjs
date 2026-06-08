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

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
  public void openExternal(PluginCall call) {
    String url = call.getString("url");
    if (url == null || url.trim().isEmpty()) {
      call.reject("A URL is required.");
      return;
    }

    try {
      Intent intent = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url));
      getActivity().startActivity(intent);
      call.resolve();
    } catch (Exception ex) {
      call.reject("No browser can handle this URL.");
    }
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
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class ScrollixPostActivity extends Activity {
  private WebView webView;
  private String url;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    url = getIntent().getStringExtra("url");
    String title = getIntent().getStringExtra("title");
    if (url == null || url.trim().isEmpty()) {
      finish();
      return;
    }

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.WHITE);
    setContentView(root);

    LinearLayout bar = new LinearLayout(this);
    bar.setOrientation(LinearLayout.HORIZONTAL);
    bar.setGravity(Gravity.CENTER_VERTICAL);
    bar.setPadding(dp(12), dp(10), dp(12), dp(10));
    bar.setBackgroundColor(Color.rgb(40, 71, 199));
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
    webView.setWebViewClient(new WebViewClient());
    root.addView(webView, new LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      0,
      1
    ));
    webView.loadUrl(url);
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
}
`,
);

writeFileSync(
  mainActivityPath,
  `package ${appPackage};

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(ScrollixPipPlugin.class);
    registerPlugin(ScrollixBrowserPlugin.class);
    super.onCreate(savedInstanceState);
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
    return patched;
  },
);
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
