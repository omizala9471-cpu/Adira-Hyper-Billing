const fs = require('fs');
const path = require('path');
const https = require('https');

const CONFIG_PATH = path.join(__dirname, 'firebase-config.js');
const DB_PATH = path.join(__dirname, 'db.json');

console.log("--------------------------------------------------");
console.log("🔥 Firebase Database Initializer & Seeding Script");
console.log("--------------------------------------------------\n");

// 1. Read firebase-config.js
if (!fs.existsSync(CONFIG_PATH)) {
  console.error("❌ Error: firebase-config.js not found! Please create it first.");
  process.exit(1);
}

const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');

// Simple regex to extract databaseURL
const dbUrlMatch = configContent.match(/databaseURL\s*:\s*["']([^"']+)["']/);
if (!dbUrlMatch) {
  console.error("❌ Error: Could not find databaseURL in firebase-config.js.");
  process.exit(1);
}

const databaseURL = dbUrlMatch[1];
if (databaseURL.includes("YOUR_PROJECT_ID")) {
  console.error("❌ Error: firebase-config.js is still using placeholder values.");
  console.error("Please edit firebase-config.js with your actual Firebase Web App credentials first.");
  process.exit(1);
}

// 2. Read local db.json
if (!fs.existsSync(DB_PATH)) {
  console.error("❌ Error: Local db.json not found in this folder.");
  process.exit(1);
}

const dbContent = fs.readFileSync(DB_PATH, 'utf8');
const dbData = JSON.parse(dbContent);

// Transform data to support slashes and match Firebase expectations
const transformedData = {};

// 1. Settings
transformedData.settings = dbData.settings || {
  writeUp: "Welcome to Adira Telecom Allocation Portal. Note: Confirmed allocations are strictly locked and credit will only be extended post proof verification.",
  confirmationDeadline: "",
  paymentDeadline: ""
};

// 2. Prices - convert from key-value object to array of { modelName, price } objects
// to bypass Firebase Realtime Database key constraints on character "/"
transformedData.prices = [];
if (dbData.prices) {
  for (const [modelName, price] of Object.entries(dbData.prices)) {
    transformedData.prices.push({
      modelName: modelName,
      price: price
    });
  }
}

// 3. Allocations - keyed by ID
transformedData.allocations = {};
if (Array.isArray(dbData.allocations)) {
  dbData.allocations.forEach(item => {
    if (item.ID) {
      transformedData.allocations[item.ID] = item;
    }
  });
}

// 4. Distributors - keyed by escaped AD Name
transformedData.distributors = {};
if (Array.isArray(dbData.distributors)) {
  dbData.distributors.forEach(item => {
    if (item["AD Name"]) {
      const key = item["AD Name"].replace(/[.#$\[\]]/g, "_");
      transformedData.distributors[key] = item;
    }
  });
}

// 5. Users - keyed by Username
transformedData.users = {};
if (Array.isArray(dbData.users)) {
  dbData.users.forEach(item => {
    if (item.Username) {
      transformedData.users[item.Username] = item;
    }
  });
}

const payload = JSON.stringify(transformedData, null, 2);

console.log(`📡 Targeting Firebase Database: ${databaseURL}`);
console.log(`📦 Seeding settings, users (${Object.keys(transformedData.users).length}), allocations (${Object.keys(transformedData.allocations).length}), distributors (${Object.keys(transformedData.distributors).length})...`);

// 3. Make PUT request via Firebase REST API
const urlObj = new URL(`${databaseURL}/.json`);

const reqOptions = {
  hostname: urlObj.hostname,
  port: 443,
  path: urlObj.pathname + urlObj.search,
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(reqOptions, (res) => {
  let responseBody = '';
  res.on('data', (chunk) => responseBody += chunk);
  
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log("\n🎉 Success! Default database successfully seeded to Firebase Realtime Database.");
      console.log("You can now open the database in the Firebase Console to view the tables.");
    } else {
      console.error(`\n❌ Error Seeding Database (Status Code: ${res.statusCode}):`);
      try {
        console.error(JSON.stringify(JSON.parse(responseBody), null, 2));
      } catch (e) {
        console.error(responseBody);
      }
      console.error("\n💡 Hint: Make sure your Firebase Realtime Database Rules allow write access. In test mode, rules should look like:");
      console.error('{\n  "rules": {\n    ".read": "true",\n    ".write": "true"\n  }\n}');
    }
  });
});

req.on('error', (err) => {
  console.error("\n❌ Network Connection Error:", err.message);
});

req.write(payload);
req.end();
