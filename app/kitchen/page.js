'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const ACTIVE_STATUSES = ['received', 'cooking'];

function sortByCreatedAt(list) {
  return [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  // ---------- Initial fetch: received / cooking เรียงเก่า -> ใหม่ ----------
  const fetchOrders = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('id, session_id, table_number, items, status, created_at')
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    setError('');
    setOrders(data ?? []);
  }, []);

  // ---------- Realtime: INSERT + UPDATE บนตาราง orders ----------
  useEffect(() => {
    fetchOrders();

    function handleChange(payload) {
      const row = payload.new;
      if (!row) return;
      setOrders((prev) => {
        const without = prev.filter((o) => o.id !== row.id);
        if (!ACTIVE_STATUSES.includes(row.status)) return without; // served/อื่นๆ -> เอาออก
        return sortByCreatedAt([...without, row]);
      });
    }

    const channel = supabase
      .channel('kitchen-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, handleChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, handleChange)
      .subscribe((status) => {
        const ok = status === 'SUBSCRIBED';
        setConnected(ok);
        if (ok) fetchOrders(); // กันพลาดออเดอร์ที่เข้ามาช่วงที่หลุดการเชื่อมต่อ
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  // อัปเดต "รอมากี่นาที" ทุก 30 วินาที
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // ---------- Update logic ----------
  async function startCooking(id) {
    setBusyId(id);
    try {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'cooking' })
        .eq('id', id)
        .eq('status', 'received');

      if (updateError) throw updateError;
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: 'cooking' } : o)));
    } catch (err) {
      console.error(err);
      setError(`อัปเดตไม่สำเร็จ: ${err?.message ?? 'ไม่ทราบสาเหตุ'}`);
    } finally {
      setBusyId(null);
    }
  }

  async function markServed(id) {
    setBusyId(id);
    try {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'served' })
        .eq('id', id);

      if (updateError) throw updateError;
      setOrders((prev) => prev.filter((o) => o.id !== id)); // การ์ดหายไป
    } catch (err) {
      console.error(err);
      setError(`อัปเดตไม่สำเร็จ: ${err?.message ?? 'ไม่ทราบสาเหตุ'}`);
    } finally {
      setBusyId(null);
    }
  }

  // ---------- UI ----------
  return (
    <main className="min-h-screen p-4 md:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#e32929] px-6 py-5 text-white shadow-md">
        <div>
          <p className="text-lg text-white/80">Kitchen Display · หน้าจอครัว</p>
          <h1 className="font-display text-4xl">SUSHIHANA</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xl font-semibold">
          <span className="rounded-full bg-white px-5 py-2 text-red-600">
            ออเดอร์ค้าง {orders.length}
          </span>
          <span
            className={`rounded-full px-5 py-2 ${
              connected ? 'bg-green-100 text-green-800' : 'bg-yellow-300 text-red-800'
            }`}
          >
            {connected ? '● เชื่อมต่อแล้ว' : '● ขาดการเชื่อมต่อ'}
          </span>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-xl font-semibold text-red-700">
          {error}
        </p>
      )}

      {orders.length === 0 && !error && (
        <p className="py-24 text-center text-3xl text-stone-400">ยังไม่มีออเดอร์ที่รอทำ</p>
      )}

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-3 2xl:grid-cols-4">
        {orders.map((order) => {
          const isCooking = order.status === 'cooking';
          const created = new Date(order.created_at);
          const minutes = Math.max(0, Math.floor((now - created.getTime()) / 60000));
          const timeText = created.toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
          });
          const lines = Array.isArray(order.items) ? order.items : [];

          return (
            <article
              key={order.id}
              className={`flex flex-col rounded-3xl border-2 p-5 shadow-md ${
                isCooking ? 'border-yellow-400 bg-yellow-100' : 'border-stone-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-medium text-stone-500">โต๊ะ</p>
                  <p className="font-display text-7xl leading-none text-red-600">
                    {order.table_number}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-stone-900">{timeText}</p>
                  <p className="text-xl text-stone-600">รอมา {minutes} นาที</p>
                  <span
                    className={`mt-2 inline-block rounded-full px-4 py-1 text-lg font-bold ${
                      isCooking ? 'bg-yellow-400 text-stone-900' : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    {isCooking ? 'กำลังทำ' : 'รอทำ'}
                  </span>
                </div>
              </div>

              <ul className="my-5 flex-1 space-y-2 border-t border-stone-200/80 pt-4 text-2xl font-semibold text-stone-900">
                {lines.map((line, i) => (
                  <li key={`${line.id ?? i}-${i}`} className="flex justify-between gap-3">
                    <span>{line.name}</span>
                    <span className="font-bold text-red-600">× {line.quantity ?? line.qty ?? 1}</span>
                  </li>
                ))}
              </ul>

              {isCooking ? (
                <button
                  type="button"
                  onClick={() => markServed(order.id)}
                  disabled={busyId === order.id}
                  className="rounded-2xl bg-green-600 py-4 text-2xl font-bold text-white hover:bg-green-700 disabled:opacity-60"
                >
                  จัดเสิร์ฟแล้ว
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => startCooking(order.id)}
                  disabled={busyId === order.id}
                  className="rounded-2xl bg-red-600 py-4 text-2xl font-bold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  เริ่มทำ
                </button>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
