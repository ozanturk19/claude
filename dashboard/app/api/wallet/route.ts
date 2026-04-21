import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

export const dynamic = 'force-dynamic';

const WALLET   = '0x3dab2643f5A1587bBf8EFcD66E0477F4B78E43bF';
const USDC     = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const USDC_E   = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Çalışan Polygon RPC'ler (önce dene)
const RPCS = [
  'https://polygon.drpc.org',
  'https://polygon-bor-rpc.publicnode.com',
  'https://rpc-mainnet.matic.quiknode.pro',
  'https://polygon.gateway.tenderly.co',
];

const DB_PATH = process.env.BOT_DB_PATH
  ?? path.join(process.cwd(), '..', 'bot', 'data', 'observer.db');

async function rpcCall(method: string, params: unknown[]): Promise<string | null> {
  for (const rpc of RPCS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',  // Next.js fetch cache'ini devre dışı bırak
      });
      const json = await res.json() as { result?: string; error?: unknown };
      if (json.result) return json.result;
    } catch { /* sonraki RPC'yi dene */ }
  }
  return null;
}

async function erc20Balance(token: string, wallet: string): Promise<number> {
  const data   = '0x70a08231' + wallet.slice(2).padStart(64, '0');
  const result = await rpcCall('eth_call', [{ to: token, data }, 'latest']);
  if (!result || result === '0x') return 0;
  return parseInt(result, 16) / 1e6;
}

async function maticBalance(wallet: string): Promise<number> {
  const result = await rpcCall('eth_getBalance', [wallet, 'latest']);
  if (!result) return 0;
  return parseInt(result, 16) / 1e18;
}

async function usdcTransfers(wallet: string) {
  try {
    const urls = [
      `https://api.polygonscan.com/v2/api?chainid=137&module=account&action=tokentx&address=${wallet}&contractaddress=${USDC}&page=1&offset=25&sort=desc`,
      `https://api.polygonscan.com/v2/api?chainid=137&module=account&action=tokentx&address=${wallet}&contractaddress=${USDC_E}&page=1&offset=25&sort=desc`,
    ];
    const results = await Promise.allSettled(
      urls.map(u => fetch(u, { signal: AbortSignal.timeout(8000) }).then(r => r.json()))
    );

    const txns: { hash: string; ts: number; from: string; to: string; value: number; symbol: string; type: 'IN' | 'OUT' }[] = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const list = r.value?.result;
      if (!Array.isArray(list)) continue;
      for (const tx of list) {
        txns.push({
          hash:   tx.hash,
          ts:     parseInt(tx.timeStamp),
          from:   tx.from,
          to:     tx.to,
          value:  parseInt(tx.value) / 1e6,
          symbol: tx.tokenSymbol,
          type:   tx.to.toLowerCase() === wallet.toLowerCase() ? 'IN' : 'OUT',
        });
      }
    }
    const seen = new Set<string>();
    return txns
      .filter(t => { const ok = !seen.has(t.hash); seen.add(t.hash); return ok; })
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 30);
  } catch { return []; }
}

async function polyPositions(wallet: string) {
  try {
    const res = await fetch(
      `https://data-api.polymarket.com/positions?user=${wallet}&sizeThreshold=0.01`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function getLiveTrades(db: Database.Database) {
  try {
    return db.prepare(`
      SELECT lt.id, lt.market_id, lt.side, lt.shares,
             lt.entry_price, lt.entry_ts, lt.exit_price, lt.exit_ts,
             lt.target_price, lt.stop_price, lt.size_usd,
             lt.exit_reason, lt.pnl, lt.outcome,
             m.question, m.duration_min, m.close_time
      FROM live_trades lt
      JOIN markets m ON lt.market_id = m.id
      ORDER BY lt.entry_ts DESC
      LIMIT 50
    `).all();
  } catch { return []; }
}

function getLiveStats(db: Database.Database) {
  try {
    return db.prepare(`
      SELECT
        SUM(CASE WHEN outcome='WIN'  THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN outcome='LOSS' THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN outcome='OPEN' THEN 1 ELSE 0 END) as open,
        ROUND(SUM(CASE WHEN outcome IN ('WIN','LOSS') THEN COALESCE(pnl,0) ELSE 0 END),2) as total_pnl,
        ROUND(AVG(CASE WHEN outcome='WIN'  THEN pnl END),3) as avg_win,
        ROUND(AVG(CASE WHEN outcome='LOSS' THEN pnl END),3) as avg_loss,
        ROUND(AVG(entry_price),3) as avg_entry,
        COUNT(*) as total,
        ROUND(SUM(CASE WHEN outcome IN ('WIN','LOSS') THEN size_usd * 0.02 ELSE 0 END),2) as total_fee,
        ROUND(
          SUM(CASE WHEN outcome IN ('WIN','LOSS') THEN COALESCE(pnl,0) ELSE 0 END)
          - SUM(CASE WHEN outcome IN ('WIN','LOSS') THEN size_usd * 0.02 ELSE 0 END)
        ,2) as net_pnl,
        ROUND(
          AVG(CASE WHEN outcome='WIN' THEN pnl END) /
          ABS(NULLIF(AVG(CASE WHEN outcome='LOSS' THEN pnl END),0))
        ,2) as rr_ratio,
        SUM(CASE WHEN outcome='LOSS' AND exit_price < 0.5 THEN 1 ELSE 0 END) as crash_count,
        ROUND(SUM(CASE WHEN outcome='LOSS' AND exit_price < 0.5 THEN COALESCE(pnl,0) ELSE 0 END),2) as crash_pnl,
        ROUND(100.0 * SUM(CASE WHEN outcome='WIN' THEN 1 ELSE 0 END) /
          NULLIF(SUM(CASE WHEN outcome IN ('WIN','LOSS') THEN 1 ELSE 0 END),0),1) as win_rate
      FROM live_trades
    `).get();
  } catch { return null; }
}

// Bekleyen redemption — WIN ama henüz USDC.e'ye dönüşmemiş tokenlar
function getPendingRedemptions(db: Database.Database) {
  try {
    return db.prepare(`
      SELECT id, side, shares, entry_price, market_id, token_id
      FROM live_trades
      WHERE outcome = 'WIN' AND exit_reason LIKE 'settlement%' AND redeemed != 1
    `).all() as { id: number; side: string; shares: number; entry_price: number; market_id: string; token_id: string }[];
  } catch {
    // redeemed sütunu henüz yoksa tüm settlement_win'leri döndür
    try {
      return db.prepare(`
        SELECT id, side, shares, entry_price, market_id, token_id
        FROM live_trades
        WHERE outcome = 'WIN' AND exit_reason LIKE 'settlement%'
      `).all() as { id: number; side: string; shares: number; entry_price: number; market_id: string; token_id: string }[];
    } catch { return []; }
  }
}

export async function GET() {
  try {
    // Paralel: zincir verileri + DB verileri
    const [usdc, usdce, matic, transfers, positions] = await Promise.all([
      erc20Balance(USDC,   WALLET),
      erc20Balance(USDC_E, WALLET),
      maticBalance(WALLET),
      usdcTransfers(WALLET),
      polyPositions(WALLET),
    ]);

    // DB'den live trades
    let liveTrades: unknown[]   = [];
    let liveStats: unknown      = null;
    let pendingRedemptions: { id: number; side: string; shares: number; entry_price: number; market_id: string; token_id: string }[] = [];
    try {
      const db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
      liveTrades         = getLiveTrades(db);
      liveStats          = getLiveStats(db);
      pendingRedemptions = getPendingRedemptions(db);
      db.close();
    } catch { /* DB henüz yok olabilir */ }

    // Polymarket'ten gelen aktif pozisyonlar (sadece curValue > 0 olanlar)
    const positionsList = (Array.isArray(positions) ? positions : []) as any[];

    // Çifte sayımı önle: Positions API asset (ERC-1155 token ID) bazında dedup
    // Polymarket API marketId döndürmez — asset (token_id) döndürür.
    // DB'deki token_id ile birebir eşleşir → güvenli dedup.
    const positionAssets = new Set(
      positionsList
        .filter((p: any) => Number(p.currentValue) > 0)
        .map((p: any) => String(p.asset ?? ''))
    );

    // positionsTotal: yalnızca curValue > 0 olan pozisyonlar
    const positionsTotal = positionsList
      .reduce((s: number, p: any) => s + (Number(p.currentValue) || 0), 0);

    // unredeemed: DB'deki WIN ama positions API'sinde ZATEN görünen (token eşleşen) hariç
    const unredeemed = pendingRedemptions
      .filter((r: any) => !positionAssets.has(String(r.token_id)))
      .reduce((s: number, r: any) => s + r.shares * 1.0, 0);

    // Toplam portföy = nakit USDC + Polymarket pozisyon değeri (unredeemed + positions deduplicated)
    const usdcCash     = usdc + usdce;
    const portfolioTotal = usdcCash + positionsTotal + unredeemed;

    return NextResponse.json({
      wallet:            WALLET,
      usdc:              usdcCash,         // nakit (on-chain)
      usdcBreakdown:     { native: usdc, bridged: usdce },
      matic,
      transfers,
      positions,
      positionsTotal,                       // Polymarket pozisyon değeri
      portfolioTotal,                       // nakit + pozisyon = toplam
      unredeemed,                           // redemption bekleyen WIN token değeri
      pendingRedemptions,
      liveTrades,
      liveStats,
      updatedAt: Math.floor(Date.now() / 1000),
    });
  } catch (err) {
    return NextResponse.json({
      wallet: WALLET, usdc: null, matic: null,
      transfers: [], positions: [], liveTrades: [], liveStats: null,
      positionsTotal: 0, portfolioTotal: null, unredeemed: 0, pendingRedemptions: [],
      updatedAt: Math.floor(Date.now() / 1000),
      error: (err as Error).message,
    });
  }
}
