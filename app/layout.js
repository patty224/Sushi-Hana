export const metadata = {
  title: 'SushiHana',
  description: 'ระบบสั่งอาหารผ่าน QR Code ร้านอาหารญี่ปุ่น SushiHana',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
