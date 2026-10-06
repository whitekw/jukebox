import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { EntryLayout } from '../../../shared/ui/EntryLayout'
import { useI18n } from '../../../shared/i18n/i18n-context'

const sections = [
  { title: 'terms.serviceTitle', paragraphs: ['terms.service'] },
  { title: 'terms.accountTitle', paragraphs: ['terms.account', 'terms.profile'] },
  { title: 'terms.roomTitle', paragraphs: ['terms.room'] },
  { title: 'terms.conductTitle', paragraphs: ['terms.conduct', 'terms.restriction'] },
  { title: 'terms.contentTitle', paragraphs: ['terms.content'] },
  { title: 'terms.externalTitle', paragraphs: ['terms.external'] },
  { title: 'terms.syncTitle', paragraphs: ['terms.sync', 'terms.syncReplace'] },
  { title: 'terms.privacyTitle', paragraphs: ['terms.privacy'] },
  { title: 'terms.withdrawalTitle', paragraphs: ['terms.withdrawal'] },
  { title: 'terms.availabilityTitle', paragraphs: ['terms.availability', 'terms.changes'] },
  { title: 'terms.responsibilityTitle', paragraphs: ['terms.responsibility', 'terms.disputes'] },
  { title: 'terms.contactTitle', paragraphs: ['terms.contact'] },
] as const

const linkClass = 'rounded-sm text-purple-light underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-purple-light'

export function TermsPage() {
  const { t } = useI18n()

  return (
    <EntryLayout className="flex min-h-dvh flex-col">
      <article className="mx-auto w-full max-w-[920px] flex-1 py-12 sm:py-16">
        <header className="border-b border-line pb-8">
          <p className="mb-3 text-xs font-bold tracking-[0.18em] text-lime">B-SIDE · TERMS</p>
          <h1 className="text-[clamp(30px,4vw,44px)] font-bold tracking-[-0.04em]">{t('terms.title')}</h1>
          <p className="mt-4 max-w-[70ch] text-sm leading-7 text-muted">{t('terms.intro')}</p>
          <p className="mt-4 text-xs text-dim">{t('terms.updated')}</p>
        </header>

        <div className="space-y-9 py-9">
          {sections.map((section, index) => (
            <section className="grid gap-3 sm:grid-cols-[36px_minmax(0,1fr)] sm:gap-5" key={section.title}>
              <span className="pt-1 font-mono text-xs text-purple-light" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h2 className="mb-3 text-lg font-semibold tracking-[-0.02em]">{t(section.title)}</h2>
                <div className="space-y-3 text-sm leading-7 text-muted [word-break:keep-all]">
                  {section.paragraphs.map(paragraph => <p key={paragraph}>{t(paragraph)}</p>)}
                  {section.title === 'terms.externalTitle' && (
                    <p><a className={`${linkClass} inline-flex items-center gap-1`} href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">{t('terms.youtubeLink')}<ArrowUpRight size={14} aria-hidden="true" /></a></p>
                  )}
                  {section.title === 'terms.privacyTitle' && <p><Link className={linkClass} to="/privacy">{t('privacy.link')}</Link></p>}
                  {section.title === 'terms.contactTitle' && <p><a className={linkClass} href="mailto:kyeongwon329@gmail.com">kyeongwon329@gmail.com</a></p>}
                </div>
              </div>
            </section>
          ))}
        </div>
      </article>
      <footer className="mx-auto flex w-full max-w-[920px] flex-wrap items-center justify-between gap-4 border-t border-line py-5 text-xs text-muted">
        <span>Powered by YouTube</span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link className={linkClass} to="/privacy">{t('privacy.link')}</Link>
          <Link className={linkClass} to="/">{t('common.home')}</Link>
        </div>
      </footer>
    </EntryLayout>
  )
}
