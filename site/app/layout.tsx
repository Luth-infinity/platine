import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://platine-luth.vercel.app'),
  title: 'Platine',
  icons: { icon: '/icon.png' }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Marque la page animable seulement si JS tourne, et note la
            plateforme avant le rendu pour ne montrer que le bon bouton. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add('js');
try {
  var ua = navigator.userAgent || '';
  var pf = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  var tactile = navigator.maxTouchPoints > 1;
  var os = '';
  if (/win/i.test(pf) || /Windows/.test(ua)) os = 'win';
  else if ((/mac/i.test(pf) || /Mac OS X/.test(ua)) && !tactile) os = 'mac';
  if (os) document.documentElement.dataset.os = os;
} catch (e) {}`
          }}
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
