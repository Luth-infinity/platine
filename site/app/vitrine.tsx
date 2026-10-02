import { BasculeLangue } from './bascule-langue';
import { Reveal } from './reveal';
import type { Contenu, Langue } from './content';
import { getReleases, getTelechargements, PAGE_VERSIONS } from './releases';

const DEPOT = 'https://github.com/Luth-infinity/platine';
const LUTH = 'https://luth-apps.vercel.app';

const LANGUES: { code: Langue; libelle: string; href: string }[] = [
  { code: 'fr', libelle: 'FR', href: '/fr' },
  { code: 'en', libelle: 'EN', href: '/' }
];
const SECTIONS = ['fonctionnement', 'telecharger', 'versions'];
const STYLES = ['degrade', 'disque', 'affiche', 'neon', 'suisse', 'ondes', 'halo', 'mosaique'];

function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1" opacity=".4" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

/** Le disque du haut de page : sillons, étiquette, et sa pochette devant. */
function Disque({ titre }: { titre: string }) {
  return (
    <div className="disque-scene" aria-hidden>
      <div className="disque">
        <div className="disque-etiquette">
          <Logo className="h-7 w-7 text-[#0b0b0c]" />
        </div>
      </div>
      <div className="pochette-hero">
        <span className="pochette-hero-titre">{titre}</span>
      </div>
    </div>
  );
}

function BoutonTelecharger({ href, children, os }: { href: string | null; children: React.ReactNode; os?: 'win' | 'mac' }) {
  return (
    <a
      href={href ?? PAGE_VERSIONS}
      data-pour={os}
      className="bouton-principal inline-flex items-center gap-2.5 rounded-full bg-papier px-6 py-3.5 text-[15px] font-semibold text-encre transition-transform duration-200 hover:-translate-y-0.5"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </a>
  );
}

export default async function Vitrine({ t, locale }: { t: Contenu; locale: Langue }) {
  const [telechargements, releases] = await Promise.all([getTelechargements(), getReleases(locale)]);
  const mac = telechargements.macArm ?? telechargements.macIntel;

  return (
    <>
      <Reveal />
      <header className="sticky top-0 z-30 border-b border-ligne bg-encre/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <a href={locale === 'fr' ? '/fr' : '/'} className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
            <Logo className="h-5 w-5" />
            Platine
          </a>
          <nav className="flex items-center gap-1 sm:gap-6">
            <a href="#fonctionnement" className="hidden text-[14px] text-ink-soft transition-colors hover:text-ink sm:block">{t.nav.fonctionnement}</a>
            <a href="#telecharger" className="hidden text-[14px] text-ink-soft transition-colors hover:text-ink sm:block">{t.nav.telecharger}</a>
            <a href="#versions" className="hidden text-[14px] text-ink-soft transition-colors hover:text-ink sm:block">{t.nav.versions}</a>
            <BasculeLangue langues={LANGUES} locale={locale} label={t.nav.langue} fond="bg-white/5 ring-1 ring-ligne" pastille="bg-white/15" sections={SECTIONS} />
          </nav>
        </div>
      </header>

      <main>
        {/* Haut de page */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-16 md:grid-cols-[1.05fr_1fr] md:pt-24">
            <div className="reveal">
              <h1 className="titre-geant">{t.hero.titre}</h1>
              <p className="mt-6 max-w-md text-[19px] leading-relaxed text-ink-soft">{t.hero.texte}</p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <BoutonTelecharger href={telechargements.win} os="win">{t.hero.bouton}</BoutonTelecharger>
                <BoutonTelecharger href={mac} os="mac">{t.hero.boutonMac}</BoutonTelecharger>
              </div>
              <p className="mt-5 text-[13px] text-ink-faint">{t.hero.plateformes}</p>
            </div>
            <div className="reveal">
              <Disque titre={t.hero.titre} />
            </div>
          </div>
        </section>

        {/* Rangement */}
        <section id="fonctionnement" className="border-t border-ligne">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:grid-cols-2 md:items-center">
            <div className="reveal">
              <h2 className="titre-section">{t.rangement.titre}</h2>
              <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-soft">{t.rangement.texte}</p>
            </div>
            <div className="reveal space-y-3">
              <div className="rounded-2xl border border-ligne bg-white/[0.03] p-5">
                <p className="text-[12px] text-ink-faint">{t.rangement.avant}</p>
                <p className="mt-2 font-mono text-[14px] text-ink-soft break-all">
                  Halo Parc - Nuit blanche <span className="barre">(Official Video) [Free DL]</span>.flac
                </p>
              </div>
              <div className="flex justify-center text-ink-faint" aria-hidden>
                <svg viewBox="0 0 24 24" className="h-5 w-5"><path d="M12 5v14m0 0l-5-5m5 5l5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div className="flex items-center gap-4 rounded-2xl border border-ligne bg-white/[0.03] p-4">
                <img src="/styles/degrade.webp" alt="" className="h-20 w-20 rounded-lg" />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[14px]">
                  <dt className="text-ink-faint">{t.rangement.champs[0]}</dt><dd className="font-semibold">Nuit blanche</dd>
                  <dt className="text-ink-faint">{t.rangement.champs[1]}</dt><dd>Halo Parc</dd>
                  <dt className="text-ink-faint">{t.rangement.champs[2]}</dt><dd>Lumière basse</dd>
                </dl>
                <span className="ml-auto self-start text-[12px] text-ink-faint">{t.rangement.apres}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Pochettes */}
        <section className="border-t border-ligne">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="reveal max-w-2xl">
              <h2 className="titre-section">{t.pochettes.titre}</h2>
              <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">{t.pochettes.texte}</p>
            </div>
            <figure className="reveal mt-12 overflow-hidden rounded-2xl border border-ligne shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)]">
              <img src="/captures/studio.webp" alt="" className="w-full" width={1800} height={1128} />
            </figure>
            <div className="reveal mt-12 grid gap-px overflow-hidden rounded-2xl border border-ligne bg-ligne sm:grid-cols-2 lg:grid-cols-4">
              {t.pochettes.sources.map((s) => (
                <div key={s.nom} className="bg-encre p-6">
                  <h3 className="text-[15px] font-semibold">{s.nom}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{s.texte}</p>
                </div>
              ))}
            </div>
            <h3 className="reveal mt-16 text-[15px] font-semibold">{t.pochettes.stylesTitre}</h3>
            <ul className="reveal mt-5 grid grid-cols-4 gap-3 md:grid-cols-8">
              {STYLES.map((id, i) => (
                <li key={id}>
                  <img src={`/styles/${id}.webp`} alt="" className="aspect-square w-full rounded-lg border border-ligne transition-transform duration-300 hover:-translate-y-1" />
                  <p className="mt-2 text-[12px] text-ink-soft">{t.pochettes.styles[i]}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Playlists */}
        <section className="border-t border-ligne">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[1fr_1.35fr] lg:items-center">
            <div className="reveal">
              <h2 className="titre-section">{t.playlists.titre}</h2>
              <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">{t.playlists.texte}</p>
              <dl className="mt-8 space-y-4">
                {t.playlists.points.map((p) => (
                  <div key={p.nom} className="border-l border-ligne pl-4">
                    <dt className="text-[15px] font-semibold">{p.nom}</dt>
                    <dd className="mt-0.5 text-[14px] text-ink-soft">{p.texte}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <figure className="reveal overflow-hidden rounded-2xl border border-ligne shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)]">
              <img src="/captures/playlists.webp" alt="" className="w-full" width={1800} height={1128} />
            </figure>
          </div>
        </section>

        {/* Fonctionnement des playlists */}
        <section className="border-t border-ligne">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="reveal max-w-2xl">
              <h2 className="titre-section">{t.honnete.titre}</h2>
              <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">{t.honnete.texte}</p>
            </div>
            <ol className="reveal mt-12 grid gap-6 md:grid-cols-3">
              {t.honnete.colonnes.map((c, i) => (
                <li key={c.titre} className="rounded-2xl border border-ligne p-6">
                  <span className="font-mono text-[12px] text-ink-faint">0{i + 1}</span>
                  <h3 className="mt-3 text-[16px] font-semibold">{c.titre}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{c.texte}</p>
                </li>
              ))}
            </ol>
            <ul className="reveal mt-8 space-y-2">
              {t.honnete.limites.map((l) => (
                <li key={l} className="flex gap-3 text-[14px] text-ink-soft">
                  <span className="mt-2 h-1 w-1 flex-none rounded-full bg-ink-faint" aria-hidden />
                  {l}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Téléchargement */}
        <section id="telecharger" className="border-t border-ligne">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="reveal flex flex-wrap items-end justify-between gap-6">
              <h2 className="titre-section">{t.telecharger.titre}</h2>
              {telechargements.version && (
                <p className="font-mono text-[13px] text-ink-faint">
                  {t.telecharger.version} {telechargements.version}
                </p>
              )}
            </div>
            <div className="reveal mt-10 grid gap-3 md:grid-cols-3">
              {[
                { nom: t.telecharger.windows, href: telechargements.win, os: 'win' },
                { nom: t.telecharger.macArm, href: telechargements.macArm, os: 'mac' },
                { nom: t.telecharger.macIntel, href: telechargements.macIntel, os: 'mac' }
              ].map((d) => (
                <a
                  key={d.nom}
                  href={d.href ?? PAGE_VERSIONS}
                  data-pour={d.os}
                  className="carte-telechargement group flex items-center justify-between rounded-2xl border border-ligne px-6 py-5 transition-colors duration-200 hover:bg-white/[0.04]"
                >
                  <span className="text-[16px] font-semibold">{d.nom}</span>
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink-soft transition-transform duration-200 group-hover:translate-y-0.5" aria-hidden>
                    <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ))}
            </div>
            <div className="reveal mt-10 grid gap-8 md:grid-cols-3">
              {t.telecharger.premiers.map((p) => (
                <div key={p.titre}>
                  <h3 className="text-[15px] font-semibold">{p.titre}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{p.texte}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Versions */}
        <section id="versions" className="border-t border-ligne">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="reveal flex flex-wrap items-end justify-between gap-6">
              <h2 className="titre-section">{t.journal.titre}</h2>
              <a href={PAGE_VERSIONS} className="text-[14px] text-ink-soft underline decoration-ligne underline-offset-4 hover:text-ink">{t.telecharger.toutes}</a>
            </div>
            {releases.length === 0 ? (
              <p className="reveal mt-8 text-ink-soft">{t.journal.vide}</p>
            ) : (
              <ol className="reveal mt-10 divide-y divide-ligne border-y border-ligne">
                {releases.map((r) => (
                  <li key={r.version} className="grid gap-3 py-6 md:grid-cols-[160px_1fr]">
                    <a href={r.page} className="font-mono text-[14px] hover:underline">
                      {r.version}
                      <span className="mt-1 block font-sans text-[13px] text-ink-faint">{r.date}</span>
                    </a>
                    <ul className="space-y-1.5">
                      {r.points.map((p) => (
                        <li key={p} className="text-[15px] text-ink-soft">{p}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-ligne">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-[13px] text-ink-faint">
          <a href={LUTH} className="hover:text-ink">{t.pied.par}</a>
          <div className="flex gap-6">
            <a href={DEPOT} className="hover:text-ink">{t.pied.code}</a>
            <span>{t.pied.licence}</span>
          </div>
        </div>
      </footer>
    </>
  );
}
