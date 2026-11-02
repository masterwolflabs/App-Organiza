import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";
// Paleta y luces configurables (propio de la plantilla; globals.css se trae tal cual de Finance).
import "./appearance.css";
import { APP } from "@/app.config";
import { THEME_BOOT_SCRIPT } from "@/utils/theme";
import { APPEARANCE_BOOT_SCRIPT } from "@/utils/appearance";
import { GlobalFileDrop } from "@/components/ui/GlobalFileDrop";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Títulos grandes y expresivos (igual que Finance).
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: APP.name,
  description: APP.description,
  appleWebApp: { capable: true, title: APP.name, statusBarStyle: 'black-translucent' },
  icons: { apple: '/apple-touch-icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${display.variable}`}>
      <head>
        {/* Tema, paleta y luces antes del primer pintado (Configuración). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT + APPEARANCE_BOOT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning className="bg-[#09090b] text-zinc-100 antialiased h-full">
        {children}
        <GlobalFileDrop />
      </body>
    </html>
  );
}
