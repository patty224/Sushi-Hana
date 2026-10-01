# SushiHana

ระบบสั่งอาหารผ่าน QR Code (Next.js App Router + Supabase)

## เริ่มต้นใช้งาน

```bash
npm install
cp .env.example .env.local   # แล้วใส่ค่า Supabase จริง
npm run dev
```

เปิด http://localhost:3000

## Deploy บน Vercel

1. Push โค้ดขึ้น GitHub
2. Import โปรเจกต์ใน Vercel
3. ตั้ง Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

> หมายเหตุสำหรับ Dynamic Route: `params` เป็น Promise ต้อง unwrap ด้วย `use()` จาก React — ดูรายละเอียดใน `CLAUDE.md`
