import { Dela_Gothic_One, Kanit, Prompt } from 'next/font/google';
import './globals.css';

// ฟอนต์เนื้อหา: Prompt (สะอาดตา อ่านง่าย รองรับภาษาไทย)
const prompt = Prompt({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-prompt',
  display: 'swap',
});

// ฟอนต์หัวข้อ: Dela Gothic One (ตัวหนาบล็อกสไตล์ญี่ปุ่น) + Kanit เป็นตัวสำรองสำหรับภาษาไทย
const dela = Dela_Gothic_One({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-dela',
  display: 'swap',
});

const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['800'],
  variable: '--font-kanit',
  display: 'swap',
});

export const metadata = {
  title: 'SushiHana | ซูชิฮานะ ร้านอาหารญี่ปุ่นพรีเมียม',
  description: 'ร้านอาหารญี่ปุ่นสไตล์พรีเมียม สั่งอาหารผ่าน QR Code ที่โต๊ะ — SushiHana ซูชิฮานะ',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th" className={`${prompt.variable} ${dela.variable} ${kanit.variable}`}>
      <body className="min-h-screen bg-[#f8f5f0] font-sans text-stone-800 antialiased">
        {children}
      </body>
    </html>
  );
}
