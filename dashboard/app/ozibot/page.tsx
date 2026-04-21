'use client';

import { useEffect, useState, useCallback } from 'react';

const WALLET = '0x3dab2643f5A1587bBf8EFcD66E0477F4B78E43bF';

interface Transfer {
  hash: string; ts: number; from: string; to: string;
  value: number; symbol: string; type: 'IN' | 'OUT';
}
interface Position {
  size: number; avgPrice: number; currentValue: number;
  cashPnl: number; question: string; outcome: string;
  endDate: string; title: string;
}
interface LiveTrade {
  id: number; market_id: string; side: string;
  shares: number; entry_price: number; entry_ts: number;
  exit_price: number | null; exit_ts: number | null;
  target_price: number; stop_price: number; size_usd: number;
  exit_reason: string | null; pnl: number | null; outcome: string;
  question: string; duration_min: number; close_time: number;
}
interface LiveStats {
  wins: number; losses: number; open: number;
  total_pnl: number; avg_win: number | null;
  avg_loss: number | null; avg_entry: number | null; total: number;
  total_fee: number | null; net_pnl: number | null;
  rr_ratio: number | null; crash_count: number | null;
  crash_pnl: number | null; win_rate: number | null;
}
interface WalletData {
  wallet: string; usdc: number | null;
  usdcBreakdown: { native: number; bridged: number } | null;
  matic: number | null; transfers: Transfer[]; positions: Position[];
  positionsTotal: number; portfolioTotal: number | null;
  unredeemed: number; liveTrades: LiveTrade[];
  liveStats: LiveStats | null; updatedAt: number; error?: string;
}

function useNow() {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Countdown({ closeTime, now }: { closeTime: number; now: number }) {
  const rem = closeTime - now;
  if (rem <= 0) return <span className="text-gray-500">Bitti</span>;
  const m = Math.floor(rem / 60), s = rem % 60;
  return (
    <span className={rem < 60 ? 'text-red-400 font-mono animate-pulse' : 'text-gray-300 font-mono'}>
      {m > 0 ? `${m}d ${s}s` : `${s}s`}
    </span>
  );
}

function shortAddr(addr: string) { return addr.slice(0, 6) + '…' + addr.slice(-4); }
function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function SectionHeader({ title, count, open, onToggle, extra }: {
  title: string; count?: number; open: boolean;
  onToggle: () => void; extra?: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide">{title}</h2>
        {count !== undefined && (
          <span className="text-xs text-gray-500">({count})</span>
        )}
        {extra}
      </div>
      <span className="text-gray-500 text-xs flex-shrink-0">{open ? '▲ Kapat' : '▼ Aç'}</span>
    </button>
  );
}

export default function OziBotPage() {
  const now = useNow();
  const [data, setData]         = useState<WalletData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  // Collapsible states
  const [showTrades,    setShowTrades]    = useState(true);
  const [showPositions, setShowPositions] = useState(true);
  const [showTransfers, setShowTransfers] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res  = await fetch('/api/wallet');
      const json = await res.json();
      setData(json);
      setLastUpdate(Math.floor(Date.now() / 1000));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 10_000);
    return () => clearInterval(t);
  }, [fetchData]);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">Yükleniyor...</div>
  );

  const usdc          = data?.usdc ?? 0;
  const portfolioTotal = data?.portfolioTotal ?? usdc;
  const positionsTotal = data?.positionsTotal ?? 0;
  const unredeemed    = data?.unredeemed ?? 0;
  const matic         = data?.matic ?? 0;
  const positions     = data?.positions ?? [];
  const transfers     = data?.transfers ?? [];
  const liveTrades    = data?.liveTrades ?? [];
  const liveStats     = data?.liveStats ?? null;

  const openTrades   = liveTrades.filter(t => t.outcome === 'OPEN');
  const closedTrades = liveTrades.filter(t => t.outcome !== 'OPEN');

  const liveWins   = liveStats?.wins ?? 0;
  const liveLosses = liveStats?.losses ?? 0;
  const liveTotal  = liveWins + liveLosses;
  const liveWR     = liveStats?.win_rate != null ? liveStats.win_rate.toFixed(1) : (liveTotal > 0 ? ((liveWins / liveTotal) * 100).toFixed(0) : '—');
  const liveGrossPnl = liveStats?.total_pnl ?? 0;
  const liveFee    = liveStats?.total_fee ?? 0;
  const livePnl    = liveStats?.net_pnl ?? liveGrossPnl;
  const liveRR     = liveStats?.rr_ratio ?? null;
  const crashCount = liveStats?.crash_count ?? 0;
  const crashPnl   = liveStats?.crash_pnl ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white">OziBot</h1>
            <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-medium">Polygon</span>
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">LIVE</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs font-mono text-gray-500">{WALLET.slice(0,10)}…{WALLET.slice(-6)}</span>
            <a href={`https://polygonscan.com/address/${WALLET}`} target="_blank" rel="noreferrer"
              className="text-xs text-poly-blue hover:underline">Polygonscan ↗</a>
            <a href={`https://polymarket.com/profile/${WALLET}`} target="_blank" rel="noreferrer"
              className="text-xs text-poly-blue hover:underline">Polymarket ↗</a>
          </div>
        </div>
        <div className="text-right text-xs text-gray-500 flex-shrink-0">
          {lastUpdate ? `${now - lastUpdate}s önce` : ''}
        </div>
      </div>

      {data?.error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-300 text-sm">
          {data.error}
        </div>
      )}

      {/* ── Özet Kutular ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">

        {/* Portföy */}
        <div className="bg-poly-card border border-poly-border rounded-xl p-3 sm:p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Portföy
          </div>
          <div className={`text-xl sm:text-2xl font-bold ${portfolioTotal >= usdc ? 'text-green-400' : 'text-yellow-400'}`}>
            ${portfolioTotal.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
            <div>Nakit: <span className="text-gray-300">${usdc.toFixed(2)}</span></div>
            {positionsTotal > 0 && <div>Poz: <span className="text-blue-300">+${positionsTotal.toFixed(2)}</span></div>}
            {unredeemed > 0 && positionsTotal === 0 && <div>Bekl: <span className="text-yellow-400">~${unredeemed.toFixed(2)}</span></div>}
          </div>
        </div>

        {/* Gas */}
        <div className="bg-poly-card border border-poly-border rounded-xl p-3 sm:p-4">
          <div className="text-xs text-gray-500 uppercase mb-1">Gas (POL)</div>
          <div className={`text-xl sm:text-2xl font-bold ${matic < 0.5 ? 'text-yellow-400' : 'text-white'}`}>
            {matic.toFixed(3)}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{matic < 0.5 ? '⚠️ Azalıyor' : 'Yeterli'}</div>
        </div>

        {/* Net P&L */}
        <div className="bg-poly-card border border-poly-border rounded-xl p-3 sm:p-4">
          <div className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
            {liveTotal > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />}
            Net P&L
          </div>
          <div className={`text-xl sm:text-2xl font-bold ${livePnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {livePnl >= 0 ? '+' : ''}${livePnl.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
            {liveTotal > 0 ? (
              <>
                <div>{liveWins}W / {liveLosses}L · %{liveWR} WR</div>
                <div>Gross: <span className={liveGrossPnl >= 0 ? 'text-gray-400' : 'text-red-400/70'}>{liveGrossPnl >= 0 ? '+' : ''}${liveGrossPnl.toFixed(2)}</span> · Fee: <span className="text-orange-400/70">-${liveFee.toFixed(2)}</span></div>
              </>
            ) : 'Henüz işlem yok'}
          </div>
        </div>

        {/* Açık Pozisyon */}
        <div className="bg-poly-card border border-poly-border rounded-xl p-3 sm:p-4">
          <div className="text-xs text-gray-500 uppercase mb-1">Açık Poz.</div>
          <div className={`text-xl sm:text-2xl font-bold ${openTrades.length > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
            {openTrades.length}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {openTrades.length > 0 ? 'İzleniyor' : 'Sinyal bekleniyor'}
          </div>
        </div>
      </div>

      {/* ── Performans Metrikleri ── */}
      {liveTotal > 0 && (
        <div className="bg-poly-card border border-poly-border rounded-xl px-4 py-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">R:R Oranı</span>
            <span className={`font-medium ${liveRR != null && liveRR >= 0.8 ? 'text-green-400' : 'text-orange-400'}`}>
              {liveRR != null ? liveRR.toFixed(2) : '—'}
            </span>
            <span className="text-gray-600">(hedef ≥1.0)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Crash Loss</span>
            <span className={`font-medium ${crashCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>
              {crashCount} trade
            </span>
            {crashCount > 0 && <span className="text-red-400/70">(${crashPnl.toFixed(2)})</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Toplam Fee</span>
            <span className="font-medium text-orange-400">-${liveFee.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Avg Win</span>
            <span className="font-medium text-green-400">{liveStats?.avg_win != null ? '+$' + liveStats.avg_win.toFixed(3) : '—'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Avg Loss</span>
            <span className="font-medium text-red-400">{liveStats?.avg_loss != null ? '$' + liveStats.avg_loss.toFixed(3) : '—'}</span>
          </div>
        </div>
      )}

      {/* ── Canlı İşlemler ── */}
      <div className="bg-poly-card border border-poly-border rounded-xl overflow-hidden">
        <SectionHeader
          title="Canlı İşlemler"
          count={closedTrades.length + openTrades.length}
          open={showTrades}
          onToggle={() => setShowTrades(v => !v)}
          extra={liveTotal > 0 && (
            <span className={`text-sm font-bold ${livePnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {livePnl >= 0 ? '+' : ''}${livePnl.toFixed(2)}
            </span>
          )}
        />

        {showTrades && (
          <div className="px-3 sm:px-4 pb-4 space-y-3">
            {/* Açık pozisyonlar */}
            {openTrades.map(t => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 text-xs bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
                <span className={`font-semibold ${t.side === 'UP' ? 'text-green-400' : 'text-red-400'}`}>{t.side}</span>
                <span className="text-white font-mono">{t.shares}×@{t.entry_price.toFixed(3)}</span>
                <span className="text-gray-500">T:{t.target_price} S:{t.stop_price.toFixed(3)}</span>
                <span className="text-gray-400 flex-1 min-w-0 truncate hidden sm:block">{t.question?.slice(0, 35)}</span>
                <Countdown closeTime={t.close_time} now={now} />
              </div>
            ))}

            {/* Kapalı işlemler */}
            {closedTrades.length === 0 && openTrades.length === 0 ? (
              <div className="text-sm text-gray-500 py-6 text-center">
                Bot çalışıyor, fiyat bandı (0.91–0.92) bekleniyor...
              </div>
            ) : closedTrades.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-poly-border">
                      <th className="pb-1.5 text-left">Zaman</th>
                      <th className="pb-1.5 text-left">Taraf</th>
                      <th className="pb-1.5 text-center">Süre</th>
                      <th className="pb-1.5 text-right">Giriş</th>
                      <th className="pb-1.5 text-right">Çıkış</th>
                      <th className="pb-1.5 text-right hidden sm:table-cell">Shares</th>
                      <th className="pb-1.5 text-left hidden sm:table-cell">Neden</th>
                      <th className="pb-1.5 text-right">P&L</th>
                      <th className="pb-1.5 text-center">Sonuç</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedTrades.slice(0, 50).map(t => (
                      <tr key={t.id} className="border-b border-poly-border/40 hover:bg-white/[0.02]">
                        <td className="py-1.5 text-gray-500 whitespace-nowrap">{fmtTime(t.entry_ts)}</td>
                        <td className={`py-1.5 font-medium ${t.side === 'UP' ? 'text-green-400' : 'text-red-400'}`}>{t.side}</td>
                        <td className="py-1.5 text-center">
                          <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                            t.duration_min === 15 ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'
                          }`}>{t.duration_min}dk</span>
                        </td>
                        <td className="py-1.5 text-right text-gray-300 font-mono">{t.entry_price.toFixed(3)}</td>
                        <td className="py-1.5 text-right text-gray-300 font-mono">{t.exit_price?.toFixed(3) ?? '—'}</td>
                        <td className="py-1.5 text-right text-gray-500 hidden sm:table-cell">{t.shares}</td>
                        <td className="py-1.5 text-gray-500 max-w-[100px] truncate hidden sm:table-cell">{t.exit_reason ?? '—'}</td>
                        <td className={`py-1.5 text-right font-medium font-mono ${(t.pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            t.outcome === 'WIN' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                          }`}>{t.outcome}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Polymarket Pozisyonları ── */}
      {positions.length > 0 && (
        <div className="bg-poly-card border border-poly-border rounded-xl overflow-hidden">
          <SectionHeader
            title="Polymarket Pozisyonları"
            count={positions.length}
            open={showPositions}
            onToggle={() => setShowPositions(v => !v)}
            extra={positionsTotal > 0 && (
              <span className="text-xs font-normal text-blue-300">${positionsTotal.toFixed(2)}</span>
            )}
          />
          {showPositions && (
            <div className="px-3 sm:px-4 pb-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-poly-border">
                    <th className="pb-2 text-left">Market</th>
                    <th className="pb-2 text-left">Taraf</th>
                    <th className="pb-2 text-right hidden sm:table-cell">Miktar</th>
                    <th className="pb-2 text-right">Değer</th>
                    <th className="pb-2 text-right">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => (
                    <tr key={i} className="border-b border-poly-border/40">
                      <td className="py-1.5 text-gray-300 max-w-[150px] sm:max-w-[220px] truncate">{p.title || p.question}</td>
                      <td className="py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          p.outcome?.toLowerCase().includes('up') ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                        }`}>{p.outcome}</span>
                      </td>
                      <td className="py-1.5 text-right text-gray-400 hidden sm:table-cell">{p.size?.toFixed(1)}</td>
                      <td className="py-1.5 text-right text-white">${p.currentValue?.toFixed(2)}</td>
                      <td className={`py-1.5 text-right font-medium ${(p.cashPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(p.cashPnl ?? 0) >= 0 ? '+' : ''}${p.cashPnl?.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── USDC Hareketleri ── */}
      <div className="bg-poly-card border border-poly-border rounded-xl overflow-hidden">
        <SectionHeader
          title="USDC Hareketleri"
          count={transfers.length}
          open={showTransfers}
          onToggle={() => setShowTransfers(v => !v)}
        />
        {showTransfers && (
          <div className="px-3 sm:px-4 pb-4">
            {transfers.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 text-center">Henüz hareket yok</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-poly-border">
                      <th className="pb-1.5 text-left">Tarih</th>
                      <th className="pb-1.5 text-left">Tür</th>
                      <th className="pb-1.5 text-left hidden sm:table-cell">Karşı</th>
                      <th className="pb-1.5 text-right">Miktar</th>
                      <th className="pb-1.5 text-center">TX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((t, i) => (
                      <tr key={i} className="border-b border-poly-border/40">
                        <td className="py-1.5 text-gray-500 whitespace-nowrap">{fmtTime(t.ts)}</td>
                        <td className="py-1.5">
                          <span className={`px-1.5 py-0.5 rounded font-medium text-xs ${
                            t.type === 'IN' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                          }`}>{t.type === 'IN' ? '↓ Gelen' : '↑ Giden'}</span>
                        </td>
                        <td className="py-1.5 font-mono text-gray-500 hidden sm:table-cell">
                          {shortAddr(t.type === 'IN' ? t.from : t.to)}
                        </td>
                        <td className={`py-1.5 text-right font-medium ${t.type === 'IN' ? 'text-green-400' : 'text-red-400'}`}>
                          {t.type === 'IN' ? '+' : '-'}${t.value.toFixed(2)}
                        </td>
                        <td className="py-1.5 text-center">
                          <a href={`https://polygonscan.com/tx/${t.hash}`} target="_blank" rel="noreferrer"
                            className="text-poly-blue hover:underline">↗</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-xs text-gray-600 text-center pb-2">
        Polygon · USDC.e · 10sn güncelleme · 5 share/trade (~$4.60)
      </div>
    </div>
  );
}
