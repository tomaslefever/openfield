import * as React from 'react'
import kieLogoPng from '@/assets/providers/kie-logo.png'

export type ProviderId =
  | 'kie'
  | 'replicate'
  | 'fal'
  | 'elevenlabs'
  | 'machgen'
  | 'higgsfield'
  | 'hf'
  | 'local'

export interface ProviderLogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  className?: string
}

/**
 * KIE.ai Logo
 */
export function KieLogo({ size = 16, className = '', ...props }: ProviderLogoProps) {
  const numSize = typeof size === 'number' ? size : parseInt(String(size), 10) || 16
  return (
    <img
      src={kieLogoPng}
      alt="KIE.ai"
      width={numSize}
      height={numSize}
      className={`object-contain shrink-0 ${className}`}
      style={{ width: numSize, height: numSize }}
    />
  )
}

/**
 * Replicate Official Logo (Stepped 3-bar mark)
 */
export function ReplicateLogo({ size = 16, className = '', ...props }: ProviderLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      fillRule="evenodd"
      className={`shrink-0 ${className}`}
      {...props}
    >
      <path d="M22 10.552v2.26h-7.932V22H11.54V10.552H22zM22 2v2.264H4.528V22H2V2h20zm0 4.276V8.54H9.296V22H6.768V6.276H22z" />
    </svg>
  )
}

/**
 * fal.ai Official Logo (Red/Coral Asterisk geometry)
 */
export function FalLogo({ size = 16, className = '', ...props }: ProviderLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      {...props}
    >
      <path
        clipRule="evenodd"
        fillRule="evenodd"
        d="M15.477 0c.415 0 .749.338.788.752a7.775 7.775 0 006.985 6.984c.413.04.752.373.752.788v6.952c0 .415-.338.748-.752.788a7.775 7.775 0 00-6.985 6.984c-.04.414-.373.752-.788.752H8.525c-.416 0-.749-.338-.789-.752a7.775 7.775 0 00-6.984-6.984c-.414-.04-.752-.373-.752-.788V8.524c0-.415.338-.748.752-.788A7.775 7.775 0 007.736.752C7.776.338 8.11 0 8.526 0h6.95zM4.819 11.98a7.226 7.226 0 007.223 7.23 7.226 7.226 0 007.223-7.23c0-3.994-3.234-7.23-7.223-7.23a7.227 7.227 0 00-7.223 7.23z"
        fill="#EC0648"
      />
    </svg>
  )
}

/**
 * ElevenLabs Official Logo (Two vertical parallel bars "||")
 */
export function ElevenLabsLogo({ size = 16, className = '', ...props }: ProviderLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      fillRule="evenodd"
      className={`shrink-0 ${className}`}
      {...props}
    >
      <path d="M5 0h5v24H5V0zM14 0h5v24h-5V0z" />
    </svg>
  )
}

/**
 * MachGen Official Logo (Supersonic dynamic M mark)
 */
export function MachGenLogo({ size = 16, className = '', ...props }: ProviderLogoProps) {
  return (
    <svg
      viewBox="0 0 996 996"
      width={size}
      height={size}
      fill="none"
      className={`shrink-0 ${className}`}
      {...props}
    >
      <path
        transform="translate(2.7 311.6)"
        d="M634.241 24.0729C635.741 25.5732 636.584 27.608 636.584 29.7297L636.585 143.152C636.585 144.77 638.408 145.718 639.733 144.789L835.057 7.86528C836.402 6.92204 838.006 6.41602 839.649 6.41602H967.27C969.392 6.41602 971.427 7.25887 972.927 8.75916L988.241 24.0729C989.741 25.5732 990.584 27.608 990.584 29.7297L990.585 343.103C990.585 345.225 989.742 347.26 988.242 348.76L972.928 364.074C971.428 365.574 969.393 366.417 967.271 366.417H728.899C726.777 366.417 724.742 365.574 723.242 364.074L709.173 350.004C707.415 348.246 707.669 345.327 709.705 343.9L949.176 176.026C951.312 174.528 952.584 172.084 952.584 169.475V149.059C952.584 147.441 950.762 146.493 949.436 147.422L639.109 364.967C637.764 365.91 636.161 366.416 634.517 366.416H374.898C372.776 366.416 370.741 365.573 369.241 364.073L355.172 350.003C353.414 348.245 353.668 345.326 355.704 343.899L595.177 176.024C597.313 174.526 598.585 172.082 598.585 169.473V149.059C598.585 147.441 596.763 146.493 595.437 147.422L285.11 364.967C283.764 365.91 282.161 366.416 280.517 366.416H20.8979C18.7761 366.416 16.7413 365.573 15.241 364.073L1.17165 350.003C-0.586215 348.245 -0.331622 345.326 1.70406 343.899L481.057 7.86528C482.402 6.92203 484.006 6.41602 485.649 6.41602H613.27C615.392 6.41602 617.427 7.25887 618.927 8.75916L634.241 24.0729Z"
        fill="#E33909"
      />
    </svg>
  )
}

/**
 * Higgsfield AI Official Logo (Lime Green / Black Fluid H)
 */
export function HiggsfieldLogo({ size = 16, className = '', ...props }: ProviderLogoProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="none"
      className={`shrink-0 rounded-[22%] ${className}`}
      {...props}
    >
      <rect width="512" height="512" rx="92" fill="#D1FE17" />
      <path
        d="M419.055 253.911L418.753 250.505C415.893 217.823 395.28 156.334 338.099 156.334C295.668 156.334 263.614 199.548 235.326 237.647C212.754 268.158 193.196 294.333 171.676 294.333C165.956 293.715 158.585 290.771 154.073 284.112C150.009 278.069 148.957 270.326 151.062 261.032C154.37 246.318 173.332 232.688 193.343 218.129C204.325 210.386 215.613 202.176 223.438 194.278C246.011 171.82 257.446 155.557 257.446 129.383C257.446 103.21 243.453 90.1964 231.716 84.6198C208.242 73.471 173.785 79.9756 151.817 99.4937C148.508 102.593 145.195 105.532 142.185 108.32C120.065 128.611 105.17 142.397 71.0117 131.861V174.298C116.304 194.899 154.375 155.557 168.821 137.437C179.954 125.512 191.691 118.541 200.421 118.541H200.874C204.787 118.696 208.095 120.246 210.506 123.034C214.419 127.683 215.924 133.104 215.169 139.142C213.513 151.845 200.723 166.71 177.249 182.974C149.712 202.025 103.669 233.931 100.055 274.046C97.3457 302.857 111.792 331.664 134.364 342.813C187.028 368.523 219.082 324.227 253.085 277.452C279.117 241.364 303.795 207.136 338.103 207.136C368.949 207.136 380.385 233.465 380.385 250.039V253.294L377.375 253.911C302.591 267.542 261.812 339.718 261.812 373.016C261.812 406.317 289.198 434.817 322.903 434.817C362.328 434.817 411.079 400.122 418.905 302.546L419.207 298.986H450.354V253.915L419.055 253.911ZM378.276 303.936C372.259 362.326 343.215 389.588 325.611 389.588C317.636 389.588 306.504 382.771 306.504 370.073C306.504 355.826 327.117 312.612 373.462 299.758L378.879 298.364L378.276 303.936Z"
        fill="#000000"
      />
    </svg>
  )
}

/**
 * Hugging Face Official Emoji Logo
 */
export function HuggingFaceLogo({ size = 16, className = '', ...props }: ProviderLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      {...props}
    >
      <path
        d="M2.25 11.535c0-3.407 1.847-6.554 4.844-8.258a9.822 9.822 0 019.687 0c2.997 1.704 4.844 4.851 4.844 8.258 0 5.266-4.337 9.535-9.687 9.535S2.25 16.8 2.25 11.535z"
        fill="#FF9D0B"
      />
      <path
        d="M11.938 20.086c4.797 0 8.687-3.829 8.687-8.551 0-4.722-3.89-8.55-8.687-8.55-4.798 0-8.688 3.828-8.688 8.55 0 4.722 3.89 8.55 8.688 8.55z"
        fill="#FFD21E"
      />
      <path
        d="M11.875 15.113c2.457 0 3.25-2.156 3.25-3.263 0-.576-.393-.394-1.023-.089-.582.283-1.365.675-2.224.675-1.798 0-3.25-1.693-3.25-.586 0 1.107.79 3.263 3.25 3.263h-.003z"
        fill="#FF323D"
      />
      <path
        d="M14.76 9.21c.32.108.445.753.767.585.447-.233.707-.708.659-1.204a1.235 1.235 0 00-.879-1.059 1.262 1.262 0 00-1.33.394c-.322.384-.377.92-.14 1.36.153.283.638-.177.925-.079l-.002.003zm-5.887 0c-.32.108-.448.753-.768.585a1.226 1.226 0 01-.658-1.204c.048-.495.395-.913.878-1.059a1.262 1.262 0 011.33.394c.322.384.377.92.14 1.36-.152.283-.64-.177-.925-.079l.003.003zm1.12 5.34a2.166 2.166 0 011.325-1.106c.07-.02.144.06.219.171l.192.306c.069.1.139.175.209.175.074 0 .15-.074.223-.172l.205-.302c.08-.11.157-.188.234-.165.537.168.986.536 1.25 1.026.932-.724 1.275-1.905 1.275-2.633 0-.508-.306-.426-.81-.19l-.616.296c-.52.24-1.148.48-1.824.48-.676 0-1.302-.24-1.823-.48l-.589-.283c-.52-.248-.838-.342-.838.177 0 .703.32 1.831 1.187 2.56l.18.14z"
        fill="#3A3B45"
      />
      <path
        d="M17.812 10.366a.806.806 0 00.813-.8c0-.441-.364-.8-.813-.8a.806.806 0 00-.812.8c0 .442.364.8.812.8zm-11.624 0a.806.806 0 00.812-.8c0-.441-.364-.8-.812-.8a.806.806 0 00-.813.8c0 .442.364.8.813.8z"
        fill="#FF9D0B"
      />
    </svg>
  )
}

/**
 * Local AI Engine (GPU hardware microchip)
 */
export function LocalLogo({ size = 16, className = '', ...props }: ProviderLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={`shrink-0 ${className}`}
      {...props}
    >
      <rect x="4" y="4" width="16" height="16" rx="3" fill="#10B981" fillOpacity="0.18" stroke="#10B981" />
      <rect x="8" y="8" width="8" height="8" rx="1.5" fill="#10B981" fillOpacity="0.45" stroke="#10B981" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" stroke="#10B981" strokeLinecap="round" />
    </svg>
  )
}

export function getProviderForModel(model?: { provider?: string; local?: boolean } | null): ProviderId {
  if (!model) return 'kie'
  if (model.local) return 'local'
  if (model.provider === 'replicate') return 'replicate'
  if (model.provider === 'fal') return 'fal'
  if (model.provider === 'elevenlabs') return 'elevenlabs'
  if (model.provider === 'machgen') return 'machgen'
  if (model.provider === 'higgsfield') return 'higgsfield'
  return 'kie'
}

export interface ProviderLogoComponentProps {
  provider?: string | null
  size?: number | string
  className?: string
}

export function ProviderLogo({ provider, size = 16, className = '' }: ProviderLogoComponentProps) {
  const norm = (provider || 'kie').toLowerCase()

  if (norm === 'replicate') return <ReplicateLogo size={size} className={className} />
  if (norm === 'fal') return <FalLogo size={size} className={className} />
  if (norm === 'elevenlabs') return <ElevenLabsLogo size={size} className={className} />
  if (norm === 'machgen') return <MachGenLogo size={size} className={className} />
  if (norm === 'higgsfield') return <HiggsfieldLogo size={size} className={className} />
  if (norm === 'hf' || norm === 'huggingface') return <HuggingFaceLogo size={size} className={className} />
  if (norm === 'local') return <LocalLogo size={size} className={className} />
  return <KieLogo size={size} className={className} />
}
