type IconProps = { size?: number; className?: string }

function IconBase({
  children,
  size = 20,
  className,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function DiscordIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        fill="currentColor"
        stroke="none"
        d="M19.5 5.34A17.1 17.1 0 0 0 15.22 4l-.53 1.08a15.9 15.9 0 0 0-5.38 0L8.78 4A17.4 17.4 0 0 0 4.5 5.35C1.8 9.36 1.07 13.28 1.44 17.14A17.6 17.6 0 0 0 6.7 19.8l1.28-1.75a11 11 0 0 1-2.02-.98l.5-.39c3.9 1.8 8.14 1.8 12 0l.52.39c-.65.38-1.33.7-2.03.98l1.28 1.75a17.5 17.5 0 0 0 5.25-2.66c.44-4.47-.75-8.35-3.98-11.8ZM8.86 14.77c-1.17 0-2.13-1.08-2.13-2.41 0-1.34.94-2.42 2.13-2.42 1.2 0 2.15 1.1 2.13 2.42 0 1.33-.94 2.41-2.13 2.41Zm6.28 0c-1.17 0-2.13-1.08-2.13-2.41 0-1.34.94-2.42 2.13-2.42 1.2 0 2.15 1.1 2.13 2.42 0 1.33-.93 2.41-2.13 2.41Z"
      />
    </IconBase>
  )
}

export function MusicIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </IconBase>
  )
}

export function GripIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="19" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="19" r="1" fill="currentColor" stroke="none" />
    </IconBase>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </IconBase>
  )
}

export function MessageCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth="2.8" />
    </IconBase>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </IconBase>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </IconBase>
  )
}

export function SendIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </IconBase>
  )
}

export function SkipIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m5 4 10 8-10 8V4Z" />
      <path d="M19 5v14" />
    </IconBase>
  )
}

export function PauseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 5v14M16 5v14" />
    </IconBase>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m7 4 13 8-13 8V4Z" />
    </IconBase>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6" />
    </IconBase>
  )
}

export function ChevronIcon({ direction, ...props }: IconProps & { direction: 'up' | 'down' }) {
  return (
    <IconBase {...props}>
      <path d={direction === 'up' ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
    </IconBase>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </IconBase>
  )
}

export function LinkIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </IconBase>
  )
}

export function MoreHorizontalIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </IconBase>
  )
}

export function UserCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </IconBase>
  )
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 17 17 7M7 7h10v10" />
    </IconBase>
  )
}

export function LogoutIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 17l5-5-5-5M15 12H3" />
      <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
    </IconBase>
  )
}
