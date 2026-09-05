import Link from 'next/link';

export function ModuleLayout({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <main className="module-page"><header><strong>PROELIUM</strong><nav><Link href="/">Painel</Link><Link href="/clients">Clientes</Link><Link href="/projects">Projetos</Link><Link href="/commercial">Comercial</Link><Link href="/finance">Financeiro</Link><Link href="/bi">Indicadores</Link></nav></header><section className="module-content"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="intro">{description}</p>{children}</section></main>;
}
