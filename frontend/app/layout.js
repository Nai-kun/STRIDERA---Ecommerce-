import './globals.css';

export const metadata = {
  title: {
    default: 'STRIDERA — Premium Filipino Footwear',
    template: '%s | STRIDERA'
  },
  description: 'STRIDERA — high-performance and lifestyle footwear crafted for Filipinos. Shop Running, Lifestyle, Basketball, and Training shoes.',
  keywords: ['STRIDERA', 'shoes', 'footwear', 'sneakers', 'Philippines', 'running shoes'],
  openGraph: {
    title: 'STRIDERA — Premium Filipino Footwear',
    description: 'High-performance and lifestyle footwear for every stride.',
    locale: 'en_PH',
    type: 'website',
  }
};

export const viewport = {
  themeColor: '#4A90C4',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
