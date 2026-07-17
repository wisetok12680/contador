#!/usr/bin/env python3
import re
import sys
import json
import subprocess
import urllib.request
from datetime import datetime

# ==============================================================================
# Configuration
# ==============================================================================
# URL of your Vercel-deployed app (e.g., https://my-finance-manager.vercel.app)
# Change to http://localhost:3000 for local testing
API_BASE_URL = "http://localhost:3000" 

# The Sync Token defined in your environment variables on Vercel
SYNC_TOKEN = "default-token-12345"

# Senders to filter (commonly Indian bank SMS handles)
BANK_SENDER_PATTERNS = r"HDFC|ICICI|SBI|AXIS|PAYTM|PNB|BOI|KOTAK"

# ==============================================================================
# Fetch Dynamic Configs
# ==============================================================================
def get_sms_cutoff_from_server():
    url = f"{API_BASE_URL}/api/sync?token={SYNC_TOKEN}"
    print(f"📡 Fetching SMS cutoff config from server: {API_BASE_URL}...")
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                cutoff = data.get("smsCutoffTime")
                if cutoff:
                    print(f"🎯 Found active cutoff from server: {cutoff}")
                    return cutoff
    except Exception as e:
        print(f"⚠️ Could not connect to sync server ({e}). Using local default.")
    return None

# ==============================================================================
# Parser Helper Function
# ==============================================================================
def parse_sms(body):
    """
    Parses a single transaction SMS alert.
    Extracts amount, transaction type, and merchant.
    """
    # Clean up double spaces or weird characters
    clean_body = re.sub(r'\s+', ' ', body)
    
    # 1. Match Amount
    # Supports "Rs. 250", "Rs 250.00", "INR 250", "₹250.50", "credited/debited with/by Rs 250"
    amt_match = re.search(
        r"(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{2})?)",
        clean_body,
        re.IGNORECASE
    )
    if not amt_match:
        return None
        
    amount_str = amt_match.group(1).replace(",", "")
    amount = float(amount_str)
    
    # 2. Determine Transaction Type
    tx_type = None
    if re.search(r"debited|spent|paid|withdrawn|charged|sent to", clean_body, re.IGNORECASE):
        tx_type = "debit"
    elif re.search(r"credited|received|deposited|refunded", clean_body, re.IGNORECASE):
        tx_type = "credit"
        
    if not tx_type:
        return None
        
    # 3. Match Merchant
    merchant = "Unknown Merchant"
    
    # Check for typical UPI transaction formats: "UPI-merchantName@handle" or "Ref: name"
    upi_match = re.search(
        r"UPI-([a-zA-Z0-9.\-_]+@[a-zA-Z]+)|UPI(?:\s+Ref)?\s*([a-zA-Z0-9.\-_]+@[a-zA-Z]+)",
        clean_body,
        re.IGNORECASE
    )
    if upi_match:
        merchant = upi_match.group(1) or upi_match.group(2)
    else:
        # Fallback 1: Match keyword following Info/Ref/To/At
        ref_match = re.search(
            r"(?:Info:|Ref:|To|At)\s*([a-zA-Z0-9\s.\-_]+)(?:\.|\son\b|\bfor\b)",
            clean_body,
            re.IGNORECASE
        )
        if ref_match:
            merchant = ref_match.group(1).strip()
            
    return {
        "amount": amount,
        "type": tx_type,
        "merchant": merchant,
        "timestamp": datetime.now().isoformat(),
        "isCreditLineReset": tx_type == "credit" and amount >= 5000,
        "raw": clean_body
    }

# ==============================================================================
# Native ADB SMS Reader
# ==============================================================================
def read_android_sms_adb():
    """
    Spawns ADB process to read target SMS inbox rows.
    Translates database columns into python dict objects.
    """
    try:
        # Check if adb is installed and device is connected
        subprocess.check_output(["adb", "devices"], stderr=subprocess.STDOUT)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ ADB CLI is not installed or no devices connected. Make sure USB Debugging is ON.")
        return []

    print("📲 Connecting to Android Device via ADB shell...")
    
    # SQL query for Android content provider
    cmd = [
        "adb", "shell", 
        "content", "query", 
        "--uri", "content://sms/inbox", 
        "--projection", "_id:address:date:body", 
        "--sort", "date DESC"
    ]
    
    try:
        output = subprocess.check_output(cmd).decode("utf-8", errors="ignore")
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to run ADB SMS query command: {e}")
        return []

    lines = output.splitlines()
    messages = []
    
    current_msg = {}
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Parse ADB output row values
        if line.startswith("Row:"):
            # If there's an existing parsed message, save it
            if "address" in current_msg and "body" in current_msg:
                messages.append(current_msg)
            current_msg = {}
            
        # Match variables
        match = re.match(r"(\w+)=(.*)", line)
        if match:
            key, val = match.groups()
            if key == "_id":
                current_msg["_id"] = val
            elif key == "address":
                current_msg["address"] = val
            elif key == "body":
                current_msg["body"] = val
            elif key == "date":
                # Convert milliseconds timestamp from Android db to ISO 8601 string
                date_match = re.search(r"(\d+)", val)
                if date_match:
                    ms_ts = int(date_match.group(1))
                    current_msg["date"] = datetime.fromtimestamp(ms_ts / 1000.0).isoformat()
                
    # Append final message
    if "address" in current_msg and "body" in current_msg:
        messages.append(current_msg)
        
    return messages

# ==============================================================================
# Main Execution Loop
# ==============================================================================
def main():
    sms_list = read_android_sms_adb()
    if not sms_list:
        print("📭 No messages found or unable to read device.")
        return

    # Fetch server cutoff time if available
    server_cutoff = get_sms_cutoff_from_server()
    cutoff_dt = None
    if server_cutoff:
        try:
            # Parse ISO date string (replace Z if present)
            clean_cutoff = server_cutoff.replace("Z", "")
            if "." in clean_cutoff:
                clean_cutoff = clean_cutoff.split(".")[0]
            cutoff_dt = datetime.fromisoformat(clean_cutoff)
        except Exception as e:
            print(f"⚠️ Error parsing cutoff time: {e}")

    print(f"📬 Read {len(sms_list)} messages from inbox. Filtering bank SMS...")
    
    parsed_transactions = []
    
    for msg in sms_list:
        sender = msg.get("address", "")
        body = msg.get("body", "")
        
        # Check if message is from a bank
        if re.search(BANK_SENDER_PATTERNS, sender, re.IGNORECASE):
            # Check message date against cutoff date
            msg_date_str = msg.get("date")
            if msg_date_str and cutoff_dt:
                try:
                    clean_msg_date = msg_date_str.replace("Z", "")
                    if "." in clean_msg_date:
                        clean_msg_date = clean_msg_date.split(".")[0]
                    msg_dt = datetime.fromisoformat(clean_msg_date)
                    if msg_dt < cutoff_dt:
                        # Skip older messages
                        continue
                except Exception as e:
                    pass

            parsed = parse_sms(body)
            if parsed:
                # Overwrite parsed timestamp with actual SMS timestamp
                parsed["timestamp"] = msg.get("date", parsed["timestamp"])
                parsed_transactions.append(parsed)
                
                # Stop parsing if we hit the credit line reset deposit (>= 5000)
                if parsed.get("isCreditLineReset") or (parsed.get("type") == "credit" and parsed.get("amount") >= 5000):
                    print(f"🎯 Found latest credit line reset deposit of ₹{parsed['amount']}. Stopping SMS ingestion.")
                    break

    print(f"📊 Found {len(parsed_transactions)} bank transaction messages.")
    
    if parsed_transactions:
        # Display extracted transactions
        print("\nExtract:")
        for idx, tx in enumerate(parsed_transactions[:5]):
            print(f" [{idx+1}] {tx['type'].upper()} of ₹{tx['amount']} at {tx['merchant']} ({tx['timestamp']})")
        
        # Suggest payload submission
        print(f"\n💡 To sync these to your dashboard:")
        print(f"1. Make sure your Vercel app is running.")
        print(f"2. Set SYNC_TOKEN header.")
        print(f"3. POST payload to {API_BASE_URL}/api/sync")
        print("\nDemo payload package created.")
        
        # Save a local JSON copy for verification
        with open("parsed_sms_output.json", "w") as f:
            json.dump(parsed_transactions, f, indent=2)
            print("💾 Saved results to parsed_sms_output.json")
            
if __name__ == "__main__":
    main()
