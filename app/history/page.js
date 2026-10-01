'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // เวลาไทย UTC+7 (ไม่มี DST)
const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_LIMIT = 2000; // แสดงสูงสุดกี่รายการล่าสุด

const RANGES = [
  { key: 'today', label: 'วันนี้' },
  { key: '7d', label: '7 วันล่าสุด' },
  { key: '30d', label: '30 วันล่าสุด' },
  { key: 'all', label: 'ทั้งหมด' },
];

// เริ่มวัน 00:00 ตามเวลาไทย (นับย้อนหลัง daysAgo วัน) แปลงเป็น ISO (UTC)
function bangkokDayStart(daysAgo = 0) {
  const bkk = new Date(Date.now() + BKK_OFFSET_MS);
  const utcMidnight = Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate());
  return new Date(utcMidnight - BKK_OFFSET_MS - daysAgo * DAY_MS).toISOString();
}

function rangeToFrom(key) {
  if (key === 'today') return bangkokDayStart(0);
  if (key === '7d') return bangkokDayStart(6);
  if (key === '30d') return bangkokDayStart(29);
  return null; // ทั้งหมด
}

const baht = (n) => Number(n ?? 0).toLocaleString('th-TH');

const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD

const fmtDayKey = (key) =>
  new Date(`${key}T00:00:00+07:00`).toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export default function HistoryPage() {
  const [range, setRange] = useState('today');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const loadLogs = useCallback(async (rangeKey) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');

    let query = supabase
      .from('payment_logs')
      .select('id, table_number, adult_count, child_count, adult_price, child_price, total_amount, paid_at')
      .order('paid_at', { ascending: false })
      .limit(ROW_LIMIT);

    const from = rangeToFrom(rangeKey);
    if (from) query = query.gte('paid_at', from);

    const { data, error: fetchError } = await query;

    if (requestId !== requestIdRef.current) return; // มีคำขอใหม่กว่าแล้ว ทิ้งผลเก่า
    setLoading(false);

    if (fetchError) {
      console.error(fetchError);
      setError(`โหลดประวัติไม่สำเร็จ: ${fetchError.message}`);
      return;
    }
    setLogs(data ?? []);
  }, []);

  useEffect(() => {
    loadLogs('today');
  }, [loadLogs]);

  function changeRange(key) {
    setRange(key);
    loadLogs(key);
  }

  // ---------- สรุปตัวเลข ----------
  const summary = useMemo(() => {
    let revenue = 0;
    let adults = 0;
    let children = 0;
    const byDay = new Map();

    for (const l of logs) {
      const total = Number(l.total_amount ?? 0);
      const a = Number(l.adult_count ?? 0);
      const c = Number(l.child_count ?? 0);
      revenue += total;
      adults += a;
      children += c;

      const k = dayKey(l.paid_at);
      const d = byDay.get(k) ?? { key: k, tables: 0, adults: 0, children: 0, revenue: 0 };
      d.tables += 1;
      d.adults += a;
      d.children += c;
      d.revenue += total;
      byDay.set(k, d);
    }

    const days = [...byDay.values()].sort((x, y) => y.key.localeCompare(x.key));
    return { revenue, adults, children, tables: logs.length, days };
  }, [logs]);

  const average = summary.tables > 0 ? Math.round(summary.revenue / summary.tables) : 0;

  // ---------- ดาวน์โหลด CSV (เปิดใน Excel ได้ ภาษาไทยไม่เพี้ยน) ----------
  function downloadCsv() {
    const header = ['เวลาชำระเงิน', 'โต๊ะ', 'ผู้ใหญ่', 'เด็ก', 'ราคาผู้ใหญ่', 'ราคาเด็ก', 'ยอดรวม'];
    const rows = logs.map((l) => [
      new Date(l.paid_at).toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }),
      l.table_number,
      l.adult_count,
      l.child_count,
      l.adult_price,
      l.child_price,
      l.total_amount,
    ]);

    const csv =
      '\uFEFF' +
      [header, ...rows]
        .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-history-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- UI ----------
  return (
    <main className="min-h-screen px-4 pb-16 pt-5">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 flex items-center justify-between gap-3 rounded-3xl bg-[#e32929] px-6 py-5 text-white shadow-md">
          <div>
            <p className="text-base text-white/80">Payment History · ประวัติการชำระเงิน</p>
            <h1 className="font-display text-3xl">SUSHIHANA</h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-white/70 px-4 py-2 text-base font-semibold text-white"
          >
            หน้าแรก
          </Link>
        </header>

        {/* ตัวกรองช่วงเวลา */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => changeRange(r.key)}
              className={`rounded-full px-5 py-2.5 text-lg font-semibold transition ${
                r.key === range
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'border border-stone-200 bg-white text-stone-700'
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => loadLogs(range)}
            disabled={loading}
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-base font-semibold text-stone-700 disabled:opacity-60"
          >
            {loading ? 'กำลังโหลด...' : '↻ รีเฟรช'}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={logs.length === 0}
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-base font-semibold text-stone-700 disabled:opacity-50"
          >
            ⬇ CSV
          </button>
        </div>

        {error && (
          <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-lg font-semibold text-red-700">
            {error}
          </p>
        )}

        {/* สรุป */}
        <section className="mb-5 grid grid-cols-2 gap-3">
          <div className="col-span-2 rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-base text-stone-500">ยอดรวมในช่วงที่เลือก</p>
            <p className="font-display text-5xl text-red-600">฿{baht(summary.revenue)}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-base text-stone-500">โต๊ะที่ชำระแล้ว</p>
            <p className="text-3xl font-bold text-stone-900">{summary.tables}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-base text-stone-500">เฉลี่ยต่อโต๊ะ</p>
            <p className="text-3xl font-bold text-stone-900">฿{baht(average)}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-base text-stone-500">ผู้ใหญ่</p>
            <p className="text-3xl font-bold text-stone-900">{summary.adults}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-base text-stone-500">เด็ก</p>
            <p className="text-3xl font-bold text-stone-900">{summary.children}</p>
          </div>
        </section>

        {logs.length >= ROW_LIMIT && (
          <p className="mb-4 rounded-2xl border border-orange-300 bg-orange-50 p-3 text-base text-orange-800">
            แสดงสูงสุด {baht(ROW_LIMIT)} รายการล่าสุด ตัวเลขสรุปอาจไม่ครบ ลองเลือกช่วงเวลาที่สั้นลง
          </p>
        )}

        {/* สรุปรายวัน */}
        {summary.days.length > 1 && (
          <section className="mb-5">
            <h2 className="mb-3 text-2xl font-bold text-stone-900">สรุปรายวัน</h2>
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-3xl bg-white shadow-sm">
              {summary.days.map((d) => (
                <li key={d.key} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-lg font-semibold text-stone-900">{fmtDayKey(d.key)}</p>
                    <p className="text-base text-stone-500">
                      {d.tables} โต๊ะ · ผู้ใหญ่ {d.adults} · เด็ก {d.children}
                    </p>
                  </div>
                  <p className="font-display text-2xl text-red-600">฿{baht(d.revenue)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* รายการ */}
        <section>
          <h2 className="mb-3 text-2xl font-bold text-stone-900">รายการชำระเงิน</h2>

          {logs.length === 0 ? (
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-lg text-stone-500">
                {loading ? 'กำลังโหลด...' : 'ยังไม่มีประวัติในช่วงเวลานี้'}
              </p>
              {!loading && !error && (
                <p className="mt-2 text-sm text-stone-400">
                  ถ้าใน Supabase (ตาราง payment_logs) มีข้อมูลแต่หน้านี้ยังว่าง แปลว่ายังไม่ได้เปิดสิทธิ์อ่าน
                  ให้รัน SQL ในไฟล์ supabase/payment_history.sql
                </p>
              )}
            </div>
          ) : (
            <ul className="space-y-3">
              {logs.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-sm text-stone-500">โต๊ะ</p>
                      <p className="font-display text-3xl leading-none text-red-600">
                        {l.table_number}
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-stone-900">
                        {fmtDateTime(l.paid_at)}
                      </p>
                      <p className="text-base text-stone-500">
                        ผู้ใหญ่ {l.adult_count} × {baht(l.adult_price)} · เด็ก {l.child_count} ×{' '}
                        {baht(l.child_price)}
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 font-display text-2xl text-stone-900">
                    ฿{baht(l.total_amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
