/**
 * Deep-redacts base64 / data-URI strings anywhere inside a payload so that
 * diagnostic/replay rows (tasks.payload, assets.parameters, run_logs.payload)
 * never persist raw media bytes. Asset IDs, URLs, and all metadata are kept,
 * so features like "Recreate" keep working (they reload media via asset IDs).
 */

const BASE64_BODY_RE = /^[A-Za-z0-9+/=]+$/
const MIN_REDACT_LENGTH = 128
const MAX_DEPTH = 24

export function redactPayload(value: any, depth = 0): any {
  if (value === null || value === undefined) return value

  const t = typeof value
  if (t === 'string') {
    const s = value as string
    if (s.length < MIN_REDACT_LENGTH) return s
    if (s.startsWith('data:')) return ''
    if (s.includes(' ') || s.includes('\n') || s.includes('\t') || s.includes('\r')) return s
    if (BASE64_BODY_RE.test(s)) return ''
    return s
  }

  if (t === 'number' || t === 'boolean' || t === 'bigint' || t === 'symbol' || t === 'function') return value
  if (depth >= MAX_DEPTH) return value

  if (Array.isArray(value)) {
    return value.map(v => redactPayload(v, depth + 1))
  }

  if (t === 'object') {
    const out: Record<string, any> = {}
    for (const k of Object.keys(value)) {
      out[k] = redactPayload(value[k], depth + 1)
    }
    return out
  }

  return value
}

export function redactJsonStringify(payload: any): string {
  return JSON.stringify(redactPayload(payload))
}
