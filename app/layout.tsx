import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal Coleta de Relatos",
  description: "Portal interno para agenda, coleta de relatos e atendimento",
};

const themeScript = `
(function(){
  try {
    var saved = localStorage.getItem('portal-theme');
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
  } catch(e) {}
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
