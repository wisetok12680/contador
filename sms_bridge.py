#!/usr/bin/env python3
import re
import sys
import json
import subprocess
from datetime import datetime

# ==============================================================================
# Configuration
# ==============================================================================
# URL of your Vercel-deployed app (e.g., https://my-finance-manager.vercel.app)
# Change to http://localhost:3000 for local testing
API_BASE_URL = "http://localhost:3000" 

# The Sync Token defined in your environment variables on Vercel
SYNC_TOKEN = "your-secure-sync-token-here"

# Senders to filter (commonly Indian bank SMS handles)
BANK_SENDER_PATTERNS = r"HDFC|ICICI|SBI|AXIS|PAYTM|PNB|BOI|KOTAK"

# ==============================================================================
# Parsing Helper
# ==============================================================================
def parse_sms(body):
    """
    Parses bank SMS text locally.
    Extracts transaction type, amount, merchant/VPA, and date.
    """
    clean_body = body.strip()
    
    # 1. Determine transaction type (debit vs credit)
    is_debit = bool(re.search(r"debit(ed)?|spent|withdrawn|sent|paid|pay(ment)?|transfer(red)?", clean_body, re.IGNORECASE))
    is_credit = bool(re.search(r"credit(ed)?|received|added|deposited", clean_body, re.IGNORECASE))
    
    if not is_debit and not is_credit:
        return None  # Non-transactional message
        
    tx_type = "debit" if is_debit else "credit"
    
    # 2. Extract Amount (e.g., Rs. 500, Rs.500, INR 5,000.00, Rs 150.50)
    amount_match = re.search(r"(?:Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{2})?)", clean_body, re.IGNORECASE)
    if not amount_match:
        return None
        
    amount = float(amount_match.group(1).replace(",", ""))
    
    # 3. Extract Merchant
    merchant = "Unknown Merchant"
    if is_debit:
        # Check for UPI IDs or names
        merchant_patterns = [
            r"(?:to|at|VPA|Ref)\s+([a-zA-Z0-9.\-_]+@[a-zA-Z0-9.\-_]+)",  # UPI ID
            r"(?:to|at)\s+([a-zA-Z0-9\s\-]{3,20})(?:\s+on|\s+from|\s+via|\.|\b)",  # at SHOP NAME
            r"Ref\s*(?:No)?\.?\s*([a-zA-Z0-9\-_]{3,15})",
            r"Info:\s*([a-zA-Z0-9\-_]+)",
            r"UPI-([a-zA-Z0-9\-_]+)"
        ]
        
        for pattern in merchant_patterns:
            match = re.search(pattern, clean_body, re.IGNORECASE)
            if match:
                candidate = match.group(1).strip()
                if not re.match(r"^(a/c|account|bank|branch|ref|refno|upi|via|on|date|time)$", candidate, re.IGNORECASE):
                    merchant = candidate
                    break
    else:
        sender_match = re.search(r"from\s+([a-zA-Z0-9\s\-]{3,20})(?:\s+on|\s+to|\.|\b)", clean_body, re.IGNORECASE)
        if sender_match:
            merchant = sender_match.group(1).strip()
        else:
            merchant = "Salary / Deposit"
            
    return {
        "amount": amount,
        "type": tx_type,
        "merchant": merchant,
        "timestamp": datetime.now().isoformat(),
        "isCreditLineReset": tx_type == "credit" and amount >= 5000,
        "raw": clean_body
    }

# ==============================================================================
# Android ADB SMS Reader
# ==============================================================================
def read_android_sms_adb():
    """
    Fetches SMS inbox from an Android phone connected via USB debugging (ADB).
    """
    print("🔄 Connecting to Android phone via ADB...")
    try:
        # Check if adb is available
        subprocess.run(["adb", "devices"], check=True, stdout=subprocess.DEVNULL)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ Error: ADB command not found or no device connected.")
        print("Please connect your phone, enable USB debugging, and ensure 'adb' is in your system path.")
        return []

    # Run content query command on Android
    # uri is content://sms/inbox
    # we select body, address, date
    cmd = [
        "adb", "shell", "content", "query",
        "--uri", "content://sms/inbox",
        "--projection", "address,body,date",
        "--sort", "date DESC"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Error fetching SMS content: {e}")
        return []

    messages = []
    # ADB query output looks like:
    # Row: 0 address=HDFCBK, body=Your A/c is debited..., date=1672531199000
    # We parse the output row by row
    current_msg = {}
    
    for line in result.stdout.splitlines():
        line = line.strip()
        if line.startswith("Row:"):
            # Process previous message if complete
            if "address" in current_msg and "body" in current_msg:
                messages.append(current_msg)
                
            current_msg = {}
            # Extract attributes using regex
            address_match = re.search(r"address=([^,]+)", line)
            body_match = re.search(r"body=(.+?)(?:, date=|$)", line)
            date_match = re.search(r"date=(\d+)", line)
            
            if address_match:
                current_msg["address"] = address_match.group(1).strip()
            if body_match:
                current_msg["body"] = body_match.group(1).strip()
            if date_match:
                # Convert milliseconds timestamp to string date
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

    print(f"📬 Read {len(sms_list)} messages from inbox. Filtering bank SMS...")
    
    parsed_transactions = []
    
    for msg in sms_list:
        sender = msg.get("address", "")
        body = msg.get("body", "")
        
        # Check if message is from a bank
        if re.search(BANK_SENDER_PATTERNS, sender, re.IGNORECASE):
            parsed = parse_sms(body)
            if parsed:
                # Overwrite parsed timestamp with actual SMS timestamp
                parsed["timestamp"] = msg.get("date", parsed["timestamp"])
                parsed_transactions.append(parsed)

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
