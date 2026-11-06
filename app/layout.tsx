import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calendario de Evaluaciones",
  description: "Calendario compartido de pruebas, controles y entregas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
