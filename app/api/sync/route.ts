import { NextRequest, NextResponse } from 'next/server';

// Global cache fallback for the serverless function's memory lifecycle
let globalCache = {
  transactions: [] as any[],
  mappings: [] as any[],
  creditBase: 5000,
  lastSync: null as string | null,
  smsCutoffTime: null as string | null
};

// Check for Vercel KV environment variables (if linked on Vercel)
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

/**
 * Retrieve database state from Vercel KV or global fallback cache
 */
async function getStoredData() {
  if (KV_URL && KV_TOKEN) {
    try {
      const res = await fetch(`${KV_URL}/get/flowfinance_data`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        if (json.result) {
          return JSON.parse(json.result);
        }
      }
    } catch (e) {
      console.error('Failed to read from Vercel KV:', e);
    }
  }
  return globalCache;
}

/**
 * Save database state to Vercel KV or global fallback cache
 */
async function setStoredData(data: typeof globalCache) {
  globalCache = data;
  if (KV_URL && KV_TOKEN) {
    try {
      await fetch(`${KV_URL}/set/flowfinance_data`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${KV_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(JSON.stringify(data))
      });
    } catch (e) {
      console.error('Failed to write to Vercel KV:', e);
    }
  }
}

/**
 * GET handler: Retrieve sync data for dashboard display.
 * Requires verification of token query param.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const envToken = process.env.SYNC_TOKEN || 'default-token-12345';

  if (!token || token !== envToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await getStoredData();
  return NextResponse.json(data);
}

/**
 * POST handler: Pushes device transaction and mapping states to cloud storage.
 * Requires Bearer Sync Token in Authorization header.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  const envToken = process.env.SYNC_TOKEN || 'default-token-12345';

  if (!token || token !== envToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { transactions, mappings, creditBase, lastSync, smsCutoffTime } = body;

    const data = {
      transactions: transactions || [],
      mappings: mappings || [],
      creditBase: creditBase || 5000,
      lastSync: lastSync || new Date().toISOString(),
      smsCutoffTime: smsCutoffTime || new Date().toISOString()
    };

    await setStoredData(data);
    return NextResponse.json({ success: true, lastSync: data.lastSync });
  } catch (err) {
    return NextResponse.json({ error: 'Invalid payload parameters' }, { status: 400 });
  }
}
