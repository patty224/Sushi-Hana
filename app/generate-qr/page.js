'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const ADULT_PRICE = 289;
const CHILD_PRICE = 145;
// PIN พนักงาน (ไม่บังคับ): ถ้าไม่ตั้ง NEXT_PUBLIC_STAFF_PIN หน้านี้จะเปิดให้ทุกคนเหมือนเดิม
const STAFF_PIN = process.env.NEXT_PUBLIC_STAFF_PIN;
const STORAGE_KEY = 'sushihana_staff_unlocked';

const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-xl text-stone-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-200';

function formatBaht(n) {
  return Number(n).toLocaleString('th-TH');
}

// เสียงแจ้งเตือนเมื่อมีคำขอเรียกเก็บเงินใหม่ (Web Audio ไม่ต้องใช้ไฟล์เสียง)
let audioCtx = null;
function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const start = audioCtx.currentTime;
    [0, 0.3].forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, start + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.27);
    });

    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch {
    // เล่นเสียงไม่ได้ก็ไม่เป็นไร
  }
}

// ---------- ด่าน PIN พนักงาน (ทำงานเฉพาะเมื่อตั้ง NEXT_PUBLIC_STAFF_PIN) ----------
// หมายเหตุ: ค่า NEXT_PUBLIC_* ถูกฝังในโค้ดฝั่งเบราว์เซอร์ จึงเป็นเพียงด่านกันคนทั่วไป
// ไม่ใช่ความปลอดภัยจริง (ต้องใช้ Supabase Auth + RLS)
export default function StaffPage() {
  const [checked, setChecked] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === 'ok') setUnlocked(true);
    } catch {
      // sessionStorage ใช้ไม่ได้ -> ให้กรอก PIN ใหม่ทุกครั้ง
    }
    setChecked(true);
  }, []);

  function handleUnlock(e) {
    e.preventDefault();
    if (pin === STAFF_PIN) {
      try {
        sessionStorage.setItem(STORAGE_KEY, 'ok');
      } catch {
        // ไม่เป็นไร
      }
      setPinError('');
      setUnlocked(true);
    } else {
      setPinError('PIN ไม่ถูกต้อง');
    }
  }

  function handleLock() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ไม่เป็นไร
    }
    setPin('');
    setUnlocked(false);
  }

  // ไม่ได้ตั้ง PIN -> ไม่ล็อก (ทำงานเหมือนเดิม)
  if (!STAFF_PIN) return <StaffPanel onLock={null} />;

  if (!checked) return null;

  if (!unlocked) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <form
          onSubmit={handleUnlock}
          className="flex w-full max-w-sm flex-col gap-5 rounded-3xl bg-white p-6 shadow-sm"
        >
          <p className="text-center font-display text-2xl text-stone-900">
            SUSHI<span className="text-red-600">HANA</span>
          </p>
          <h1 className="text-center text-2xl font-bold text-stone-900">เข้าสู่ระบบพนักงาน</h1>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className={inputClass}
            placeholder="กรอก PIN"
            autoComplete="off"
          />
          {pinError && (
            <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-lg font-medium text-red-700">
              {pinError}
            </p>
          )}
          <button
            type="submit"
            className="rounded-2xl bg-red-600 px-6 py-4 text-2xl font-bold text-white shadow-md hover:bg-red-700"
          >
            เข้าสู่ระบบ
          </button>
        </form>
      </main>
    );
  }

  return <StaffPanel onLock={handleLock} />;
}

// ---------- หน้าพนักงาน: เปิดโต๊ะ + อนุมัติการเรียกเก็บเงิน ----------
function StaffPanel({ onLock }) {
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

  // ---------- Billing approval state ----------
  const [billing, setBilling] = useState([]); // sessions ที่รออนุมัติเรียกเก็บเงิน
  const [busySessionId, setBusySessionId] = useState(null);
  const [billingMsg, setBillingMsg] = useState(null); // { type: 'success' | 'error', text }
  const [soundOn, setSoundOn] = useState(false);
  const soundOnRef = useRef(false);
  const knownIdsRef = useRef(new Set());
  const initializedRef = useRef(false);

  function flashBilling(type, text) {
    setBillingMsg({ type, text });
    setTimeout(() => setBillingMsg(null), 3000);
  }

  function toggleSound() {
    const next = !soundOnRef.current;
    soundOnRef.current = next;
    setSoundOn(next);
    if (next) playBeep(); // ทดสอบเสียง + ปลดล็อกเสียงของเบราว์เซอร์
  }

  const loadBilling = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('sessions')
      .select('id, table_number, adult_count, child_count, status, created_at')
      .eq('status', 'billing')
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error(fetchError);
      return;
    }

    const list = data ?? [];
    const known = knownIdsRef.current;
    const hasNew = list.some((s) => !known.has(s.id));

    // มีคำขอใหม่เข้ามาหลังโหลดครั้งแรก -> เล่นเสียง (ถ้าเปิดเสียงไว้)
    if (initializedRef.current && hasNew && soundOnRef.current) playBeep();

    knownIdsRef.current = new Set(list.map((s) => s.id));
    initializedRef.current = true;
    setBilling(list);
  }, []);

  useEffect(() => {
    loadBilling();

    // Realtime (ถ้าเปิดให้ตาราง sessions) + polling ทุก 5 วินาทีเป็นตัวสำรอง
    const channel = supabase
      .channel('staff-sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () =>
        loadBilling()
      )
      .subscribe();
    const timer = setInterval(loadBilling, 5000);

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [loadBilling]);

  // ---------- Billing handlers ----------
  async function approveBill(session) {
    setBusySessionId(session.id);
    try {
      const { data, error: updateError } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', session.id)
        .eq('status', 'billing') // กันกดซ้ำ/สถานะเปลี่ยนไปแล้ว
        .select('id');

      if (updateError) throw updateError;
      if (!data || data.length === 0) {
        throw new Error('รายการนี้ถูกเปลี่ยนสถานะไปแล้ว');
      }

      setBilling((prev) => prev.filter((s) => s.id !== session.id));
      flashBilling('success', `อนุมัติโต๊ะ ${session.table_number} แล้ว — ปิดโต๊ะเรียบร้อย`);
    } catch (err) {
      console.error(err);
      flashBilling('error', err?.message ?? 'อนุมัติไม่สำเร็จ');
      loadBilling();
    } finally {
      setBusySessionId(null);
    }
  }

  async function rejectBill(session) {
    setBusySessionId(session.id);
    try {
      const { data, error: updateError } = await supabase
        .from('sessions')
        .update({ status: 'open' })
        .eq('id', session.id)
        .eq('status', 'billing')
        .select('id');

      if (updateError) throw updateError;
      if (!data || data.length === 0) {
        throw new Error('รายการนี้ถูกเปลี่ยนสถานะไปแล้ว');
      }

      setBilling((prev) => prev.filter((s) => s.id !== session.id));
      flashBilling('success', `ปฏิเสธโต๊ะ ${session.table_number} แล้ว — โต๊ะกลับไปสั่งอาหารต่อได้`);
    } catch (err) {
      console.error(err);
      flashBilling('error', err?.message ?? 'ปฏิเสธไม่สำเร็จ');
      loadBilling();
    } finally {
      setBusySessionId(null);
    }
  }

  // ---------- Open-table handlers ----------
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
      // 1) เช็คว่าโต๊ะนี้ยังมีลูกค้าอยู่หรือไม่ (open หรือรออนุมัติเก็บเงิน)
      const { data: openSessions, error: selectError } = await supabase
        .from('sessions')
        .select('id, table_number, adult_count, child_count, created_at')
        .eq('table_number', table)
        .in('status', ['open', 'billing'])
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
        .in('status', ['open', 'billing']); // เช็คซ้ำ กันกดซ้ำ/ชนกัน

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

  // ---------- ส่วนคำขอเรียกเก็บเงิน (ใช้ร่วมกันทั้งหน้าฟอร์มและหน้า QR) ----------
  const billingSection = (
    <section className="mb-6 w-full text-left">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-stone-900">
          คำขอเรียกเก็บเงิน
          <span
            className={`rounded-full px-3 py-0.5 text-base text-white ${
              billing.length > 0 ? 'animate-pulse bg-red-600' : 'bg-stone-400'
            }`}
          >
            {billing.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={toggleSound}
          className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold ${
            soundOn
              ? 'border-green-300 bg-green-50 text-green-800'
              : 'border-stone-300 bg-white text-stone-600'
          }`}
        >
          {soundOn ? '🔔 เสียง: เปิด' : '🔕 เสียง: ปิด'}
        </button>
      </div>

      {billingMsg && (
        <p
          className={`mb-3 rounded-2xl border p-3 text-lg font-medium ${
            billingMsg.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {billingMsg.text}
        </p>
      )}

      {billing.length === 0 ? (
        <p className="rounded-3xl bg-white p-5 text-lg text-stone-500 shadow-sm">
          ยังไม่มีโต๊ะที่รออนุมัติ
        </p>
      ) : (
        <ul className="space-y-3">
          {billing.map((s) => {
            const adults = Number(s.adult_count ?? 0);
            const children = Number(s.child_count ?? 0);
            const total = adults * ADULT_PRICE + children * CHILD_PRICE;
            const busy = busySessionId === s.id;

            return (
              <li key={s.id} className="rounded-3xl border-2 border-red-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base text-stone-500">โต๊ะ</p>
                    <p className="font-display text-5xl leading-none text-red-600">
                      {s.table_number}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base text-stone-600">
                      ผู้ใหญ่ {adults} × {ADULT_PRICE} + เด็ก {children} × {CHILD_PRICE}
                    </p>
                    <p className="font-display text-4xl text-stone-900">฿{formatBaht(total)}</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => rejectBill(s)}
                    disabled={busy}
                    className="flex-1 rounded-2xl bg-stone-100 py-3 text-lg font-semibold text-stone-700 disabled:opacity-60"
                  >
                    ปฏิเสธ
                  </button>
                  <button
                    type="button"
                    onClick={() => approveBill(s)}
                    disabled={busy}
                    className="flex-[2] rounded-2xl bg-red-600 py-3 text-xl font-bold text-white shadow-md active:scale-95 disabled:opacity-60"
                  >
                    {busy ? 'กำลังดำเนินการ...' : 'อนุมัติ (ปิดโต๊ะ)'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!STAFF_PIN && (
        <p className="mt-2 text-sm text-stone-400">
          หมายเหตุ: ยังไม่ได้ตั้ง PIN พนักงาน (NEXT_PUBLIC_STAFF_PIN) ใครเปิดหน้านี้ก็อนุมัติบิลได้
        </p>
      )}
    </section>
  );

  // ---------- Success UI ----------
  if (result) {
    const orderUrl = `${window.location.origin}/order/${encodeURIComponent(result.tableNumber)}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(orderUrl)}`;

    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-4 py-10 text-center">
        {billing.length > 0 && billingSection}

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
      {onLock && (
        <div className="mb-2 text-right">
          <button
            type="button"
            onClick={onLock}
            className="rounded-full border border-stone-300 bg-white px-4 py-1.5 text-sm font-semibold text-stone-600"
          >
            ออกจากระบบ
          </button>
        </div>
      )}

      <p className="mb-4 text-center font-display text-2xl text-stone-900">
        SUSHI<span className="text-red-600">HANA</span>
      </p>

      {billingSection}

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
