import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { EntryLayout } from '../../../shared/ui/EntryLayout'
import { useI18n } from '../../../shared/i18n/i18n-context'

const sections = [
  { title: 'privacy.dataTitle', paragraphs: ['privacy.dataDiscord', 'privacy.dataRoom', 'privacy.dataLibrary', 'privacy.dataExtension', 'privacy.dataTechnical'] },
  { title: 'privacy.purposeTitle', paragraphs: ['privacy.purpose'] },
  { title: 'privacy.retentionTitle', paragraphs: ['privacy.retentionAccount', 'privacy.retentionRoom', 'privacy.retentionSession'] },
  { title: 'privacy.thirdPartyTitle', paragraphs: ['privacy.thirdPartyDiscord', 'privacy.thirdPartyYouTube', 'privacy.thirdPartyOther'] },
  { title: 'privacy.deviceTitle', paragraphs: ['privacy.deviceWeb', 'privacy.deviceExtension'] },
  { title: 'privacy.rightsTitle', paragraphs: ['privacy.rights'] },
  { title: 'privacy.securityTitle', paragraphs: ['privacy.security'] },
  { title: 'privacy.contactTitle', paragraphs: ['privacy.contact'] },
  { title: 'privacy.changeTitle', paragraphs: ['privacy.change'] },
] as const

export function PrivacyPage() {
  const { t } = useI18n()

  return (
    <EntryLayout className="flex min-h-dvh flex-col">
      <article className="mx-auto w-full max-w-[920px] flex-1 py-12 sm:py-16">
        <header className="border-b border-line pb-8">
          <p className="mb-3 text-xs font-bold tracking-[0.18em] text-lime">B-SIDE · PRIVACY</p>
          <h1 className="text-[clamp(30px,4vw,44px)] font-bold tracking-[-0.04em]">{t('privacy.title')}</h1>
          <p className="mt-4 max-w-[70ch] text-sm leading-7 text-muted">{t('privacy.intro')}</p>
          <p className="mt-4 text-xs text-dim">{t('privacy.updated')}</p>
        </header>

        <div className="space-y-9 py-9">
          {sections.map((section, index) => (
            <section className="grid gap-3 sm:grid-cols-[36px_minmax(0,1fr)] sm:gap-5" key={section.title}>
              <span className="pt-1 font-mono text-xs text-purple-light" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h2 className="mb-3 text-lg font-semibold tracking-[-0.02em]">{t(section.title)}</h2>
                <div className="space-y-3 text-sm leading-7 text-muted [word-break:keep-all]">
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{t(paragraph)}</p>)}
                  {section.title === 'privacy.thirdPartyTitle' && (
                    <p className="flex flex-wrap gap-x-5 gap-y-1">
                      <a className="inline-flex items-center gap-1 text-purple-light underline-offset-4 hover:underline" href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer">Discord Privacy Policy <ArrowUpRight size={14} aria-hidden="true" /></a>
                      <a className="inline-flex items-center gap-1 text-purple-light underline-offset-4 hover:underline" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy <ArrowUpRight size={14} aria-hidden="true" /></a>
                    </p>
                  )}
                  {section.title === 'privacy.contactTitle' && (
                    <p>
                      <a className="text-purple-light underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-purple-light" href="mailto:kyeongwon329@gmail.com">
                        kyeongwon329@gmail.com
                      </a>
                    </p>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      </article>
      <footer className="mx-auto flex w-full max-w-[920px] items-center justify-between gap-4 border-t border-line py-5 text-xs text-muted">
        <span>Powered by YouTube</span>
        <Link className="rounded-sm hover:text-ink focus-visible:outline-2 focus-visible:outline-purple-light" to="/">{t('common.home')}</Link>
      </footer>
    </EntryLayout>
  )
}
