import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agenda GPV",
  description: "Sistema interno de agendamentos",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
