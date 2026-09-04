import requests
import json

# Cognito configuration
client_id = "6u26jrfopqhvd04mhlhugnig23"
region = "ap-south-1"
username = "admin@wit.ac.in"
password = "Admin@123"

# 1. Login to Cognito to get ID token
print("Authenticating with Cognito...")
url = f"https://cognito-idp.{region}.amazonaws.com/"
headers = {
    "Content-Type": "application/x-amz-json-1.1",
    "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth"
}
body = {
    "AuthFlow": "USER_PASSWORD_AUTH",
    "ClientId": client_id,
    "AuthParameters": {
        "USERNAME": username,
        "PASSWORD": password
    }
}
resp = requests.post(url, headers=headers, json=body)
print(f"Cognito status: {resp.status_code}")
if resp.status_code != 200:
    print(resp.text)
    exit(1)

data = resp.json()
id_token = data["AuthenticationResult"]["IdToken"]
print("Successfully obtained ID Token!")

# 2. Call admin/machines endpoint
api_url = "https://cezkm5x4k8.execute-api.ap-south-1.amazonaws.com/v1/admin/machines"
api_headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {id_token}"
}
print(f"\nCalling GET {api_url}...")
api_resp = requests.get(api_url, headers=api_headers)
print(f"API status: {api_resp.status_code}")
print("API Response Headers:")
for k, v in api_resp.headers.items():
    print(f"  {k}: {v}")
print("\nAPI Response Body:")
try:
    print(json.dumps(api_resp.json(), indent=2))
except Exception:
    print(api_resp.text)
