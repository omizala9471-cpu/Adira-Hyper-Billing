import os
import re
import json
import urllib.request
import hashlib
import secrets

CONFIG_PATH = 'firebase-config.js'
DB_PATH = 'db.json'

print("--------------------------------------------------")
print("[Fire] Firebase Database Initializer & Seeding Script (Python)")
print("--------------------------------------------------\n")

if not os.path.exists(CONFIG_PATH):
    print("[Error] firebase-config.js not found! Please create it first.")
    exit(1)

with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
    config_content = f.read()

db_url_match = re.search(r'databaseURL\s*:\s*["\']([^"\']+)["\']', config_content)
if not db_url_match:
    print("[Error] Could not find databaseURL in firebase-config.js.")
    exit(1)

database_url = db_url_match.group(1)
if "YOUR_PROJECT_ID" in database_url:
    print("[Error] firebase-config.js is still using placeholder values.")
    exit(1)

if not os.path.exists(DB_PATH):
    print("[Error] Local db.json not found in this folder.")
    exit(1)

with open(DB_PATH, 'r', encoding='utf-8') as f:
    db_data = json.load(f)

print(f"Targeting Firebase Database: {database_url}")
print(f"Seeding settings, users ({len(db_data.get('users', []))}), allocations ({len(db_data.get('allocations', []))}), distributors ({len(db_data.get('distributors', []))})...")

# PBKDF2 SHA-256 Hashing helper
def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 10000, 32).hex()

# Transform data to support slashes and match Firebase expectations
transformed_data = {}

# 1. Settings
transformed_data['settings'] = db_data.get('settings', {
    "writeUp": "Welcome to Adira Telecom Allocation Portal. Note: Confirmed allocations are strictly locked and credit will only be extended post proof verification.",
    "confirmationDeadline": "",
    "paymentDeadline": ""
})

# 2. Prices
transformed_data['prices'] = []
prices = db_data.get('prices', {})
if isinstance(prices, dict):
    for model_name, price in prices.items():
        transformed_data['prices'].append({
            'modelName': model_name,
            'price': float(price)
        })

# 3. Allocations
transformed_data['allocations'] = {}
allocations = db_data.get('allocations', [])
if isinstance(allocations, list):
    for item in allocations:
        if 'ID' in item:
            transformed_data['allocations'][item['ID']] = item

# 4. Distributors
transformed_data['distributors'] = {}
distributors = db_data.get('distributors', [])
if isinstance(distributors, list):
    for item in distributors:
        if 'AD Name' in item:
            # Replace invalid Firebase characters . # $ [ ] with _
            key = re.sub(r'[.#$\[\]]', '_', item['AD Name'])
            transformed_data['distributors'][key] = item

# 5. Users with Secure PBKDF2 Hashed Passwords
transformed_data['users'] = {}
users = db_data.get('users', [])
if isinstance(users, list):
    for item in users:
        if 'Username' in item:
            username = item['Username']
            plain_password = item.get('Password', '')
            
            # Generate a secure random salt (16 hex chars)
            salt = secrets.token_hex(8)
            hashed_password = hash_password(plain_password, salt)
            
            # Store credentials securely
            secure_user = item.copy()
            secure_user['Password'] = hashed_password
            secure_user['Salt'] = salt
            
            transformed_data['users'][username] = secure_user

payload = json.dumps(transformed_data, indent=2).encode('utf-8')

# PUT request using urllib
url = f"{database_url.rstrip('/')}/.json"
req = urllib.request.Request(
    url,
    data=payload,
    headers={
        'Content-Type': 'application/json',
        'Content-Length': len(payload)
    },
    method='PUT'
)

try:
    with urllib.request.urlopen(req) as response:
        status = response.status
        response_body = response.read().decode('utf-8')
        if status == 200:
            print("\n[Success] Default database successfully seeded with hashed credentials to Firebase Realtime Database.")
            print("You can now open the database in the Firebase Console to view the tables.")
        else:
            print(f"\n[Error] Seeding Database (Status Code: {status}):")
            print(response_body)
except urllib.error.HTTPError as e:
    print(f"\n[HTTP Error] (Status Code: {e.code}):")
    try:
        err_body = e.read().decode('utf-8')
        print(json.dumps(json.loads(err_body), indent=2))
    except Exception:
        print(e.reason)
    print("\nHint: Make sure your Firebase Realtime Database Rules allow write access. In test mode, rules should look like:")
    print('{\n  "rules": {\n    ".read": "true",\n    ".write": "true"\n  }\n}')
except Exception as e:
    print("\n[Network Error] Connection Error:", str(e))
