import type { Metadata } from "next";
import { Archivo, Fraunces, Geist_Mono } from "next/font/google";
import "./globals.css";

// Fuentes del manual de identidad. Se cargan con next/font y no desde
// fonts.googleapis.com: next/font las descarga en el build y las sirve desde
// nuestro dominio, así el CSP puede seguir bloqueando hosts externos.

// Display: títulos, números de KPI. Es la voz de la marca.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

// Texto, UI, etiquetas. "Acompaña sin competir con Fraunces".
const archivo = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// El manual no define monoespaciada, pero los ids, tokens y credenciales del
// admin necesitan una: se lee mucho mejor y evita confundir 0 con O.
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
      className={`${fraunces.variable} ${archivo.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
