'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-xl text-stone-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-200';

export default function GenerateQrPage() {
  // ---------- Form state ----------
  const [tableNumber, setTableNumber] = useState('');
  const [adultCount, setAdultCount] = useState('1');
  const [childCount, setChildCount] = useState('0');

  // ---------- UI state ----------
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingSession, setExistingSession] = useState(null); // โต๊ะเดิมที่ยังเปิดอยู่
  const [showConfirm, setShowConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [result, setResult] = useState(null); // ผลลัพธ์หลังเปิดโต๊ะสำเร็จ
  const [copied, setCopied] = useState(false);

  // ---------- Handlers ----------
  async function handleOpenTable(e) {
    e.preventDefault();
    setError('');
    setExistingSession(null);

    const table = tableNumber.trim();
    const adults = Number(adultCount);
    const children = Number(childCount);

    if (!table) {
      setError('กรุณากรอกเลขโต๊ะ');
      return;
    }
    if (!Number.isInteger(adults) || adults < 0 || !Number.isInteger(children) || children < 0) {
      setError('จำนวนผู้ใหญ่และเด็กต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
      return;
    }
    if (adults + children < 1) {
      setError('ต้องมีลูกค้าอย่างน้อย 1 คน');
      return;
    }

    setLoading(true);
    try {
      // 1) เช็คว่าโต๊ะนี้ยังเปิดอยู่หรือไม่
      const { data: openSessions, error: selectError } = await supabase
        .from('sessions')
        .select('id, table_number, adult_count, child_count, created_at')
        .eq('table_number', table)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);

      if (selectError) throw selectError;

      if (openSessions && openSessions.length > 0) {
        // 2) มีอยู่แล้ว -> แสดงกล่องเตือน
        setExistingSession(openSessions[0]);
        return;
      }

      // 3) ยังไม่มี -> เปิดโต๊ะใหม่
      const { error: insertError } = await supabase.from('sessions').insert({
        table_number: table,
        adult_count: adults,
        child_count: children,
        status: 'open',
      });

      if (insertError) throw insertError;

      setResult({ tableNumber: table, adultCount: adults, childCount: children });
    } catch (err) {
      console.error(err);
      setError(`เกิดข้อผิดพลาด: ${err?.message ?? 'ไม่ทราบสาเหตุ'}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmClose() {
    if (!existingSession) return;
    setClosing(true);
    setError('');

    try {
      const { error: updateError } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', existingSession.id)
        .eq('status', 'open'); // เช็คซ้ำ กันกดซ้ำ/ชนกัน

      if (updateError) throw updateError;

      // สำเร็จ: ปิดกล่องเตือนและ dialog กลับสู่ฟอร์มเดิม (เก็บค่า input ไว้)
      setShowConfirm(false);
      setExistingSession(null);
    } catch (err) {
      console.error(err);
      setShowConfirm(false);
      setError(`ปิดโต๊ะเดิมไม่สำเร็จ: ${err?.message ?? 'ไม่ทราบสาเหตุ'}`);
    } finally {
      setClosing(false);
    }
  }

  async function handleCopy(url) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
      setError('คัดลอกลิงก์ไม่สำเร็จ กรุณาคัดลอกด้วยตัวเอง');
    }
  }

  function handleReset() {
    setTableNumber('');
    setAdultCount('1');
    setChildCount('0');
    setError('');
    setExistingSession(null);
    setShowConfirm(false);
    setResult(null);
    setCopied(false);
  }

  // ---------- Success UI ----------
  if (result) {
    const orderUrl = `${window.location.origin}/order/${encodeURIComponent(result.tableNumber)}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(orderUrl)}`;

    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-4 py-10 text-center">
        <p className="font-display text-2xl text-stone-900">
          SUSHI<span className="text-red-600">HANA</span>
        </p>

        <p className="w-full rounded-2xl border border-green-200 bg-green-50 px-5 py-3 text-xl font-semibold text-green-800">
          เปิดโต๊ะสำเร็จ ✅
        </p>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <img src={qrImageUrl} alt="QR Code สำหรับสั่งอาหาร" className="h-64 w-64" />
        </div>

        <p className="text-2xl font-semibold text-stone-900">
          โต๊ะ {result.tableNumber} · ผู้ใหญ่ {result.adultCount} · เด็ก {result.childCount}
        </p>

        <p className="w-full break-all rounded-xl bg-white p-3 text-base text-stone-600 shadow-sm">
          {orderUrl}
        </p>

        {error && (
          <p className="w-full rounded-2xl border border-red-200 bg-red-50 p-3 text-lg font-medium text-red-700">
            {error}
          </p>
        )}

        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => handleCopy(orderUrl)}
            className="flex-1 rounded-2xl border border-stone-300 bg-white px-6 py-4 text-xl font-semibold text-stone-800 shadow-sm"
          >
            {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 rounded-2xl bg-red-600 px-6 py-4 text-xl font-bold text-white shadow-md hover:bg-red-700"
          >
            เปิดโต๊ะใหม่
          </button>
        </div>
      </main>
    );
  }

  // ---------- Form UI (+ Warning UI) ----------
  const minutesElapsed = existingSession
    ? Math.floor((new Date() - new Date(existingSession.created_at)) / 60000)
    : 0;

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-10">
      <p className="mb-2 text-center font-display text-2xl text-stone-900">
        SUSHI<span className="text-red-600">HANA</span>
      </p>
      <h1 className="mb-6 text-center text-3xl font-bold text-stone-900">เปิดโต๊ะ</h1>

      <form
        onSubmit={handleOpenTable}
        className="flex flex-col gap-5 rounded-3xl bg-white p-6 shadow-sm"
      >
        <label className="flex flex-col gap-2 text-lg font-medium text-stone-700">
          เลขโต๊ะ
          <input
            type="text"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            className={inputClass}
            placeholder="เช่น 5"
            autoComplete="off"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-2 text-lg font-medium text-stone-700">
            ผู้ใหญ่
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={adultCount}
              onChange={(e) => setAdultCount(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-2 text-lg font-medium text-stone-700">
            เด็ก
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={childCount}
              onChange={(e) => setChildCount(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        {error && (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-lg font-medium text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-2xl bg-red-600 px-6 py-4 text-2xl font-bold text-white shadow-md transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'กำลังตรวจสอบ...' : 'เปิดโต๊ะและสร้าง QR'}
        </button>
      </form>

      {/* Warning UI */}
      {existingSession && (
        <div className="mt-6 rounded-3xl border border-orange-300 bg-orange-50 p-5">
          <p className="text-xl font-semibold text-red-700">
            โต๊ะนี้มีลูกค้าอยู่ระหว่างทานอาหาร กรุณาปิดออเดอร์เดิมก่อน
          </p>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="mt-4 w-full rounded-2xl bg-red-600 px-6 py-3 text-xl font-semibold text-white hover:bg-red-700"
          >
            ปิดออเดอร์เดิม
          </button>
        </div>
      )}

      {/* Confirm Dialog */}
      {existingSession && showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-2xl font-bold text-red-700">ยืนยันปิดโต๊ะเดิม?</h2>

            <ul className="mb-6 space-y-2 rounded-2xl bg-[#f8f5f0] p-4 text-xl text-stone-800">
              <li>โต๊ะ: {existingSession.table_number}</li>
              <li>
                ผู้ใหญ่ {existingSession.adult_count} · เด็ก {existingSession.child_count}
              </li>
              <li>เปิดมาแล้ว {minutesElapsed} นาที</li>
            </ul>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={closing}
                className="flex-1 rounded-2xl bg-stone-100 px-4 py-3 text-lg font-semibold text-stone-700 hover:bg-stone-200 disabled:opacity-60"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmClose}
                disabled={closing}
                className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-lg font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {closing ? 'กำลังปิด...' : 'ยืนยันปิดโต๊ะเดิม'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
