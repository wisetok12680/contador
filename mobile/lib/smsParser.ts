export interface ParsedSMS {
  amount: number;
  type: 'debit' | 'credit';
  merchant: string;
  timestamp: string;
  isCreditLineReset: boolean;
  raw: string;
}

/**
 * Parses bank SMS content to extract transaction info.
 * Designed for standard Indian bank transactional SMS alerts.
 */
export function parseSMS(text: string): ParsedSMS | null {
  const cleanText = text.trim();
  if (!cleanText) return null;

  // 1. Determine transaction type (debit vs. credit)
  const isDebit = /debit(ed)?|spent|withdrawn|sent|paid|pay(ment)?|transfer(red)?/i.test(cleanText);
  const isCredit = /credit(ed)?|received|added|deposited/i.test(cleanText);

  if (!isDebit && !isCredit) {
    return null; // Not a transactional SMS
  }

  const type = isDebit ? 'debit' : 'credit';

  // 2. Extract Amount
  // Matches Rs., Rs, INR, followed by numbers (with optional commas and decimals)
  // E.g., Rs. 500, Rs.500, INR 5,000.00, Rs 150.50
  const amountRegex = /(?:Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{2})?)/i;
  const amountMatch = cleanText.match(amountRegex);
  
  if (!amountMatch) {
    return null; // Could not find an amount
  }

  // Clean commas and convert to float
  const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  if (isNaN(amount)) return null;

  // 3. Extract Merchant or UPI ID / Reference info
  let merchant = 'Unknown Merchant';
  
  if (isDebit) {
    // Try to extract UPI ID / Merchant Name
    // Pattern examples:
    // "to VPA shop@upi"
    // "at SHOP NAME"
    // "to SHOP NAME"
    // "Ref: shop@upi"
    // "Info: UPI-SHOP-123"
    const merchantPatterns = [
      /(?:to|at|VPA|Ref)\s+([a-zA-Z0-9.\-_]+@[a-zA-Z0-9.\-_]+)/i, // UPI IDs like shop@okaxis
      /(?:to|at)\s+([a-zA-Z0-9\s\-]{3,20})(?:\s+on|\s+from|\s+via|\.|\b)/i, // "to SHOP NAME"
      /Ref\s*(?:No)?\.?\s*([a-zA-Z0-9\-_]{3,15})/i, // Reference IDs
      /Info:\s*([a-zA-Z0-9\-_]+)/i,
      /UPI-([a-zA-Z0-9\-_]+)/i
    ];

    for (const pattern of merchantPatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        // Exclude common words that might get caught as merchants
        if (!/^(a\/c|account|bank|branch|ref|refno|upi|via|on|date|time)$/i.test(candidate)) {
          merchant = candidate;
          break;
        }
      }
    }
  } else {
    // For credits, extract sender info if possible
    const senderPatterns = [
      /from\s+([a-zA-Z0-9\s\-]{3,20})(?:\s+on|\s+to|\.|\b)/i,
      /by\s+A\/c\s+(?:X+)?\d+/i
    ];
    for (const pattern of senderPatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        merchant = match[1].trim();
        break;
      }
    }
    if (merchant === 'Unknown Merchant') {
      merchant = 'Salary / Deposit';
    }
  }

  // 4. Check if this credit starts/resets the credit line
  // If it's a credit and amount is 5000 (or close to it/higher)
  const isCreditLineReset = isCredit && amount >= 5000;

  return {
    amount,
    type,
    merchant,
    timestamp: new Date().toISOString(),
    isCreditLineReset,
    raw: cleanText
  };
}

const BRAND_MAPPINGS: { pattern: RegExp; brandName: string }[] = [
  { pattern: /zomato/i, brandName: 'Zomato' },
  { pattern: /swiggy/i, brandName: 'Swiggy' },
  { pattern: /valve|steam/i, brandName: 'Steam / Valve' },
  { pattern: /netflix/i, brandName: 'Netflix' },
  { pattern: /amazon|amzn/i, brandName: 'Amazon' },
  { pattern: /flipkart|fk/i, brandName: 'Flipkart' },
  { pattern: /google|gpay|playstore|youtube/i, brandName: 'Google' },
  { pattern: /apple|itunes|icloud/i, brandName: 'Apple' },
  { pattern: /spotify/i, brandName: 'Spotify' },
  { pattern: /uber/i, brandName: 'Uber' },
  { pattern: /ola(cab)?/i, brandName: 'Ola Cabs' },
  { pattern: /starbucks/i, brandName: 'Starbucks' },
  { pattern: /mcdonald/i, brandName: "McDonald's" },
  { pattern: /bookmyshow|bms/i, brandName: 'BookMyShow' },
];

/**
 * Checks if a merchant string matches a popular big brand.
 */
export function getAutoBrand(merchant: string): string | null {
  for (const item of BRAND_MAPPINGS) {
    if (item.pattern.test(merchant)) {
      return item.brandName;
    }
  }
  return null;
}
