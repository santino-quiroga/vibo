import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

// Se cargan con next/font y no desde fonts.googleapis.com: next/font las
// descarga en el build y las sirve desde nuestro dominio, así el CSP puede
// seguir bloqueando hosts externos.

// Inter es la única tipografía de la interfaz: títulos, texto, etiquetas y
// números de métrica. Sin serif en ningún lado.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Monoespaciada, sólo para cadenas de máquina del admin (ids, tokens, base
// ids). No se usa en el panel cliente: ahí todo es Inter.
const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vibo",
  description: "Gestión de agentes de IA de ventas por WhatsApp",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // lang="es": la plataforma es solo español (Argentina), sin i18n en v1.
  return (
    <html
      lang="es"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
