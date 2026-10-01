import Link from 'next/link';

// หน้านี้ใช้ Inline Style เท่านั้น (ไม่ใช้ Tailwind class)
const displayFont = 'var(--font-dela), var(--font-kanit), sans-serif';

const styles = {
  page: {
    minHeight: '100vh',
    padding: '20px 16px 48px',
    display: 'flex',
    justifyContent: 'center',
  },
  container: {
    width: '100%',
    maxWidth: 960,
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px 20px',
  },
  brand: {
    fontFamily: displayFont,
    fontSize: 22,
    color: '#1c1917',
    letterSpacing: '0.02em',
  },
  brandAccent: {
    color: '#e32929',
  },
  navTag: {
    border: '1px solid #d6d3d1',
    borderRadius: 999,
    padding: '8px 18px',
    fontSize: 14,
    fontWeight: 500,
    color: '#44403c',
    background: '#ffffff',
  },
  hero: {
    background: 'radial-gradient(circle at 20% 15%, #f04a4a 0%, #e32929 45%, #c81f1f 100%)',
    borderRadius: 32,
    color: '#ffffff',
    textAlign: 'center',
    padding: '56px 24px 64px',
    boxShadow: '0 10px 30px rgba(227, 41, 41, 0.25)',
  },
  heroTag: {
    display: 'inline-block',
    border: '1px solid rgba(255, 255, 255, 0.7)',
    borderRadius: 999,
    padding: '6px 16px',
    fontSize: 14,
    marginBottom: 20,
  },
  heroTitle: {
    fontFamily: displayFont,
    fontSize: 'clamp(40px, 9vw, 76px)',
    lineHeight: 1.1,
    margin: 0,
    letterSpacing: '0.02em',
  },
  heroSubtitle: {
    fontSize: 'clamp(18px, 3vw, 24px)',
    fontWeight: 600,
    margin: '16px 0 0',
  },
  heroText: {
    fontSize: 16,
    lineHeight: 1.7,
    margin: '12px auto 0',
    maxWidth: 480,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
    marginTop: 24,
  },
  card: {
    display: 'block',
    background: '#ffffff',
    borderRadius: 24,
    padding: '28px 24px',
    border: '1px solid #ece7e1',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
    textDecoration: 'none',
    color: '#1c1917',
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e32929',
    margin: '0 0 8px',
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 700,
    margin: '0 0 6px',
  },
  cardText: {
    fontSize: 15,
    lineHeight: 1.6,
    color: '#78716c',
    margin: 0,
  },
  buttonPrimary: {
    display: 'inline-block',
    marginTop: 20,
    background: '#e32929',
    color: '#ffffff',
    borderRadius: 999,
    padding: '10px 24px',
    fontSize: 15,
    fontWeight: 600,
  },
  buttonOutline: {
    display: 'inline-block',
    marginTop: 20,
    background: '#ffffff',
    color: '#1c1917',
    border: '1px solid #d6d3d1',
    borderRadius: 999,
    padding: '10px 24px',
    fontSize: 15,
    fontWeight: 600,
  },
};

export default function HomePage() {
  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <nav style={styles.nav}>
          <span style={styles.brand}>
            SUSHI<span style={styles.brandAccent}>HANA</span>
          </span>
          <span style={styles.navTag}>ร้านอาหารญี่ปุ่นพรีเมียม</span>
        </nav>

        <section style={styles.hero}>
          <span style={styles.heroTag}>寿司花 · ซูชิฮานะ</span>
          <h1 style={styles.heroTitle}>SUSHIHANA</h1>
          <p style={styles.heroSubtitle}>ซูชิสดใหม่ สั่งง่ายผ่าน QR Code</p>
          <p style={styles.heroText}>
            สัมผัสศิลปะแห่งอาหารญี่ปุ่นด้วยวัตถุดิบคุณภาพ ในบรรยากาศการรับประทานอาหารที่ทันสมัย
          </p>
        </section>

        <section style={styles.grid}>
          <Link href="/generate-qr" style={styles.card}>
            <p style={styles.cardLabel}>สำหรับพนักงานหน้าร้าน</p>
            <h2 style={styles.cardTitle}>เปิดโต๊ะ / สร้าง QR Code</h2>
            <p style={styles.cardText}>เปิดโต๊ะให้ลูกค้า แล้วให้ลูกค้าสแกน QR Code เพื่อสั่งอาหาร</p>
            <span style={styles.buttonPrimary}>ไปที่หน้าเปิดโต๊ะ</span>
          </Link>

          <Link href="/kitchen" style={styles.card}>
            <p style={styles.cardLabel}>สำหรับเชฟและทีมครัว</p>
            <h2 style={styles.cardTitle}>หน้าจอครัว</h2>
            <p style={styles.cardText}>ดูออเดอร์ใหม่แบบเรียลไทม์ และอัปเดตสถานะการทำอาหาร</p>
            <span style={styles.buttonOutline}>ไปที่หน้าจอครัว</span>
          </Link>
          <Link href="/admin" style={styles.card}>
            <p style={styles.cardLabel}>สำหรับแอดมิน</p>
            <h2 style={styles.cardTitle}>หน้าแอดมิน</h2>
            <p style={styles.cardText}>อนุมัติการเรียกเก็บเงิน และเพิ่ม/ลบเมนูอาหาร</p>
            <span style={styles.buttonOutline}>ไปที่หน้าแอดมิน</span>
          </Link>
        </section>
      </div>
    </main>
  );
}
