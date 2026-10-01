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

function FullScreenMessage({ title, text, tone = 'gray' }) {
  const color = tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : 'text-gray-800';
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-amber-50 px-6 text-center">
      <h1 className={`text-3xl font-bold ${color}`}>{title}</h1>
      {text && <p className="text-xl text-gray-600">{text}</p>}
    </main>
  );
}

function QtyStepper({ qty, onMinus, onPlus }) {
  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={onPlus}
        aria-label="เพิ่มลงตะกร้า"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-3xl font-bold leading-none text-white active:scale-95"
      >
        +
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onMinus}
        aria-label="ลดจำนวน"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-3xl font-bold leading-none text-gray-800 active:scale-95"
      >
        −
      </button>
      <span className="w-8 text-center text-2xl font-bold">{qty}</span>
      <button
        type="button"
        onClick={onPlus}
        aria-label="เพิ่มจำนวน"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-3xl font-bold leading-none text-white active:scale-95"
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
    return <FullScreenMessage title="ขอบคุณที่ใช้บริการ 🙏" text="SushiHana ยินดีต้อนรับอีกครั้ง" tone="green" />;
  }

  // ---------- Main UI ----------
  return (
    <div className="min-h-screen bg-amber-50 pb-32">
      {/* Header + Tabs */}
      <header className="sticky top-0 z-20 bg-white shadow">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-gray-500">SushiHana</p>
            <h1 className="text-2xl font-bold">โต๊ะ {session.table_number}</h1>
          </div>
          <button
            type="button"
            onClick={() => setShowBill(true)}
            className="rounded-full bg-red-600 px-5 py-3 text-lg font-semibold text-white active:scale-95"
          >
            เรียกเก็บเงิน
          </button>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-3 pb-3">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategoryId(cat.id)}
              className={`shrink-0 rounded-full px-5 py-2 text-lg font-semibold ${
                cat.id === activeCategoryId
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </nav>
      </header>

      {/* Toast */}
      {notice && (
        <div
          className={`fixed left-1/2 top-28 z-50 w-[90%] max-w-sm -translate-x-1/2 rounded-xl px-4 py-3 text-center text-lg font-semibold text-white shadow-lg ${
            notice.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Menu list */}
      <main className="mx-auto max-w-xl px-4 py-4">
        {visibleItems.length === 0 && (
          <p className="py-10 text-center text-xl text-gray-500">ยังไม่มีเมนูในหมวดนี้</p>
        )}
        <ul className="space-y-3">
          {visibleItems.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm"
            >
              <span className="text-xl font-medium">{item.name}</span>
              <QtyStepper
                qty={cart[item.id] ?? 0}
                onMinus={() => changeQty(item, -1)}
                onPlus={() => changeQty(item, 1)}
              />
            </li>
          ))}
        </ul>
      </main>

      {/* Floating cart bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        {cartEntries.length === 0 ? (
          <p className="py-3 text-center text-lg text-gray-500">แตะ + เพื่อเลือกเมนู</p>
        ) : (
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="flex-1 rounded-xl bg-gray-100 px-4 py-3 text-left text-lg font-semibold"
            >
              🛒 {cartEntries.length} รายการ ({totalQty} ชิ้น)
            </button>
            <button
              type="button"
              onClick={submitOrder}
              disabled={submitting}
              className="rounded-xl bg-green-600 px-6 py-3 text-xl font-bold text-white disabled:opacity-60"
            >
              {submitting ? 'กำลังส่ง...' : 'ส่งออเดอร์'}
            </button>
          </div>
        )}
      </div>

      {/* Cart sheet */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/50" onClick={() => setCartOpen(false)}>
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">ตะกร้าของคุณ</h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="text-lg font-semibold text-gray-500"
              >
                ปิด
              </button>
            </div>

            <ul className="space-y-3">
              {cartEntries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3">
                  <span className="text-xl">{entry.name}</span>
                  <QtyStepper
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
              className="mt-6 w-full rounded-xl bg-green-600 py-4 text-2xl font-bold text-white disabled:opacity-60"
            >
              {submitting ? 'กำลังส่ง...' : 'ส่งออเดอร์'}
            </button>
          </div>
        </div>
      )}

      {/* Bill confirm dialog */}
      {showBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-2xl font-bold">ยืนยันเรียกเก็บเงิน?</h2>

            <ul className="mb-4 space-y-2 text-xl">
              <li className="flex justify-between">
                <span>ผู้ใหญ่ {adultCount} × {ADULT_PRICE}</span>
                <span>{formatBaht(adultTotal)}</span>
              </li>
              <li className="flex justify-between">
                <span>เด็ก {childCount} × {CHILD_PRICE}</span>
                <span>{formatBaht(childTotal)}</span>
              </li>
            </ul>

            <p className="mb-4 flex justify-between border-t pt-3 text-3xl font-bold text-red-700">
              <span>ยอดรวม</span>
              <span>{formatBaht(grandTotal)} บาท</span>
            </p>

            {cartEntries.length > 0 && (
              <p className="mb-4 rounded-lg bg-orange-100 p-3 text-base text-orange-800">
                ⚠️ มีรายการในตะกร้าที่ยังไม่ได้ส่ง หากเรียกเก็บเงินจะไม่สามารถสั่งต่อได้
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowBill(false)}
                disabled={billing}
                className="flex-1 rounded-xl bg-gray-200 py-3 text-xl font-semibold disabled:opacity-60"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmBill}
                disabled={billing}
                className="flex-1 rounded-xl bg-red-600 py-3 text-xl font-semibold text-white disabled:opacity-60"
              >
                {billing ? 'กำลังดำเนินการ...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
