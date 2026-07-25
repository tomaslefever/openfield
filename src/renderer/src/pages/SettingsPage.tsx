import { useState, useEffect } from 'react'
import { Key, Monitor, Palette, Globe, Folder, Save, Coins } from 'lucide-react'
import { useAppStore } from '../stores/app-store'

export function SettingsPage() {
  const creditBalance = useAppStore((s) => s.creditBalance)
  const setCreditBalance = useAppStore((s) => s.setCreditBalance)
  const [apiKey, setApiKey] = useState('')
  const [theme, setTheme] = useState('dark')
  const [language, setLanguage] = useState('en')
  const [defaultImageModel, setDefaultImageModel] = useState('gpt-image-2-text-to-image')
  const [defaultVideoModel, setDefaultVideoModel] = useState('kling-3-0')
  const [assetPath, setAssetPath] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    (window as any).electronAPI?.settings.getAll().then((settings: any) => {
      if (settings) {
        setApiKey(settings.kieApiKey || '')
        setTheme(settings.theme || 'dark')
        setLanguage(settings.language || 'en')
        setDefaultImageModel(settings.defaultImageModel || 'gpt-image-2-text-to-image')
        setDefaultVideoModel(settings.defaultVideoModel || 'kling-3-0')
      }
    })
  }, [])

  const handleSave = async () => {
    await (window as any).electronAPI?.settings.set('kieApiKey', apiKey)
    await (window as any).electronAPI?.settings.set('theme', theme)
    await (window as any).electronAPI?.settings.set('language', language)
    await (window as any).electronAPI?.settings.set('defaultImageModel', defaultImageModel)
    await (window as any).electronAPI?.settings.set('defaultVideoModel', defaultVideoModel)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    ;(window as any).electronAPI?.kie.creditBalance().then(setCreditBalance)
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
                  onClick={() => (window as any).electronAPI?.kie.creditBalance().then(setCreditBalance)}
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
            </div>

            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Globe size={16} className="text-accent-400" />
                <h2 className="text-sm font-semibold text-surface-100">About</h2>
              </div>
              <div className="text-sm text-surface-400 space-y-1">
                <p>KIE Studio Desktop v0.1.0</p>
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
