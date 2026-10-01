# SushiHana — QR Ordering POS

ระบบสั่งอาหารผ่าน QR Code สำหรับร้านอาหารญี่ปุ่น "SushiHana"
Stack: Next.js (App Router, **JavaScript ไม่ใช้ TypeScript**) + Supabase, deploy บน Vercel

## กฎสำคัญ: Next.js เวอร์ชันล่าสุด — `params` ของ Dynamic Route เป็น Promise

โปรเจกต์นี้ใช้ Next.js เวอร์ชันล่าสุด ซึ่ง `params` ใน Dynamic Route (เช่น `app/order/[tableNumber]/page.js`)
**เป็น Promise** ต้อง unwrap ด้วย `use()` จาก React เสมอ

```js
'use client';
import { use } from 'react';

export default function OrderPage({ params }) {
  const { tableNumber } = use(params); // ห้ามอ่าน params.tableNumber ตรงๆ
  // ...
}
```

- ห้ามเขียน `params.tableNumber` ตรงๆ
- ถ้าเป็น Server Component (ไม่มี `'use client'`) ให้ใช้ `async` + `await params` แทน

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

เก็บใน `.env.local` (ห้าม commit) และตั้งค่าเดียวกันใน Vercel Project Settings
Supabase client อยู่ที่ `lib/supabaseClient.js` (ใช้ path สัมพัทธ์ เช่น `import { supabase } from '../../lib/supabaseClient'` เพราะไม่มี jsconfig.json จึงใช้ alias `@/` ไม่ได้)

## โครงสร้างฐานข้อมูล (มีอยู่แล้วใน Supabase — ไม่ต้องสร้างใหม่)

| ตาราง | คอลัมน์ |
|---|---|
| `sessions` | `id`, `table_number`, `adult_count`, `child_count`, `status`, `created_at` |
| `menu_categories` | `id`, `name`, `sort_order` |
| `menu_items` | `id`, `category_id` (FK → menu_categories.id), `name` |
| `orders` | `id`, `session_id` (FK → sessions.id), `table_number`, `items` (jsonb), `status`, `created_at` |

อ้างอิงชื่อตารางและคอลัมน์ตามนี้เท่านั้น ห้ามเดาคอลัมน์เพิ่มเอง

## หน้าที่วางแผนไว้

- `/` — หน้าแรก (ทดสอบ deploy)
- `/generate-qr` — สร้าง QR Code ประจำโต๊ะ
- `/kitchen` — หน้าจอครัว
- `/order/[tableNumber]` — หน้าสั่งอาหารของลูกค้า (Dynamic Route — ดูกฎ `params` ด้านบน)

## ค่า status ที่ใช้ในโปรเจกต์

- `sessions.status`: `open` (เปิดโต๊ะอยู่) → `closed` (เรียกเก็บเงินแล้ว)
- `orders.status`: `received` (รอทำ) → `cooking` (กำลังทำ) → `served` (เสิร์ฟแล้ว)
- ราคาบุฟเฟต์: ผู้ใหญ่ 289 บาท / เด็ก 145 บาท (คำนวณจาก `adult_count`, `child_count` ใน session)
- `orders.items` (jsonb) เป็น array ของ `{ id, name, quantity }`
- UI ใช้ Tailwind CSS
