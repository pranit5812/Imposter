const fs = require('fs');
const path = require('path');

// 1. Patch proguard & maven repository in android/build.gradle
const gradleTarget = path.join(__dirname, 'node_modules', 'mappls-map-react-native', 'android', 'build.gradle');
if (fs.existsSync(gradleTarget)) {
  let content = fs.readFileSync(gradleTarget, 'utf8');
  let changed = false;
  if (content.includes("'proguard-android.txt'")) {
    content = content.replace("'proguard-android.txt'", "'proguard-android-optimize.txt'");
    changed = true;
    console.log('[patch-mappls] Successfully patched proguard configuration in mappls-map-react-native.');
  }
  if (!content.includes('https://maven.mappls.com/repository/mappls/')) {
    content = content.replace(
      /repositories\s*\{/,
      "repositories {\n    maven { url 'https://maven.mappls.com/repository/mappls/' }"
    );
    changed = true;
    console.log('[patch-mappls] Successfully patched maven repository in mappls-map-react-native.');
  }
  if (changed) {
    fs.writeFileSync(gradleTarget, content, 'utf8');
  }
}

// 2. Patch newarch/RCTMGLPackage.java to implement ViewManagerOnDemandReactPackage for React Native New Architecture
const newarchPackagePath = path.join(
  __dirname,
  'node_modules',
  'mappls-map-react-native',
  'android',
  'src',
  'newarch',
  'com',
  'mappls',
  'sdk',
  'maps',
  'rctmgl',
  'RCTMGLPackage.java'
);
if (fs.existsSync(newarchPackagePath)) {
  let content = fs.readFileSync(newarchPackagePath, 'utf8');
  if (!content.includes('ViewManagerOnDemandReactPackage')) {
    content = content.replace(
      'public class RCTMGLPackage extends BaseReactPackage {',
      'public class RCTMGLPackage extends BaseReactPackage implements com.facebook.react.ViewManagerOnDemandReactPackage {'
    );

    const onDemandCode = `
    private Map<String, ViewManager> mDemandViewManagers;

    private Map<String, ViewManager> getDemandViewManagers(ReactApplicationContext reactContext) {
        if (mDemandViewManagers == null) {
            List<ViewManager> managers = createViewManagers(reactContext);
            mDemandViewManagers = new HashMap<>();
            for (ViewManager manager : managers) {
                mDemandViewManagers.put(manager.getName(), manager);
            }
        }
        return mDemandViewManagers;
    }

    @Override
    public java.util.Collection<String> getViewManagerNames(ReactApplicationContext reactContext) {
        return getDemandViewManagers(reactContext).keySet();
    }

    @Override
    public ViewManager createViewManager(ReactApplicationContext reactContext, String viewManagerName) {
        return getDemandViewManagers(reactContext).get(viewManagerName);
    }
}
`;
    // Replace the last closing brace
    const lastBraceIdx = content.lastIndexOf('}');
    if (lastBraceIdx !== -1) {
      content = content.slice(0, lastBraceIdx) + onDemandCode;
      fs.writeFileSync(newarchPackagePath, content, 'utf8');
      console.log('[patch-mappls] Successfully patched newarch/RCTMGLPackage.java with ViewManagerOnDemandReactPackage.');
    }
  }
}

// 3. Patch oldarch/RCTMGLPackage.java as well
const oldarchPackagePath = path.join(
  __dirname,
  'node_modules',
  'mappls-map-react-native',
  'android',
  'src',
  'oldarch',
  'com',
  'mappls',
  'sdk',
  'maps',
  'rctmgl',
  'RCTMGLPackage.java'
);
if (fs.existsSync(oldarchPackagePath)) {
  let content = fs.readFileSync(oldarchPackagePath, 'utf8');
  if (!content.includes('ViewManagerOnDemandReactPackage')) {
    content = content.replace(
      'public class RCTMGLPackage implements ReactPackage {',
      'public class RCTMGLPackage implements ReactPackage, com.facebook.react.ViewManagerOnDemandReactPackage {'
    );

    const onDemandCode = `
    private Map<String, ViewManager> mDemandViewManagers;

    private Map<String, ViewManager> getDemandViewManagers(ReactApplicationContext reactContext) {
        if (mDemandViewManagers == null) {
            List<ViewManager> managers = createViewManagers(reactContext);
            mDemandViewManagers = new HashMap<>();
            for (ViewManager manager : managers) {
                mDemandViewManagers.put(manager.getName(), manager);
            }
        }
        return mDemandViewManagers;
    }

    @Override
    public java.util.Collection<String> getViewManagerNames(ReactApplicationContext reactContext) {
        return getDemandViewManagers(reactContext).keySet();
    }

    @Override
    public ViewManager createViewManager(ReactApplicationContext reactContext, String viewManagerName) {
        return getDemandViewManagers(reactContext).get(viewManagerName);
    }
}
`;
    const lastBraceIdx = content.lastIndexOf('}');
    if (lastBraceIdx !== -1) {
      content = content.slice(0, lastBraceIdx) + onDemandCode;
      fs.writeFileSync(oldarchPackagePath, content, 'utf8');
      console.log('[patch-mappls] Successfully patched oldarch/RCTMGLPackage.java with ViewManagerOnDemandReactPackage.');
    }
  }
}

// 4. Generate clean declaration file for TypeScript compilation
const mapplsPkgDir = path.join(__dirname, 'node_modules', 'mappls-map-react-native');
const dtsPath = path.join(mapplsPkgDir, 'index.d.ts');
const pkgJsonPath = path.join(mapplsPkgDir, 'package.json');

const dtsContent = `import { Component } from 'react';
import { ViewProps } from 'react-native';

export class MapView extends Component<any> {}
export class Camera extends Component<any> {}
export class PointAnnotation extends Component<any> {}
export class Callout extends Component<any> {}
export class ShapeSource extends Component<any> {}
export class LineLayer extends Component<any> {}
export class FillLayer extends Component<any> {}
export class CircleLayer extends Component<any> {}
export class SymbolLayer extends Component<any> {}
export class UserLocation extends Component<any> {}
export const RestApi: any;

declare const MapplsGL: {
  MapView: typeof MapView;
  Camera: typeof Camera;
  PointAnnotation: typeof PointAnnotation;
  Callout: typeof Callout;
  ShapeSource: typeof ShapeSource;
  LineLayer: typeof LineLayer;
  FillLayer: typeof FillLayer;
  CircleLayer: typeof CircleLayer;
  SymbolLayer: typeof SymbolLayer;
  UserLocation: typeof UserLocation;
  RestApi: any;
  setMapSDKKey: (key: string) => void;
  setRestAPIKey: (key: string) => void;
  setAtlasClientId: (id: string) => void;
  setAtlasClientSecret: (secret: string) => void;
  [key: string]: any;
};

export default MapplsGL;
`;

if (fs.existsSync(mapplsPkgDir)) {
  fs.writeFileSync(dtsPath, dtsContent, 'utf8');
  if (fs.existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    if (!pkg.types) {
      pkg.types = './index.d.ts';
      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
      console.log('[patch-mappls] Configured types declaration in mappls-map-react-native/package.json');
    }
  }
}

// 5. Patch react-native-safe-area-context CMakeLists.txt to avoid Windows MAX_PATH path length errors in Ninja
const safeAreaCmakePath = path.join(
  __dirname,
  'node_modules',
  'react-native-safe-area-context',
  'android',
  'src',
  'main',
  'jni',
  'CMakeLists.txt'
);

if (fs.existsSync(safeAreaCmakePath)) {
  let content = fs.readFileSync(safeAreaCmakePath, 'utf8');
  if (!content.includes('CMAKE_CURRENT_BINARY_DIR/codegen')) {
    const targetChunk = 'file(GLOB LIB_CODEGEN_SRCS CONFIGURE_DEPENDS ${LIB_ANDROID_GENERATED_JNI_DIR}/*.cpp ${LIB_ANDROID_GENERATED_COMPONENTS_DIR}/*.cpp)';
    const replacementChunk = `file(MAKE_DIRECTORY \${CMAKE_CURRENT_BINARY_DIR}/codegen)
file(GLOB_RECURSE _GENERATED_FILES CONFIGURE_DEPENDS \${LIB_ANDROID_GENERATED_JNI_DIR}/*)
foreach(_file \${_GENERATED_FILES})
  if(NOT IS_DIRECTORY \${_file})
    get_filename_component(_filename \${_file} NAME)
    configure_file(\${_file} \${CMAKE_CURRENT_BINARY_DIR}/codegen/\${_filename} COPYONLY)
  endif()
endforeach()
file(GLOB LIB_CODEGEN_SRCS \${CMAKE_CURRENT_BINARY_DIR}/codegen/*.cpp)`;

    if (content.includes(targetChunk)) {
      content = content.replace(targetChunk, replacementChunk);
      if (!content.includes('\${CMAKE_CURRENT_BINARY_DIR}/codegen')) {
        content = content.replace('target_include_directories(\n  ${LIB_TARGET_NAME}\n  PUBLIC\n  .', 'target_include_directories(\n  ${LIB_TARGET_NAME}\n  PUBLIC\n  .\n  ${CMAKE_CURRENT_BINARY_DIR}/codegen');
      }
      fs.writeFileSync(safeAreaCmakePath, content, 'utf8');
      console.log('[patch-mappls] Successfully patched react-native-safe-area-context CMakeLists.txt for Windows path limits.');
    }
  }
}
