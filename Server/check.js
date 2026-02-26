const https = require('https');
require('dotenv').config();

const rawKey = process.env.GEMINI_API_KEY;

if (!rawKey) {
  console.log('❌ ERROR: Key is missing from .env');
  process.exit();
}

const cleanKey = rawKey.trim();
console.log(`Checking API Key: ${cleanKey.substring(0, 10)}...`);

https.get(
    'https://generativelanguage.googleapis.com/v1beta/models?key=' + cleanKey,
    (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (json.error) {
          console.log('\n❌ GOOGLE REJECTED THE KEY:');
          console.log(json.error.message);
          console.log(
              '\nFix: Your key does not have AI permissions. Get a new one at aistudio.google.com');
        } else {
          console.log(
              '\n✅ SUCCESS! Google recognizes your key. You have access to:');
          json.models.filter(m => m.name.includes('gemini'))
              .forEach(m => console.log('- ' + m.name));
        }
      });
    });