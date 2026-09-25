import { twMerge } from 'tailwind-merge'
import { tv } from 'tailwind-variants'

type ClassValue = string | false | null | undefined

export function cn(...classes: ClassValue[]) {
  return twMerge(...classes.filter((value): value is string => Boolean(value)))
}

export const buttonStyles = tv({
  base: [
    'inline-flex items-center justify-center gap-2 rounded-[10px] font-extrabold',
    'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-45',
  ],
  variants: {
    intent: {
      primary:
        'bg-purple-light text-[#110d19] hover:bg-[#d2c4ff] focus-visible:outline-purple-light',
      secondary:
        'bg-lime text-[#11140a] hover:bg-[#e4ff91] focus-visible:outline-lime',
      outline:
        'border border-line bg-panel text-ink hover:bg-white/10 focus-visible:outline-purple',
      purple:
        'bg-purple text-white hover:opacity-90 focus-visible:outline-purple',
      player:
        'bg-lime text-[#110d19] hover:bg-[#e4ff91] focus-visible:outline-lime',
    },
    size: {
      sm: 'min-h-9 px-3 text-xs',
      md: 'min-h-11 px-3.5 text-sm',
      lg: 'min-h-12 px-[18px]',
    },
    spread: {
      true: 'justify-between',
    },
    fullWidth: {
      true: 'w-full',
    },
  },
  defaultVariants: {
    intent: 'outline',
    size: 'md',
  },
})

export const formControlStyles = tv({
  base: [
    'w-full rounded-[10px] border border-line bg-white/[0.045] text-ink outline-none',
    'transition-colors placeholder:text-white/20',
    'focus:border-purple/75 focus:bg-purple/[0.065]',
    'disabled:cursor-not-allowed disabled:opacity-45',
  ],
  variants: {
    size: {
      default: 'h-11 px-3.5 text-sm',
      large: 'h-[50px] px-3.5',
      code: 'h-[68px] px-[18px] text-3xl font-[850] tracking-[0.24em] uppercase',
    },
    weight: {
      normal: '',
      bold: 'font-bold',
    },
  },
  defaultVariants: {
    size: 'default',
    weight: 'normal',
  },
})

export const panelStyles = tv({
  base: 'min-w-0 rounded-2xl border',
  variants: {
    tone: {
      default: 'border-line bg-[#110f16]/75',
      soft: 'border-line bg-panel',
      purple:
        'border-purple/25 bg-[linear-gradient(135deg,rgba(155,123,255,0.13),rgba(255,255,255,0.025))]',
    },
    padding: {
      none: '',
      responsive: 'p-4 md:p-[22px]',
      roomy: 'p-4 md:p-6',
    },
  },
  defaultVariants: {
    tone: 'default',
    padding: 'responsive',
  },
})

export const cardIconStyles = tv({
  base: 'mb-6 grid size-12 place-items-center rounded-[13px] border',
  variants: {
    tone: {
      purple: 'border-purple/35 bg-purple/[0.09] text-purple-light',
      lime: 'border-lime/25 bg-lime/[0.06] text-lime',
    },
  },
  defaultVariants: {
    tone: 'purple',
  },
})

export const connectionDotStyles = tv({
  base: 'size-[7px] shrink-0 rounded-full',
  variants: {
    connected: {
      false: 'bg-[#68636f] shadow-[0_0_0_4px_rgba(104,99,111,.08)]',
      true:
        'bg-lime shadow-[0_0_0_4px_rgba(215,255,100,.08),0_0_12px_rgba(215,255,100,.45)]',
    },
  },
  defaultVariants: {
    connected: false,
  },
})

export const noticeStyles = tv({
  base: [
    'fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-30px)] -translate-x-1/2',
    'rounded-[9px] border px-4 py-[11px] text-[13px] shadow-[0_14px_45px_rgba(0,0,0,.35)]',
  ],
  variants: {
    tone: {
      error: 'border-danger/35 bg-[#391119]/95 text-[#ffc0ca]',
      success: 'border-lime/25 bg-[#19200d]/95 text-[#e7ff9d]',
    },
  },
  defaultVariants: {
    tone: 'success',
  },
})

export const sectionKickerStyles =
  'text-[10px] font-black tracking-[0.16em] text-lime md:text-[11px]'

export const pageMessageStyles =
  'flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas p-6 text-center'

export const vinylStyles = [
  'grid size-[88px] place-items-center rounded-full border border-purple/30 text-purple-light',
  'bg-[repeating-radial-gradient(circle,#191620_0_4px,#100e15_5px_8px)]',
  'shadow-[0_0_60px_rgba(155,123,255,.15)] motion-safe:animate-vinyl',
].join(' ')
