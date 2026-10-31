// Smoke test of the MCP timeline tools: builds a short 9:16 timeline using only MCP calls (import,
// create, add/trim/move/split/remove clips, tracks, captions, autocaptions estimate, SRT, export),
// checking ids, times and error messages along the way.
//
//   node scripts/mcp-timeline-smoke.mjs [mcpUrl] [cdpPort] [--cleanup]
//
// mcpUrl defaults to http://127.0.0.1:19877/mcp (the running app). Test media is generated with the
// bundled ffmpeg into a temp folder and imported into the ACTIVE workspace's library; --cleanup
// deletes the test timeline and archives those assets at the end. cdpPort (an app started with
// --remote-debugging-port) also checks that the Timeline page followed the edits live and that a
// stale page save can't overwrite them.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const URL_ = positional[0] || 'http://127.0.0.1:19877/mcp'
const CDP = positional[1]
const CLEANUP = process.argv.includes('--cleanup')

const MEDIA = fs.mkdtempSync(path.join(os.tmpdir(), 'openfield-mcp-smoke-'))
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static')
const ff = (...args) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: MEDIA })
ff('-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=6', '-f', 'lavfi', '-i', 'sine=f=330:d=6', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', 'clipA.mp4')
ff('-f', 'lavfi', '-i', 'color=c=0x993355:s=1080x1920:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=550:d=4', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', 'clipB.mp4')
ff('-f', 'lavfi', '-i', 'color=c=0x22aa66:s=1080x1920', '-frames:v', '1', 'still.png')
ff('-f', 'lavfi', '-i', 'sine=f=220:d=12', '-c:a', 'libmp3lame', '-b:a', '96k', 'bed.mp3')

let rpcId = 0
let session = null
async function rpc(method, params) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(session ? { 'Mcp-Session-Id': session } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  })
  session = res.headers.get('mcp-session-id') || session
  const text = await res.text()
  const json = JSON.parse(text.startsWith('{') ? text : text.split('\n').find((l) => l.startsWith('data:')).slice(5))
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`)
  return json.result
}

async function call(name, args, { expectError = false } = {}) {
  const r = await rpc('tools/call', { name, arguments: args })
  const text = r.content?.[0]?.text ?? ''
  if (r.isError && !expectError) throw new Error(`${name} failed: ${text}`)
  if (!r.isError && expectError) throw new Error(`${name} should have failed but returned: ${text.slice(0, 300)}`)
  return r.isError ? text : r.structuredContent ?? JSON.parse(text)
}

const step = (label, value) => console.log(`\n== ${label}\n${typeof value === 'string' ? value : JSON.stringify(value, null, 1).slice(0, 1400)}`)
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg) }

await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'timeline-test', version: '1' } })
const tools = (await rpc('tools/list', {})).tools.map((t) => t.name).filter((n) => n.startsWith('timeline_'))
step('timeline tools', tools.join(', '))

// Library media (imported through MCP too)
const imp = async (f) => (await call('import_asset', { file_path: path.join(MEDIA, f) })).asset.id
const A = await imp('clipA.mp4'), B = await imp('clipB.mp4'), STILL = await imp('still.png'), BED = await imp('bed.mp3')
step('imported assets', { A, B, STILL, BED })

const created = await call('timeline_create', { name: 'Prueba MCP vertical', aspect: '9:16' })
const T = created.timeline.id
const videoTrack = created.timeline.tracks.find((t) => t.kind === 'video').id
const audioTrack = created.timeline.tracks.find((t) => t.kind === 'audio').id
step('timeline_create', created.timeline)

const added = await call('timeline_add_clips', {
  timeline_id: T,
  clips: [
    { asset_id: A, in: 1, out: 5 },                 // 4 s at 0
    { asset_id: B },                                // appended at 4
    { asset_id: STILL, duration: 2 },               // appended at 8
    { asset_id: BED, start: 0, duration: 10, volume: 0.3, id: 'bed-1' },
  ],
})
step('timeline_add_clips', added)
const [cA, cB, cStill, cBed] = added.clips
assert(cA.start === 0 && cA.end === 4 && cA.in === 1 && cA.out === 5, 'A placed 0–4 with in 1 / out 5')
assert(cB.start === 4 && cB.end === 8, 'B appended at 4')
assert(cStill.start === 8 && cStill.end === 10, 'still appended at 8 for 2 s')
assert(cBed.trackId === audioTrack && cBed.id === 'bed-1', 'bed on the audio track with caller id')

const retry = await call('timeline_add_clips', { timeline_id: T, clips: [{ asset_id: BED, start: 0, duration: 10, volume: 0.3, id: 'bed-1' }] })
assert(retry.clips[0].existed === true && retry.rev === added.rev + 1, 'retry with same id returns the existing clip')
step('idempotent retry', retry.clips[0])

step('error: out past source', await call('timeline_add_clips', { timeline_id: T, clips: [{ asset_id: B, out: 9 }] }, { expectError: true }))
step('error: overlap', await call('timeline_add_clips', { timeline_id: T, clips: [{ asset_id: B, start: 1, track_id: videoTrack }] }, { expectError: true }))
step('error: unknown asset', await call('timeline_add_clips', { timeline_id: T, clips: [{ asset_id: 'nope' }] }, { expectError: true }))
step('error: audio on a video track', await call('timeline_add_clips', { timeline_id: T, clips: [{ asset_id: BED, track_id: videoTrack, start: 20 }] }, { expectError: true }))

const trimmed = await call('timeline_update_clip', { timeline_id: T, clip_id: cB.id, in: 0.5, duration: 3 })
assert(trimmed.clip.start === 4 && trimmed.clip.end === 7 && trimmed.clip.in === 0.5, 'B trimmed to 3 s from 0.5')
const moved = await call('timeline_update_clip', { timeline_id: T, clip_id: cStill.id, start: 7 })
assert(moved.clip.start === 7 && moved.duration === 10, 'still moved to 7, timeline 10 s (bed ends at 10)')
step('trim + move', { B: trimmed.clip, still: moved.clip, duration: moved.duration })

const split = await call('timeline_split_clip', { timeline_id: T, clip_id: cA.id, at: 2 })
assert(split.head.id === cA.id && split.head.end === 2 && split.tail.start === 2 && split.tail.in === 3, 'A split at 2: tail in-point 3')
step('split', split)

const removed = await call('timeline_remove_clips', { timeline_id: T, clip_ids: [split.tail.id, 'already-gone'] })
assert(removed.removed.length === 1 && removed.notFound[0] === 'already-gone', 'remove reports notFound')
// Close the gap: B back to 2
await call('timeline_update_clip', { timeline_id: T, clip_id: cB.id, start: 2 })
await call('timeline_update_clip', { timeline_id: T, clip_id: cStill.id, start: 5 })
await call('timeline_update_clip', { timeline_id: T, clip_id: 'bed-1', duration: 7 })

const track2 = await call('timeline_add_track', { timeline_id: T, kind: 'video', name: 'Overlay', id: 'overlay' })
await call('timeline_update_track', { timeline_id: T, track_id: audioTrack, volume: 0.5 })
const muted = await call('timeline_update_track', { timeline_id: T, track_id: audioTrack, muted: true })
await call('timeline_update_track', { timeline_id: T, track_id: audioTrack, muted: false })
step('tracks', { track2: track2.track, muted: muted.track })
await call('timeline_remove_track', { timeline_id: T, track_id: 'overlay' })

const caps = await call('timeline_add_captions', {
  timeline_id: T,
  captions: [
    { text: 'Hola, soy Dolly', start: 0.2, end: 1.8, id: 'cap-1' },
    { text: 'y así nací', start: 2, end: 4 },
    { text: 'con Openfield', start: 4.2, duration: 2.5 },
  ],
})
step('timeline_add_captions', caps)
await call('timeline_update_track', { timeline_id: T, track_id: caps.trackId, caption_style: 'social' })
await call('timeline_update_clip', { timeline_id: T, clip_id: 'cap-1', text: 'Hola, soy Dolly 👋' })
step('error: caption overlap', await call('timeline_add_captions', { timeline_id: T, captions: [{ text: 'x', start: 1, end: 2.5 }] }, { expectError: true }))

step('autocaptions estimate', await call('timeline_autocaptions', { timeline_id: T, scope: 'sequence', provider: 'elevenlabs', estimate_only: true }))
step('autocaptions without key', await call('timeline_autocaptions', { timeline_id: T, provider: 'elevenlabs' }, { expectError: true }))

const final = (await call('timeline_get', { timeline_id: T })).timeline
step('timeline_get', final)
assert(final.duration === 7 && final.aspect === '9:16', 'final duration 7 s, 9:16')

const srt = await call('timeline_export_srt', { timeline_id: T, output_path: path.join(MEDIA, 'prueba.srt') })
step('timeline_export_srt', srt)

let job = await call('timeline_export', { timeline_id: T, output_path: path.join(MEDIA, 'prueba-mcp.mp4'), wait_seconds: 5 })
step('timeline_export', job)
job = await call('timeline_export_status', { job_id: job.jobId, wait_seconds: 180 })
step('timeline_export_status', job)
assert(job.status === 'completed' && job.assetId, 'export completed and imported to library')

if (CDP) {
  // The app window followed along: enter the workspace and show this timeline, then read the page
  const ws = (await call('list_workspaces', {})).activeId
  await call('set_active_workspace', { workspace: ws })
  await call('timeline_open', { timeline_id: T })
  await new Promise((r) => setTimeout(r, 2500))
  const targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()
  const page = targets.find((t) => t.type === 'page' && t.url.includes('5173'))
  const sock = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => sock.addEventListener('open', r, { once: true }))
  let n = 0
  const evaluate = (expression) => new Promise((resolve) => {
    const id = ++n
    const onMsg = (ev) => { const m = JSON.parse(ev.data); if (m.id === id) { sock.removeEventListener('message', onMsg); resolve(m.result?.result?.value) } }
    sock.addEventListener('message', onMsg)
    sock.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })
  const before = await evaluate('document.body.innerText')
  assert(before.includes('Prueba MCP vertical') && before.toUpperCase().includes('HOLA, SOY DOLLY'), 'Timeline page shows the agent timeline')
  // Live edit while the page is open
  await call('timeline_update_clip', { timeline_id: T, clip_id: 'cap-1', text: 'Editado en vivo por MCP' })
  await new Promise((r) => setTimeout(r, 800))
  const afterText = await evaluate('document.body.innerText')
  assert(afterText.toUpperCase().includes('EDITADO EN VIVO POR MCP'), 'caption edit showed live in the page')
  // A stale page save (based on an old rev) must not overwrite the agent's work
  const stale = await evaluate(`window.electronAPI.projects.update(${JSON.stringify(T)}, { timelineData: { kind: 'montage', aspect: 1, tracks: [], clips: [] }, baseRev: 1 })`)
  assert(stale?.stale === true, 'stale UI save refused')
  const still = (await call('timeline_get', { timeline_id: T })).timeline
  assert(still.tracks.length >= 3 && still.duration === 7, 'timeline intact after the stale save')
  step('UI live check', { pageShowsTimeline: true, liveEdit: true, staleSaveRefused: stale.stale, rev: still.rev })
  sock.close()
}

if (CLEANUP) {
  await call('timeline_delete', { timeline_id: T, confirm_name: 'Prueba MCP vertical' })
  await call('delete_assets', { asset_ids: [A, B, STILL, BED, job.assetId] })
  step('cleanup', 'test timeline deleted, test assets archived')
}

console.log(`\nALL CHECKS PASSED (media and exports in ${MEDIA})`)
