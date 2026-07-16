# 📱 FlowFinance - Android APK Build Guide

This guide walks you through the step-by-step process of building a release Android **APK** for the FlowFinance mobile app using **Expo Application Services (EAS Build)**. 

Because reading SMS inbox logs requires native Android permissions, it must be compiled as a standalone native app (APK) and cannot run inside the standard iOS or Android "Expo Go" sandbox client.

---

## 🛠️ Step 1: Install EAS CLI Globally

EAS is Expo's free cloud building compiler. Install the CLI tool on your development PC:

```bash
npm install -g eas-cli
```

---

## 🛠️ Step 2: Create a Free Expo Account & Login

If you don't have one, create a free account at [expo.dev](https://expo.dev). Then, log in via your terminal:

```bash
eas login
```

---

## 🛠️ Step 3: Initialize EAS Configuration

Run the initialization wizard inside the `mobile/` directory to link the project to your Expo account:

```bash
cd mobile
eas project:init
```

---

## 🛠️ Step 4: Configure `eas.json` for APK Generation

By default, EAS builds Android App Bundles (`.aab`) for Google Play Store upload. We need to tell it to output a direct Android package installer (`.apk`).

Create a file named `eas.json` in the `mobile/` folder with the following configuration:

```json
{
  "cli": {
    "version": ">= 9.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {}
  },
  "submit": {
    "production": {}
  }
}
```

---

## 🛠️ Step 5: Start the Cloud APK Build

Trigger the EAS compiler with the `preview` profile we configured above:

```bash
eas build -p android --profile preview
```

1. **Keystore Generation:** EAS will ask if it should generate a keystore signature for you. Press **Y** (Yes).
2. **Wait for Compilation:** Expo's cloud server will automatically fetch the source files, configure Java, install packages, and compile your release APK in roughly **5 to 10 minutes**.
3. **Download Link:** Once completed, the terminal will print a QR code and a direct `.apk` download URL.

---

## 📱 Step 6: Install on Your Android Phone

1. Scan the QR code with your phone or open the download URL in your phone's browser.
2. Download the `.apk` file.
3. Tap the file to install it. 
   *(Note: Since it is self-signed, Android may show a "Block by Play Protect" warning. Click **Install Anyway** to bypass.)*

---

## 🔒 Step 7: Enable SMS Permissions

1. Open FlowFinance on your phone.
2. Tap the **Feed** tab.
3. Tap **Sync Inbox**.
4. The system will prompt you for **SMS Read Permissions**. Click **Allow**.
5. The application will query your text database, extract debits, match rules, and show your remaining baseline!
