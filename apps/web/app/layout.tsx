export const metadata = { title: "Echelix Engine" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 720 }}>
        {children}
      </body>
    </html>
  );
}
