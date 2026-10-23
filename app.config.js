// Dynamic config — SINGLE source of config (app.json was merged into this file).
// Firebase client config is bundled at BUILD time from EXPO_PUBLIC_* env vars
// (never fetched from a dev server / VM at runtime).
module.exports = { expo: {
  "name": "Smart Household Inventory",
  "slug": "smart-household-inventory",
  "version": "2.0.0",
  "orientation": "portrait",
  "icon": "./assets/images/icon.png",
  "scheme": "smarthouseholdinventory",
  "userInterfaceStyle": "dark",
  "runtimeVersion": {
    "policy": "appVersion"
  },
  "updates": {
    "url": "https://u.expo.dev/3e80728c-59e8-42ea-b2ff-596dd3b2b0dd"
  },
  "ios": {
    "icon": "./assets/expo.icon",
    "bundleIdentifier": "com.bhuvankrithik.smarthouseholdinventory"
  },
  "android": {
    "adaptiveIcon": {
      "backgroundColor": "#0B1220",
      "foregroundImage": "./assets/images/android-icon-foreground.png",
      "backgroundImage": "./assets/images/android-icon-background.png",
      "monochromeImage": "./assets/images/android-icon-monochrome.png"
    },
    "predictiveBackGestureEnabled": false,
    "package": "com.bhuvankrithik.smarthouseholdinventory"
  },
  "web": {
    "output": "server",
    "favicon": "./assets/images/favicon.png"
  },
  "plugins": [
    "expo-router",
    [
      "expo-splash-screen",
      {
        "backgroundColor": "#0B1220",
        "image": "./assets/images/splash-icon.png",
        "imageWidth": 76
      }
    ],
    "expo-secure-store",
    "expo-sharing"
  ],
  "experiments": {
    "typedRoutes": true,
    "reactCompiler": true
  },
  "owner": "bhuvankrithiks-team",
  "extra": {
    "eas": {
      "projectId": "3e80728c-59e8-42ea-b2ff-596dd3b2b0dd"
    },
    "firebase": {
      "apiKey": process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
      "authDomain": process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
      "projectId": process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
      "storageBucket": process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
      "messagingSenderId": process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
      "appId": process.env.EXPO_PUBLIC_FIREBASE_APP_ID || ''
    },
    "ocrApiUrl": process.env.EXPO_PUBLIC_OCR_API_URL || ''
  }
} };
