import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const appPackage = 'com.actionanand.scrollix.app';
const javaDir = join('android', 'app', 'src', 'main', 'java', ...appPackage.split('.'));
const mainActivityPath = join(javaDir, 'MainActivity.java');
const pluginPath = join(javaDir, 'ScrollixPipPlugin.java');
const manifestPath = join('android', 'app', 'src', 'main', 'AndroidManifest.xml');

mkdirSync(javaDir, { recursive: true });

writeFileSync(
  pluginPath,
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
  mainActivityPath,
  `package ${appPackage};

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(ScrollixPipPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
`,
);

let manifest = readFileSync(manifestPath, 'utf8');
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

mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, manifest);

console.log('Android picture-in-picture plugin patched.');
