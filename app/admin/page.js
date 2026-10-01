'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const ADULT_PRICE = 289;
const CHILD_PRICE = 145;
const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN;
const STORAGE_KEY = 'sushihana_admin_unlocked';

function formatBaht(n) {
  return Number(n).toLocaleString('th-TH');
}

const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-xl text-stone-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-200';

// ---------- ด่านที่ 1: PIN ----------
// หมายเหตุ: NEXT_PUBLIC_ADMIN_PIN ถูกฝังในโค้ดฝั่งเบราว์เซอร์ จึงเป็นเพียงด่านกันคนทั่วไปเข้าผิดหน้า
// ไม่ใช่ระบบความปลอดภัยจริง (ถ้าต้องการความปลอดภัยจริงให้ใช้ Supabase Auth + RLS)
export default function AdminPage() {
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
    if (pin === ADMIN_PIN) {
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

  if (!ADMIN_PIN) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm">
          <h1 className="font-display text-2xl text-stone-900">ยังไม่ได้ตั้งค่า PIN แอดมิน</h1>
          <p className="mt-3 text-lg leading-relaxed text-stone-600">
            เพิ่มตัวแปร <code className="rounded bg-stone-100 px-1">NEXT_PUBLIC_ADMIN_PIN</code> ใน{' '}
            <code className="rounded bg-stone-100 px-1">.env.local</code> และใน Vercel (Environment
            Variables) แล้ว Redeploy จากนั้นรีเฟรชหน้านี้
          </p>
        </div>
      </main>
    );
  }

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
          <h1 className="text-center text-2xl font-bold text-stone-900">เข้าสู่ระบบแอดมิน</h1>
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

  return <AdminPanel onLock={handleLock} />;
}

// ---------- ส่วนจัดการหลัก ----------
function AdminPanel({ onLock }) {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [billing, setBilling] = useState([]); // sessions ที่รออนุมัติเรียกเก็บเงิน
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }

  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [busySessionId, setBusySessionId] = useState(null);

  function flash(type, text) {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 2500);
  }

  // ---------- Fetch ----------
  const loadMenu = useCallback(async () => {
    try {
      const [catRes, itemRes] = await Promise.all([
        supabase
          .from('menu_categories')
          .select('id, name, sort_order')
          .order('sort_order', { ascending: true }),
        supabase
          .from('menu_items')
          .select('id, category_id, name')
          .order('id', { ascending: true }),
      ]);
      if (catRes.error) throw catRes.error;
      if (itemRes.error) throw itemRes.error;

      setCategories(catRes.data ?? []);
      setItems(itemRes.data ?? []);
      setActiveCategoryId((prev) => prev ?? catRes.data?.[0]?.id ?? null);
      setError('');
    } catch (err) {
      console.error(err);
      setError(`โหลดเมนูไม่สำเร็จ: ${err?.message ?? 'ไม่ทราบสาเหตุ'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBilling = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('sessions')
      .select('id, table_number, adult_count, child_count, status, created_at')
      .eq('status', 'billing')
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error(fetchError);
      setError(`โหลดคำขอเรียกเก็บเงินไม่สำเร็จ: ${fetchError.message}`);
      return;
    }
    setBilling(data ?? []);
  }, []);

  useEffect(() => {
    loadMenu();
    loadBilling();

    // Realtime (ถ้าเปิดให้ตาราง sessions) + polling ทุก 5 วินาทีเป็นตัวสำรอง
    const channel = supabase
      .channel('admin-sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () =>
        loadBilling()
      )
      .subscribe();
    const timer = setInterval(loadBilling, 5000);

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [loadMenu, loadBilling]);

  const visibleItems = useMemo(
    () => items.filter((it) => it.category_id === activeCategoryId),
    [items, activeCategoryId]
  );
  const activeCategory = categories.find((c) => c.id === activeCategoryId);

  // ---------- เพิ่มเมนู ----------
  async function handleAdd(e) {
    e.preventDefault();
    const name = newName.trim();

    if (activeCategoryId == null) {
      flash('error', 'ยังไม่มีหมวดหมู่ให้เพิ่มเมนู');
      return;
    }
    if (!name) {
      flash('error', 'กรุณากรอกชื่อเมนู');
      return;
    }
    if (items.some((it) => it.category_id === activeCategoryId && it.name === name)) {
      flash('error', 'มีเมนูนี้ในหมวดนี้แล้ว');
      return;
    }

    setAdding(true);
    try {
      const { data, error: insertError } = await supabase
        .from('menu_items')
        .insert({ category_id: activeCategoryId, name })
        .select('id, category_id, name');

      if (insertError) throw insertError;
      if (!data || data.length === 0) {
        throw new Error('เพิ่มเมนูไม่สำเร็จ (อาจไม่มีสิทธิ์เขียนข้อมูล)');
      }

      setItems((prev) => [...prev, ...data]);
      setNewName('');
      flash('success', `เพิ่ม "${name}" แล้ว ✓`);
    } catch (err) {
      console.error(err);
      flash('error', `เพิ่มเมนูไม่สำเร็จ: ${err?.message ?? 'ไม่ทราบสาเหตุ'}`);
    } finally {
      setAdding(false);
    }
  }

  // ---------- ลบเมนู ----------
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error: deleteError } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', deleteTarget.id)
        .select('id');

      if (deleteError) throw deleteError;
      if (!data || data.length === 0) {
        throw new Error('ลบไม่สำเร็จ (อาจไม่มีสิทธิ์ลบข้อมูล)');
      }

      setItems((prev) => prev.filter((it) => it.id !== deleteTarget.id));
      flash('success', `ลบ "${deleteTarget.name}" แล้ว`);
    } catch (err) {
      console.error(err);
      flash('error', `ลบเมนูไม่สำเร็จ: ${err?.message ?? 'ไม่ทราบสาเหตุ'}`);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  // ---------- อนุมัติ / ปฏิเสธการเรียกเก็บเงิน ----------
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
      flash('success', `อนุมัติโต๊ะ ${session.table_number} แล้ว — ปิดโต๊ะเรียบร้อย`);
    } catch (err) {
      console.error(err);
      flash('error', err?.message ?? 'อนุมัติไม่สำเร็จ');
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
      flash('success', `ปฏิเสธโต๊ะ ${session.table_number} แล้ว — โต๊ะกลับไปสั่งอาหารต่อได้`);
    } catch (err) {
      console.error(err);
      flash('error', err?.message ?? 'ปฏิเสธไม่สำเร็จ');
      loadBilling();
    } finally {
      setBusySessionId(null);
    }
  }

  // ---------- UI ----------
  const toast = notice ? (
    <div
      className={`fixed left-1/2 top-4 z-50 w-[90%] max-w-sm -translate-x-1/2 rounded-2xl px-4 py-3 text-center text-lg font-semibold text-white shadow-lg ${
        notice.type === 'success' ? 'bg-green-600' : 'bg-red-600'
      }`}
    >
      {notice.text}
    </div>
  ) : null;

  return (
    <main className="min-h-screen px-4 pb-16 pt-5">
      {toast}

      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between gap-3 rounded-3xl bg-[#e32929] px-6 py-5 text-white shadow-md">
          <div>
            <p className="text-base text-white/80">Admin · แอดมิน</p>
            <h1 className="font-display text-3xl">SUSHIHANA</h1>
          </div>
          <button
            type="button"
            onClick={onLock}
            className="rounded-full border border-white/70 px-4 py-2 text-base font-semibold text-white"
          >
            ออกจากระบบ
          </button>
        </header>

        {error && (
          <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-lg font-semibold text-red-700">
            {error}
          </p>
        )}

        {/* ---------- คำขอเรียกเก็บเงิน ---------- */}
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold text-stone-900">
            คำขอเรียกเก็บเงิน
            <span className="rounded-full bg-red-600 px-3 py-0.5 text-base text-white">
              {billing.length}
            </span>
          </h2>

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
                  <li
                    key={s.id}
                    className="rounded-3xl border-2 border-red-200 bg-white p-5 shadow-sm"
                  >
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
        </section>

        {/* ---------- จัดการเมนู ---------- */}
        <section>
          <h2 className="mb-3 text-2xl font-bold text-stone-900">จัดการเมนูอาหาร</h2>

          {loading ? (
            <p className="py-10 text-center text-xl text-stone-500">กำลังโหลด...</p>
          ) : (
            <>
              <nav className="mb-4 flex gap-2 overflow-x-auto pb-1">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategoryId(cat.id)}
                    className={`shrink-0 rounded-full px-5 py-2.5 text-lg font-semibold transition ${
                      cat.id === activeCategoryId
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'border border-stone-200 bg-white text-stone-700'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </nav>

              {/* ฟอร์มเพิ่มเมนู */}
              <form
                onSubmit={handleAdd}
                className="mb-4 rounded-3xl bg-white p-5 shadow-sm"
              >
                <label className="flex flex-col gap-2 text-lg font-medium text-stone-700">
                  เพิ่มเมนูใหม่ในหมวด “{activeCategory?.name ?? '-'}”
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className={inputClass}
                    placeholder="เช่น ซูชิหอยเชลล์"
                    autoComplete="off"
                  />
                </label>
                <button
                  type="submit"
                  disabled={adding}
                  className="mt-4 w-full rounded-2xl bg-red-600 py-3 text-xl font-bold text-white shadow-md transition hover:bg-red-700 disabled:opacity-60"
                >
                  {adding ? 'กำลังเพิ่ม...' : 'เพิ่มเมนู'}
                </button>
              </form>

              {/* รายการเมนู */}
              {visibleItems.length === 0 ? (
                <p className="rounded-3xl bg-white p-5 text-lg text-stone-500 shadow-sm">
                  ยังไม่มีเมนูในหมวดนี้
                </p>
              ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {visibleItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm"
                    >
                      <span className="text-lg font-semibold text-stone-900">{item.name}</span>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="shrink-0 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-base font-semibold text-red-700 active:scale-95"
                      >
                        ลบ
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      {/* Delete confirm popup */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            <h2 className="font-display text-2xl text-stone-900">ลบเมนูนี้?</h2>
            <p className="mt-4 rounded-2xl bg-[#f8f5f0] p-4 text-xl font-semibold text-stone-900">
              {deleteTarget.name}
            </p>
            <p className="mt-3 text-base text-stone-500">
              ลูกค้าจะไม่เห็นเมนูนี้อีก (ออเดอร์เก่าที่สั่งไปแล้วไม่ได้รับผลกระทบ)
            </p>

            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="mt-5 w-full rounded-2xl bg-red-600 py-4 text-2xl font-bold text-white shadow-md active:scale-95 disabled:opacity-60"
            >
              {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="mt-3 w-full rounded-2xl bg-stone-100 py-3 text-lg font-semibold text-stone-700 disabled:opacity-60"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
