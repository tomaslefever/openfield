import { useState, useEffect, useRef, useCallback } from 'react'
import { Key, Monitor, Palette, Globe, Folder, Save, Coins, Shapes, RotateCcw, Cable, Copy, Check } from 'lucide-react'
import { useAppStore } from '../stores/app-store'

export function SettingsPage() {
  const creditBalance = useAppStore((s) => s.creditBalance)
  const setCreditBalance = useAppStore((s) => s.setCreditBalance)
  const [apiKey, setApiKey] = useState('')
  const [replicateApiKey, setReplicateApiKey] = useState('')
  const [falApiKey, setFalApiKey] = useState('')
  const [hfToken, setHfToken] = useState('')
  const [theme, setTheme] = useState('dark')
  const [language, setLanguage] = useState('en')
  const [defaultImageModel, setDefaultImageModel] = useState('gpt-image-2-text-to-image')
  const [defaultVideoModel, setDefaultVideoModel] = useState('kling-3-0')
  const [assetPath, setAssetPath] = useState('')
  const [saveWebp, setSaveWebp] = useState(true)
  const [webpStats, setWebpStats] = useState<{ total: number; pending: number }>({ total: 0, pending: 0 })
  const [convertingWebp, setConvertingWebp] = useState(false)
  const [webpResult, setWebpResult] = useState<string | null>(null)
  const [primaryBasePrompt, setPrimaryBasePrompt] = useState('')
  const [poseBasePrompt, setPoseBasePrompt] = useState('')
  const [moodboardBasePrompt, setMoodboardBasePrompt] = useState('')
  const [saved, setSaved] = useState(false)
  const [bridgeStatus, setBridgeStatus] = useState<{ running: boolean; port: number; enabled: boolean; endpoint: string } | null>(null)
  const [copiedEndpoint, setCopiedEndpoint] = useState(false)
  const settingsLoaded = useRef(false)

  const PRIMARY_DEFAULT = 'high quality character portrait, front facing, centered composition, clean lighting, detailed features, professional rendering'
  const POSE_DEFAULT = 'character turnaround sheet, front view, side view, back view, full body standing pose, orthographic reference, white background, consistent lighting, same character design'
  const MOODBOARD_DEFAULT = 'concept art reference, detailed illustration, same character, cohesive style, professional quality'

  useEffect(() => {
    (window as any).electronAPI?.settings.getAll().then((settings: any) => {
      if (settings) {
        setApiKey(settings.openfieldApiKey || settings.kieApiKey || '')
        setReplicateApiKey(settings.replicateApiKey || '')
        setFalApiKey(settings.falApiKey || '')
        setHfToken(settings.hfToken || '')
        setTheme(settings.theme || 'dark')
        setLanguage(settings.language || 'en')
        setDefaultImageModel(settings.defaultImageModel || 'gpt-image-2-text-to-image')
        setDefaultVideoModel(settings.defaultVideoModel || 'kling-3-0')
        setSaveWebp(settings.saveImagesAsWebp !== false)
        setPrimaryBasePrompt(settings['elements:primaryBasePrompt'] || PRIMARY_DEFAULT)
        setPoseBasePrompt(settings['elements:poseBasePrompt'] || POSE_DEFAULT)
        setMoodboardBasePrompt(settings['elements:moodboardBasePrompt'] || MOODBOARD_DEFAULT)
      }
      settingsLoaded.current = true
    })
    ;(window as any).electronAPI?.assets?.webpStats?.().then(setWebpStats).catch(() => {})
    ;(window as any).electronAPI?.bridge?.getStatus?.().then(setBridgeStatus).catch(() => {})
  }, [])

  const handleConvertAllWebp = async () => {
    setConvertingWebp(true)
    setWebpResult(null)
    try {
      const res = await (window as any).electronAPI?.assets.convertAllToWebp()
      setWebpResult(res && res.converted > 0 ? `Converted ${res.converted} image${res.converted === 1 ? '' : 's'} to WebP${res.failed ? ` (${res.failed} failed)` : ''}` : 'All images are already WebP')
      const stats = await (window as any).electronAPI?.assets.webpStats()
      if (stats) setWebpStats(stats)
    } catch (err: any) {
      console.error('Convert to WebP failed:', err)
      setWebpResult(`Error: ${err?.message || String(err)}`)
    } finally {
      setConvertingWebp(false)
    }
  }

  // Auto-save base prompts on edit (debounced 2s)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveBasePrompt = useCallback((key: string, value: string) => {
    if (!settingsLoaded.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      (window as any).electronAPI?.settings.set(key, value)
    }, 2000)
  }, [])

  const handleSave = async () => {
    await (window as any).electronAPI?.settings.set('openfieldApiKey', apiKey)
    await (window as any).electronAPI?.settings.set('replicateApiKey', replicateApiKey)
    await (window as any).electronAPI?.settings.set('falApiKey', falApiKey)
    await (window as any).electronAPI?.settings.set('hfToken', hfToken)
    await (window as any).electronAPI?.settings.set('theme', theme)
    await (window as any).electronAPI?.settings.set('language', language)
    await (window as any).electronAPI?.settings.set('defaultImageModel', defaultImageModel)
    await (window as any).electronAPI?.settings.set('defaultVideoModel', defaultVideoModel)
    await (window as any).electronAPI?.settings.set('saveImagesAsWebp', saveWebp)
    await (window as any).electronAPI?.settings.set('elements:primaryBasePrompt', primaryBasePrompt)
    await (window as any).electronAPI?.settings.set('elements:poseBasePrompt', poseBasePrompt)
    await (window as any).electronAPI?.settings.set('elements:moodboardBasePrompt', moodboardBasePrompt)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    ;(window as any).electronAPI?.openfield.creditBalance().then(setCreditBalance)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-semibold text-surface-100">Settings</h1>
            <button onClick={handleSave} className="btn-primary flex items-center gap-2">
              <Save size={16} /> {saved ? 'Saved!' : 'Save Settings'}
            </button>
          </div>

          <div className="space-y-6">
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Key size={16} className="text-accent-400" />
                <h2 className="text-sm font-semibold text-surface-100">API Configuration</h2>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-surface-500 mb-1">KIE.ai API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your KIE.ai API key"
                    className="input-field"
                  />
                  <p className="text-xs text-surface-600 mt-1">Your API key is stored locally and never shared.</p>
                </div>
                <div>
                  <label className="block text-xs text-surface-500 mb-1">Replicate.com API Key</label>
                  <input
                    type="password"
                    value={replicateApiKey}
                    onChange={(e) => setReplicateApiKey(e.target.value)}
                    placeholder="r8_... (for Replicate models)"
                    className="input-field"
                  />
                  <p className="text-xs text-surface-600 mt-1">
                    <a href="https://replicate.com/account/api-tokens" target="_blank" className="text-accent-400 hover:underline">Get a token</a> for cloud models like P-Video Avatar.
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-surface-500 mb-1">fal.ai API Key</label>
                  <input
                    type="password"
                    value={falApiKey}
                    onChange={(e) => setFalApiKey(e.target.value)}
                    placeholder="FAL_KEY (for MiniMax H3 and more)"
                    className="input-field"
                  />
                  <p className="text-xs text-surface-600 mt-1">
                    <a href="https://fal.ai/dashboard/keys" target="_blank" className="text-accent-400 hover:underline">Get a key</a> for fal.ai cloud models.
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-surface-500 mb-1">HuggingFace Token</label>
                  <input
                    type="password"
                    value={hfToken}
                    onChange={(e) => setHfToken(e.target.value)}
                    placeholder="hf_... (for gated models like FLUX)"
                    className="input-field"
                  />
                  <p className="text-xs text-surface-600 mt-1">
                    <a href="https://huggingface.co/settings/tokens" target="_blank" className="text-accent-400 hover:underline">Create a token</a> with read access. Required for gated models.
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Coins size={16} className="text-amber-400" />
                <h2 className="text-sm font-semibold text-surface-100">Credits & Billing</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm text-surface-400">Available Balance</p>
                  <p className="text-2xl font-semibold text-surface-100 mt-1">
                    {creditBalance !== null ? `${creditBalance.toLocaleString()} credits` : '—'}
                  </p>
                </div>
                <button
                  onClick={() => (window as any).electronAPI?.openfield.creditBalance().then(setCreditBalance)}
                  className="btn-ghost text-xs"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Palette size={16} className="text-accent-400" />
                <h2 className="text-sm font-semibold text-surface-100">Appearance</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-surface-500 mb-1">Theme</label>
                  <select value={theme} onChange={(e) => setTheme(e.target.value)} className="input-field">
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="system">System</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-surface-500 mb-1">Language</label>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input-field">
                    <option value="en">English</option>
                    <option value="es">Español</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Monitor size={16} className="text-accent-400" />
                <h2 className="text-sm font-semibold text-surface-100">Default Models</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-surface-500 mb-1">Default Image Model</label>
                  <select value={defaultImageModel} onChange={(e) => setDefaultImageModel(e.target.value)} className="input-field">
                    <option value="flux-pro">Flux Pro</option>
                    <option value="sd3">Stable Diffusion 3</option>
                    <option value="midjourney">Midjourney (KIE)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-surface-500 mb-1">Default Video Model</label>
                  <select value={defaultVideoModel} onChange={(e) => setDefaultVideoModel(e.target.value)} className="input-field">
                    <option value="kling-v1">Kling v1</option>
                    <option value="runway-gen3">Runway Gen-3</option>
                    <option value="luma-ray2">Luma Ray 2</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Shapes size={16} className="text-accent-400" />
                <h2 className="text-sm font-semibold text-surface-100">Elements — Base Prompts</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-surface-500">Primary Render Base Prompt</label>
                    <button
                      onClick={() => { setPrimaryBasePrompt(PRIMARY_DEFAULT); saveBasePrompt('elements:primaryBasePrompt', PRIMARY_DEFAULT) }}
                      className="text-[10px] text-surface-500 hover:text-accent-400 flex items-center gap-1"
                    >
                      <RotateCcw size={10} /> Reset
                    </button>
                  </div>
                  <textarea
                    value={primaryBasePrompt}
                    onChange={(e) => { setPrimaryBasePrompt(e.target.value); saveBasePrompt('elements:primaryBasePrompt', e.target.value) }}
                    className="input-field min-h-[60px] resize-none text-xs"
                    rows={2}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-surface-500">Pose Reference Base Prompt</label>
                    <button
                      onClick={() => { setPoseBasePrompt(POSE_DEFAULT); saveBasePrompt('elements:poseBasePrompt', POSE_DEFAULT) }}
                      className="text-[10px] text-surface-500 hover:text-accent-400 flex items-center gap-1"
                    >
                      <RotateCcw size={10} /> Reset
                    </button>
                  </div>
                  <textarea
                    value={poseBasePrompt}
                    onChange={(e) => { setPoseBasePrompt(e.target.value); saveBasePrompt('elements:poseBasePrompt', e.target.value) }}
                    className="input-field min-h-[60px] resize-none text-xs"
                    rows={2}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-surface-500">Moodboard Base Prompt</label>
                    <button
                      onClick={() => { setMoodboardBasePrompt(MOODBOARD_DEFAULT); saveBasePrompt('elements:moodboardBasePrompt', MOODBOARD_DEFAULT) }}
                      className="text-[10px] text-surface-500 hover:text-accent-400 flex items-center gap-1"
                    >
                      <RotateCcw size={10} /> Reset
                    </button>
                  </div>
                  <textarea
                    value={moodboardBasePrompt}
                    onChange={(e) => { setMoodboardBasePrompt(e.target.value); saveBasePrompt('elements:moodboardBasePrompt', e.target.value) }}
                    className="input-field min-h-[60px] resize-none text-xs"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Cable size={16} className="text-accent-400" />
                <h2 className="text-sm font-semibold text-surface-100">Local MCP Bridge</h2>
                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${bridgeStatus?.running ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${bridgeStatus?.running ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  {bridgeStatus?.running ? 'Running' : 'Stopped'}
                </span>
              </div>
              <p className="text-xs text-surface-500 mb-3">
                Bridge local tipo servidor MCP (Model Context Protocol) para controlar storyboards desde agentes externos vía HTTP POST.
              </p>
              <div className="flex items-center gap-2 bg-surface-800/60 border border-surface-700 rounded-lg px-3 py-2">
                <code className="text-xs text-surface-300 flex-1 truncate">
                  {bridgeStatus?.endpoint || `http://127.0.0.1:${bridgeStatus?.port || 19877}/mcp`}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(bridgeStatus?.endpoint || `http://127.0.0.1:${bridgeStatus?.port || 19877}/mcp`)
                    setCopiedEndpoint(true)
                    setTimeout(() => setCopiedEndpoint(false), 1500)
                  }}
                  className="p-1.5 rounded-lg text-surface-500 hover:text-surface-200 hover:bg-surface-700 transition-colors"
                  title="Copy endpoint"
                >
                  {copiedEndpoint ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[10px] text-surface-500">
                <span>Puerto: <b className="text-surface-300">{bridgeStatus?.port || 19877}</b></span>
                <span>Protocolo: <b className="text-surface-300">MCP streamable HTTP (JSON-RPC)</b></span>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Folder size={16} className="text-accent-400" />
                <h2 className="text-sm font-semibold text-surface-100">Storage</h2>
              </div>
              <div>
                <label className="block text-xs text-surface-500 mb-1">Asset Library Path</label>
                <div className="flex gap-2">
                  <input value={assetPath} readOnly placeholder="Default (App Data)" className="input-field flex-1" />
                  <button className="btn-ghost">Browse</button>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <label className="block text-xs text-surface-500">Save images as WebP</label>
                  <p className="text-[10px] text-surface-600 mt-0.5">Convert PNG/JPG images to WebP on save (smaller files)</p>
                </div>
                <button
                  onClick={() => setSaveWebp(v => !v)}
                  className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${saveWebp ? 'bg-accent-500' : 'bg-surface-700'}`}
                  aria-label="Toggle WebP saving"
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${saveWebp ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="mt-4 pt-4 border-t border-surface-800 flex items-center justify-between">
                <div>
                  <label className="block text-xs text-surface-500">Convert existing images to WebP</label>
                  <p className="text-[10px] text-surface-600 mt-0.5">
                    {webpStats.pending > 0 ? `${webpStats.pending} of ${webpStats.total} images pending` : 'All images are already WebP'}
                  </p>
                  {webpResult && <p className="text-[10px] text-accent-400 mt-1">{webpResult}</p>}
                </div>
                <button
                  onClick={handleConvertAllWebp}
                  disabled={webpStats.pending === 0 || convertingWebp}
                  className="btn-ghost text-xs disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  {convertingWebp ? 'Converting...' : 'Convert All'}
                </button>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Globe size={16} className="text-accent-400" />
                <h2 className="text-sm font-semibold text-surface-100">About</h2>
              </div>
              <div className="text-sm text-surface-400 space-y-1">
                <p>Openfield v0.1.0</p>
                <p>Open Source (MIT License)</p>
                <p>Built with Electron + React + Vite</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
