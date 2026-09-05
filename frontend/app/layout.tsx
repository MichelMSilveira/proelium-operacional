import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Proelium Operacional',
  description: 'Plataforma operacional Proelium Serviços',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
