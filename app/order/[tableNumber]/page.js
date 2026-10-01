'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const ADULT_PRICE = 289;
const CHILD_PRICE = 145;
const MAX_QTY_PER_ITEM = 5; // เลือกจำนวนได้ 1-5 ต่อเมนู
const MAX_LINES_PER_ORDER = 10; // ไม่เกิน 10 รายการ (เมนูไม่ซ้ำกัน) ต่อการส่ง 1 ครั้ง

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatBaht(n) {
  return Number(n).toLocaleString('th-TH');
}

function FullScreenMessage({ title, text, tone = 'default' }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1
        className={`font-display text-3xl leading-snug ${
          tone === 'red' ? 'text-red-600' : 'text-stone-900'
        }`}
      >
        {title}
      </h1>
      {text && <p className="max-w-sm text-xl text-stone-600">{text}</p>}
    </main>
  );
}

function ThankYou() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="rounded-full border border-red-300 bg-white px-4 py-1 text-sm font-medium text-red-600">
        寿司花 · SushiHana
      </span>
      <h1 className="font-display text-5xl leading-tight text-stone-900">
        ขอบคุณ
        <br />
        <span className="text-red-600">ที่ใช้บริการ</span>
      </h1>
      <p className="max-w-xs text-xl leading-relaxed text-stone-600">
        หวังว่าคุณจะอิ่มอร่อยกับอาหารของเรา แล้วพบกันใหม่ในโอกาสหน้า 🍣
      </p>
    </main>
  );
}

function QtyStepper({ qty, onMinus, onPlus, className = '' }) {
  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={onPlus}
        aria-label="เพิ่มลงตะกร้า"
        className={`rounded-full border border-stone-300 bg-white py-2 text-base font-medium text-stone-800 active:scale-95 ${className}`}
      >
        + เพิ่ม
      </button>
    );
  }
  return (
    <div className={`flex items-center justify-between rounded-full bg-[#f8f5f0] p-1 ${className}`}>
      <button
        type="button"
        onClick={onMinus}
        aria-label="ลดจำนวน"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-2xl leading-none text-stone-700 shadow-sm active:scale-95"
      >
        −
      </button>
      <span className="text-xl font-semibold text-stone-900">{qty}</span>
      <button
        type="button"
        onClick={onPlus}
        aria-label="เพิ่มจำนวน"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-2xl leading-none text-stone-700 shadow-sm active:scale-95"
      >
        +
      </button>
    </div>
  );
}

export default function OrderPage({ params }) {
  // params เป็น Promise ใน Next.js เวอร์ชันล่าสุด ต้อง unwrap ด้วย use() เสมอ
  const { tableNumber: rawTableNumber } = use(params);
  const tableNumber = safeDecode(rawTableNumber);

  // phase: loading | not_open | error | ready | finished
  const [phase, setPhase] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const [session, setSession] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  const [cart, setCart] = useState({}); // { [menuItemId]: quantity }
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }

  const [showBill, setShowBill] = useState(false);
  const [billing, setBilling] = useState(false);

  // ---------- Fetch: session (open) + หมวดหมู่ + เมนู ----------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: sessions, error: sessionError } = await supabase
          .from('sessions')
          .select('id, table_number, adult_count, child_count, status, created_at')
          .eq('table_number', tableNumber)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(1);

        if (sessionError) throw sessionError;
        if (cancelled) return;

        if (!sessions || sessions.length === 0) {
          setPhase('not_open');
          return;
        }

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
        if (cancelled) return;

        setSession(sessions[0]);
        setCategories(catRes.data ?? []);
        setItems(itemRes.data ?? []);
        setActiveCategoryId(catRes.data?.[0]?.id ?? null);
        setPhase('ready');
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setErrorMsg(err?.message ?? 'ไม่ทราบสาเหตุ');
          setPhase('error');
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tableNumber]);

  // ---------- Derived data ----------
  const itemsById = useMemo(() => {
    const map = {};
    for (const it of items) map[it.id] = it;
    return map;
  }, [items]);

  const visibleItems = useMemo(
    () => items.filter((it) => it.category_id === activeCategoryId),
    [items, activeCategoryId]
  );

  const cartEntries = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => {
          const item = itemsById[id];
          return item ? { id: item.id, name: item.name, quantity } : null;
        })
        .filter(Boolean),
    [cart, itemsById]
  );

  const totalQty = cartEntries.reduce((sum, e) => sum + e.quantity, 0);

  // ---------- Cart logic ----------
  function flash(type, text) {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 2500);
  }

  function changeQty(item, delta) {
    const current = cart[item.id] ?? 0;
    const next = current + delta;

    if (next < 0) return;
    if (delta > 0 && current === 0 && Object.keys(cart).length >= MAX_LINES_PER_ORDER) {
      flash('error', `สั่งได้ไม่เกิน ${MAX_LINES_PER_ORDER} รายการต่อครั้ง`);
      return;
    }
    if (next > MAX_QTY_PER_ITEM) {
      flash('error', `สั่งได้สูงสุด ${MAX_QTY_PER_ITEM} ชิ้นต่อเมนู`);
      return;
    }

    setCart((prev) => {
      const copy = { ...prev };
      if (next === 0) delete copy[item.id];
      else copy[item.id] = next;
      return copy;
    });
  }

  // ---------- Submit order ----------
  async function submitOrder() {
    if (cartEntries.length === 0 || submitting || !session) return;
    setSubmitting(true);

    try {
      const { error } = await supabase.from('orders').insert({
        session_id: session.id,
        table_number: session.table_number,
        items: cartEntries, // [{ id, name, quantity }] -> jsonb
        status: 'received',
      });
      if (error) throw error;

      setCart({});
      setCartOpen(false);
      flash('success', 'ส่งออเดอร์แล้ว ✓');
    } catch (err) {
      console.error(err);
      flash('error', `ส่งออเดอร์ไม่สำเร็จ: ${err?.message ?? 'ไม่ทราบสาเหตุ'}`);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- Billing ----------
  const adultCount = Number(session?.adult_count ?? 0);
  const childCount = Number(session?.child_count ?? 0);
  const adultTotal = adultCount * ADULT_PRICE;
  const childTotal = childCount * CHILD_PRICE;
  const grandTotal = adultTotal + childTotal;

  async function confirmBill() {
    if (!session || billing) return;
    setBilling(true);

    try {
      const { data, error } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', session.id)
        .eq('status', 'open')
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('ปิดโต๊ะไม่สำเร็จ (โต๊ะอาจถูกปิดไปแล้ว) กรุณาแจ้งพนักงาน');
      }

      setShowBill(false);
      setCartOpen(false);
      setCart({});
      setPhase('finished');
    } catch (err) {
      console.error(err);
      setShowBill(false);
      flash('error', err?.message ?? 'เรียกเก็บเงินไม่สำเร็จ');
    } finally {
      setBilling(false);
    }
  }

  // ---------- Full-screen states ----------
  if (phase === 'loading') {
    return <FullScreenMessage title="กำลังโหลดเมนู..." />;
  }
  if (phase === 'not_open') {
    return <FullScreenMessage title="โต๊ะนี้ยังไม่เปิดใช้งาน กรุณาแจ้งพนักงาน" tone="red" />;
  }
  if (phase === 'error') {
    return (
      <FullScreenMessage
        title="เกิดข้อผิดพลาด"
        text={`${errorMsg} — กรุณาแจ้งพนักงาน`}
        tone="red"
      />
    );
  }
  if (phase === 'finished') {
    return <ThankYou />;
  }

  const activeCategory = categories.find((c) => c.id === activeCategoryId);

  // ---------- Main UI ----------
  return (
    <div className="min-h-screen pb-40">
      {/* Top bar */}
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 pt-5">
        <p className="font-display text-2xl text-stone-900">
          SUSHI<span className="text-red-600">HANA</span>
        </p>
        <button
          type="button"
          onClick={() => setShowBill(true)}
          className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-base font-semibold text-stone-800 shadow-sm active:scale-95"
        >
          เรียกเก็บเงิน
        </button>
      </header>

      {/* Hero */}
      <section className="mx-auto mt-4 max-w-3xl px-4">
        <div className="rounded-3xl bg-[#e32929] px-6 py-6 text-white shadow-md">
          <span className="inline-block rounded-full border border-white/70 px-3 py-1 text-sm">
            โต๊ะ {session.table_number} · ผู้ใหญ่ {adultCount} · เด็ก {childCount}
          </span>
          <h1 className="mt-3 font-display text-3xl leading-tight">
            เลือกเมนูที่ชอบ
            <br />
            สั่งได้เลย
          </h1>
          <p className="mt-3 text-lg">
            บุฟเฟต์ผู้ใหญ่ <span className="text-2xl font-bold">฿{ADULT_PRICE}</span>
            <span className="mx-2 opacity-70">/</span>
            เด็ก <span className="text-2xl font-bold">฿{CHILD_PRICE}</span>
          </p>
        </div>
      </section>

      {/* Category tabs */}
      <div className="sticky top-0 z-20 mt-4 bg-[#f8f5f0]/95 backdrop-blur">
        <nav className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-3">
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
      </div>

      {/* Toast */}
      {notice && (
        <div
          className={`fixed left-1/2 top-4 z-50 w-[90%] max-w-sm -translate-x-1/2 rounded-2xl px-4 py-3 text-center text-lg font-semibold text-white shadow-lg ${
            notice.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Menu grid */}
      <main className="mx-auto max-w-3xl px-4 pt-1">
        {visibleItems.length === 0 && (
          <p className="py-10 text-center text-xl text-stone-500">ยังไม่มีเมนูในหมวดนี้</p>
        )}
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {visibleItems.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm"
            >
              <div>
                <p className="text-xs font-semibold text-red-600">{activeCategory?.name}</p>
                <h3 className="mt-1 text-lg font-semibold leading-snug text-stone-900">
                  {item.name}
                </h3>
              </div>
              <span className="w-fit rounded-full bg-[#f8f5f0] px-2.5 py-1 text-xs font-medium text-stone-600">
                รวมในบุฟเฟต์
              </span>
              <QtyStepper
                className="mt-auto w-full"
                qty={cart[item.id] ?? 0}
                onMinus={() => changeQty(item, -1)}
                onPlus={() => changeQty(item, 1)}
              />
            </li>
          ))}
        </ul>
      </main>

      {/* Floating cart bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3">
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-3 shadow-lg ring-1 ring-stone-200">
          {cartEntries.length === 0 ? (
            <p className="py-2 text-center text-base text-stone-500">
              แตะ “เพิ่ม” เพื่อเลือกเมนู
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="flex-1 rounded-2xl bg-[#f8f5f0] px-4 py-3 text-left text-base font-semibold text-stone-800"
              >
                🛒 {cartEntries.length} รายการ · {totalQty} ชิ้น
              </button>
              <button
                type="button"
                onClick={submitOrder}
                disabled={submitting}
                className="rounded-2xl bg-red-600 px-8 py-4 text-xl font-bold text-white shadow-md active:scale-95 disabled:opacity-60"
              >
                {submitting ? 'กำลังส่ง...' : 'สั่งอาหาร'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cart popup */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/40 p-3 sm:items-center sm:justify-center"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl text-stone-900">ตะกร้าของคุณ</h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="rounded-full bg-stone-100 px-4 py-1.5 text-base font-semibold text-stone-600"
              >
                ปิด
              </button>
            </div>

            <ul className="divide-y divide-stone-100">
              {cartEntries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="text-lg font-medium text-stone-900">{entry.name}</span>
                  <QtyStepper
                    className="w-32 shrink-0"
                    qty={entry.quantity}
                    onMinus={() => changeQty(itemsById[entry.id], -1)}
                    onPlus={() => changeQty(itemsById[entry.id], 1)}
                  />
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={submitOrder}
              disabled={submitting || cartEntries.length === 0}
              className="mt-6 w-full rounded-2xl bg-red-600 py-4 text-2xl font-bold text-white shadow-md active:scale-95 disabled:opacity-60"
            >
              {submitting ? 'กำลังส่ง...' : 'สั่งอาหาร'}
            </button>
          </div>
        </div>
      )}

      {/* Bill popup */}
      {showBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            <h2 className="font-display text-2xl text-stone-900">เรียกเก็บเงิน</h2>

            <ul className="mt-4 space-y-2 text-lg text-stone-700">
              <li className="flex justify-between">
                <span>
                  ผู้ใหญ่ {adultCount} × {ADULT_PRICE}
                </span>
                <span className="font-semibold">฿{formatBaht(adultTotal)}</span>
              </li>
              <li className="flex justify-between">
                <span>
                  เด็ก {childCount} × {CHILD_PRICE}
                </span>
                <span className="font-semibold">฿{formatBaht(childTotal)}</span>
              </li>
            </ul>

            <div className="my-4 flex items-end justify-between border-t border-stone-200 pt-4">
              <span className="text-lg font-semibold text-stone-700">ยอดรวม</span>
              <span className="font-display text-4xl text-red-600">฿{formatBaht(grandTotal)}</span>
            </div>

            {cartEntries.length > 0 && (
              <p className="mb-4 rounded-2xl bg-orange-50 p-3 text-base text-orange-800">
                ⚠️ มีรายการในตะกร้าที่ยังไม่ได้ส่ง หากเรียกเก็บเงินจะไม่สามารถสั่งต่อได้
              </p>
            )}

            <button
              type="button"
              onClick={confirmBill}
              disabled={billing}
              className="w-full rounded-2xl bg-red-600 py-4 text-2xl font-bold text-white shadow-md active:scale-95 disabled:opacity-60"
            >
              {billing ? 'กำลังดำเนินการ...' : 'ยืนยันชำระเงิน'}
            </button>
            <button
              type="button"
              onClick={() => setShowBill(false)}
              disabled={billing}
              className="mt-3 w-full rounded-2xl bg-stone-100 py-3 text-lg font-semibold text-stone-700 disabled:opacity-60"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
