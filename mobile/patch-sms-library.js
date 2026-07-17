const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'node_modules', 'react-native-get-sms-android', 'android', 'build.gradle');

try {
  if (fs.existsSync(targetFile)) {
    let content = fs.readFileSync(targetFile, 'utf8');
    if (content.includes('jcenter()')) {
      content = content.replace(/jcenter\(\)/g, 'mavenCentral()');
      fs.writeFileSync(targetFile, content, 'utf8');
      console.log('✅ Successfully patched react-native-get-sms-android/android/build.gradle (replaced jcenter with mavenCentral)');
    } else {
      console.log('ℹ️ react-native-get-sms-android build.gradle is already using mavenCentral');
    }
  } else {
    console.warn(`⚠️ Warning: SMS library build.gradle not found at ${targetFile}. If you are in the workspace root, make sure you run this script inside the "mobile" directory.`);
  }
} catch (error) {
  console.error('❌ Failed to patch react-native-get-sms-android:', error);
}
