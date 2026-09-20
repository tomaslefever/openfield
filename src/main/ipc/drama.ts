import { ipcMain } from 'electron'
import { getRawDb } from '../db'
import { getActiveWorkspaceId, getDefaultWorkspaceId } from '../services/workspace-service'
import crypto from 'crypto'

export function registerDramaIpcHandlers() {
  const raw = getRawDb()

  const handle = (channel: string, fn: (...args: any[]) => any) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, fn)
  }

  // 1. List all projects with aggregated progress metrics scoped to workspace
  handle('drama:project:list', async (_e, workspaceId?: string) => {
    try {
      const defWsId = getDefaultWorkspaceId()
      let projects: any[] = []
      if (!workspaceId || workspaceId === 'all') {
        projects = raw.prepare('SELECT * FROM drama_projects ORDER BY updated_at DESC').all() as any[]
      } else {
        projects = raw.prepare(
          "SELECT * FROM drama_projects WHERE workspace_id = ? OR ((workspace_id IS NULL OR workspace_id = '') AND ? = ?) ORDER BY updated_at DESC"
        ).all(workspaceId, workspaceId, defWsId) as any[]
      }
      
      const enriched = projects.map((p) => {
        const chars = raw.prepare('SELECT id, image_url FROM drama_characters WHERE project_id = ?').all(p.id) as any[]
        const scns = raw.prepare('SELECT id, image_url FROM drama_scenarios WHERE project_id = ?').all(p.id) as any[]
        const props = raw.prepare('SELECT id, image_url FROM drama_props WHERE project_id = ?').all(p.id) as any[]
        const shots = raw.prepare('SELECT id, keyframe_url, video_status, audio_status, dialogue_text FROM drama_shots WHERE project_id = ? ORDER BY order_index ASC').all(p.id) as any[]

        const totalChars = chars.length
        const genChars = chars.filter((c) => !!c.imageUrl).length

        const totalScns = scns.length
        const genScns = scns.filter((s) => !!s.imageUrl).length

        const totalProps = props.length
        const genProps = props.filter((pr) => !!pr.imageUrl).length

        const totalShots = shots.length
        const genKeyframes = shots.filter((sh) => !!sh.keyframeUrl).length
        const genVideos = shots.filter((sh) => sh.videoStatus === 'completed').length

        const dialogueShots = shots.filter((sh) => sh.dialogueText && sh.dialogueText.trim())
        const totalVoices = dialogueShots.length
        const genVoices = dialogueShots.filter((sh) => sh.audioStatus === 'completed').length

        const hasScript = !!(p.logline && p.logline.trim() && totalShots > 0)
        const hasFinalVideo = !!(p.finalVideoPath || p.finalVideoAssetId)

        // Stage progress percentages (5 stages, 20% each)
        const stage1Progress = hasScript ? 100 : (p.ideaPrompt && p.ideaPrompt.trim() ? 50 : 0)

        const totalStage2Items = totalChars + totalScns + totalProps
        const genStage2Items = genChars + genScns + genProps
        const stage2Progress = totalStage2Items > 0 ? Math.round((genStage2Items / totalStage2Items) * 100) : 0

        const keyframePct = totalShots > 0 ? Math.round((genKeyframes / totalShots) * 100) : 0
        const audioPct = totalVoices > 0 ? Math.round((genVoices / totalVoices) * 100) : 100
        const stage3Progress = Math.round((keyframePct + audioPct) / 2)

        const stage4Progress = totalShots > 0 ? Math.round((genVideos / totalShots) * 100) : 0
        const stage5Progress = hasFinalVideo ? 100 : 0

        // Total weighted progress (5 stages, 20% each)
        const overallProgress = Math.round(
          (stage1Progress + stage2Progress + stage3Progress + stage4Progress + stage5Progress) / 5
        )

        // Find cover image: final video thumbnail, first shot keyframe, first character, or first scenario
        let coverImage = p.thumbnailUrl || ''
        if (!coverImage && shots.find((sh) => sh.keyframeUrl)) {
          coverImage = shots.find((sh) => sh.keyframeUrl)!.keyframeUrl
        }
        if (!coverImage && chars.find((c) => c.imageUrl)) {
          coverImage = chars.find((c) => c.imageUrl)!.imageUrl
        }
        if (!coverImage && scns.find((s) => s.imageUrl)) {
          coverImage = scns.find((s) => s.imageUrl)!.imageUrl
        }
        if (!coverImage && props.find((pr) => pr.imageUrl)) {
          coverImage = props.find((pr) => pr.imageUrl)!.imageUrl
        }

        return {
          ...p,
          workspaceId: p.workspace_id || p.workspaceId || defWsId,
          contentType: p.content_type || p.contentType || 'microdrama',
          customPromptGuide: p.custom_prompt_guide || p.customPromptGuide || '',
          coverImage,
          progress: {
            overall: overallProgress,
            stage1: stage1Progress,
            stage2: stage2Progress,
            stage3: stage3Progress,
            stage4: stage4Progress,
            stage5: stage5Progress,
            stats: {
              totalChars,
              genChars,
              totalScns,
              genScns,
              totalProps,
              genProps,
              totalShots,
              genKeyframes,
              genVideos,
              totalVoices,
              genVoices,
              hasFinalVideo,
            },
          },
        }
      })

      return enriched
    } catch (err: any) {
      console.error('[Drama IPC] Error listing projects:', err)
      return []
    }
  })

  // 2. Get full project details with characters, scenarios, props, and shots
  handle('drama:project:get', async (_e, id: string) => {
    try {
      const project = raw.prepare('SELECT * FROM drama_projects WHERE id = ?').get(id) as any
      if (!project) return null

      const characters = (raw.prepare('SELECT * FROM drama_characters WHERE project_id = ? ORDER BY created_at ASC').all(id) as any[]).map((c) => ({
        ...c,
        generating: false,
      }))

      const scenarios = (raw.prepare('SELECT * FROM drama_scenarios WHERE project_id = ? ORDER BY created_at ASC').all(id) as any[]).map((s) => ({
        ...s,
        generating: false,
      }))

      const props = (raw.prepare('SELECT * FROM drama_props WHERE project_id = ? ORDER BY created_at ASC').all(id) as any[]).map((pr) => ({
        ...pr,
        generating: false,
      }))

      const shots = (raw.prepare('SELECT * FROM drama_shots WHERE project_id = ? ORDER BY order_index ASC').all(id) as any[]).map((sh) => {
        let characterNames: string[] = []
        try {
          characterNames = JSON.parse(sh.characterNames || sh.character_names || '[]')
        } catch {
          characterNames = []
        }
        let propNames: string[] = []
        try {
          propNames = JSON.parse(sh.propNames || sh.prop_names || '[]')
        } catch {
          propNames = []
        }
        return {
          ...sh,
          order: sh.orderIndex || sh.order_index,
          characterNames,
          propNames,
          keyframeGenerating: false,
        }
      })

      return {
        ...project,
        shotsCount: typeof project.shots_count === 'number' ? project.shots_count : (typeof project.shotsCount === 'number' ? project.shotsCount : 4),
        workspaceId: project.workspace_id || project.workspaceId || getDefaultWorkspaceId(),
        contentType: project.content_type || project.contentType || 'microdrama',
        customPromptGuide: project.custom_prompt_guide || project.customPromptGuide || '',
        characters,
        scenarios,
        props,
        shots,
      }
    } catch (err: any) {
      console.error('[Drama IPC] Error getting project:', id, err)
      return null
    }
  })

  // 3. Save / Upsert full project atomically
  handle('drama:project:save', async (_e, data: any) => {
    try {
      const now = Date.now()
      const projectId = data.id || crypto.randomUUID()
      const wsId = data.workspaceId || data.workspace_id || getActiveWorkspaceId()

      raw.run(
        `INSERT OR REPLACE INTO drama_projects (
          id, workspace_id, title, logline, idea_prompt, genre, tone, visual_style, content_type, aspect_ratio,
          shots_count, current_stage, llm_model, image_model, image_resolution,
          video_model, video_resolution, video_duration, voice_model, voice_id,
          script_text, final_video_asset_id, final_video_path, thumbnail_url,
          custom_prompt_guide, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        projectId,
        wsId,
        data.title || 'Microserie AI',
        data.logline || '',
        data.ideaPrompt || '',
        data.genre || 'Drama de Suspenso',
        data.tone || 'Cinematográfico',
        data.visualStyle || '',
        data.contentType || data.content_type || 'microdrama',
        data.aspectRatio || '9:16',
        typeof data.shotsCount === 'number' ? data.shotsCount : 4,
        data.currentStage || 1,
        typeof data.llmModel === 'object' ? data.llmModel?.modelId || data.llmModel?.name : data.llmModel || '',
        typeof data.imageModel === 'object' ? data.imageModel?.t2iId || data.imageModel?.name : data.imageModel || '',
        data.imageResolution || '1K',
        typeof data.videoModel === 'object' ? data.videoModel?.t2vId || data.videoModel?.name : data.videoModel || '',
        data.videoResolution || '720p',
        data.videoDuration || 5,
        typeof data.voiceModel === 'object' ? data.voiceModel?.t2aId || data.voiceModel?.name : data.voiceModel || '',
        data.voiceId || 'male-qn-qingse',
        data.script || data.scriptText || '',
        data.finalVideo?.assetId || data.finalVideoAssetId || null,
        data.finalVideo?.localPath || data.finalVideoPath || null,
        data.thumbnailUrl || null,
        data.customPromptGuide || data.custom_prompt_guide || '',
        data.createdAt || now,
        now
      )

      // Sync Characters
      if (Array.isArray(data.characters)) {
        raw.run('DELETE FROM drama_characters WHERE project_id = ?', projectId)
        for (const c of data.characters) {
          const charId = c.id || crypto.randomUUID()
          raw.run(
            `INSERT INTO drama_characters (
              id, project_id, name, role, visual_prompt, voice_id,
              image_asset_id, image_url, task_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            charId,
            projectId,
            c.name || 'Personaje',
            c.role || '',
            c.visualPrompt || '',
            c.voiceId || 'male-qn-qingse',
            c.imageAssetId || null,
            c.imageUrl || null,
            c.taskId || null,
            c.createdAt || now,
            now
          )
        }
      }

      // Sync Scenarios
      if (Array.isArray(data.scenarios)) {
        raw.run('DELETE FROM drama_scenarios WHERE project_id = ?', projectId)
        for (const s of data.scenarios) {
          const scnId = s.id || crypto.randomUUID()
          raw.run(
            `INSERT INTO drama_scenarios (
              id, project_id, name, visual_prompt,
              image_asset_id, image_url, task_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            scnId,
            projectId,
            s.name || 'Locación',
            s.visualPrompt || '',
            s.imageAssetId || null,
            s.imageUrl || null,
            s.taskId || null,
            s.createdAt || now,
            now
          )
        }
      }

      // Sync Props
      if (Array.isArray(data.props)) {
        raw.run('DELETE FROM drama_props WHERE project_id = ?', projectId)
        for (const pr of data.props) {
          const propId = pr.id || crypto.randomUUID()
          raw.run(
            `INSERT INTO drama_props (
              id, project_id, name, description, visual_prompt,
              image_asset_id, image_url, task_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            propId,
            projectId,
            pr.name || 'Objeto Clave',
            pr.description || '',
            pr.visualPrompt || '',
            pr.imageAssetId || null,
            pr.imageUrl || null,
            pr.taskId || null,
            pr.createdAt || now,
            now
          )
        }
      }

      // Sync Shots
      if (Array.isArray(data.shots)) {
        raw.run('DELETE FROM drama_shots WHERE project_id = ?', projectId)
        for (let idx = 0; idx < data.shots.length; idx++) {
          const sh = data.shots[idx]
          const shotId = sh.id || crypto.randomUUID()
          raw.run(
            `INSERT INTO drama_shots (
              id, project_id, order_index, scene_number, shot_number,
              camera_movement, character_names, scenario_name, prop_names, action_prompt,
              dialogue_text, dialogue_speaker, estimated_duration,
              keyframe_prompt, keyframe_asset_id, keyframe_url, keyframe_task_id,
              video_asset_id, video_local_path, video_url, video_task_id,
              video_status, video_progress,
              audio_asset_id, audio_local_path, audio_url, audio_task_id,
              audio_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            shotId,
            projectId,
            sh.order || idx + 1,
            sh.sceneNumber || 1,
            sh.shotNumber || idx + 1,
            sh.cameraMovement || '',
            JSON.stringify(sh.characterNames || []),
            sh.scenarioName || '',
            JSON.stringify(sh.propNames || []),
            sh.actionPrompt || '',
            sh.dialogueText || '',
            sh.dialogueSpeaker || '',
            sh.estimatedDuration || 5,
            sh.keyframePrompt || '',
            sh.keyframeAssetId || null,
            sh.keyframeUrl || null,
            sh.keyframeTaskId || null,
            sh.videoAssetId || null,
            sh.videoLocalPath || null,
            sh.videoUrl || null,
            sh.videoTaskId || null,
            sh.videoStatus || 'idle',
            sh.videoProgress || 0,
            sh.audioAssetId || null,
            sh.audioLocalPath || null,
            sh.audioUrl || null,
            sh.audioTaskId || null,
            sh.audioStatus || 'idle',
            sh.createdAt || now,
            now
          )
        }
      }

      return { success: true, id: projectId }
    } catch (err: any) {
      console.error('[Drama IPC] Error saving project:', err)
      throw err
    }
  })

  // 4. Delete project and cascading items
  handle('drama:project:delete', async (_e, id: string) => {
    try {
      raw.run('DELETE FROM drama_projects WHERE id = ?', id)
      return { success: true }
    } catch (err: any) {
      console.error('[Drama IPC] Error deleting project:', id, err)
      return { success: false, error: err?.message }
    }
  })

  // 5. Duplicate project
  handle('drama:project:duplicate', async (_e, id: string) => {
    try {
      const orig = raw.prepare('SELECT * FROM drama_projects WHERE id = ?').get(id) as any
      if (!orig) throw new Error('Proyecto no encontrado')

      const newId = crypto.randomUUID()
      const now = Date.now()
      const wsId = orig.workspace_id || getActiveWorkspaceId()

      raw.run(
        `INSERT INTO drama_projects (
          id, workspace_id, title, logline, idea_prompt, genre, tone, visual_style, content_type, aspect_ratio,
          shots_count, current_stage, llm_model, image_model, image_resolution,
          video_model, video_resolution, video_duration, voice_model, voice_id,
          script_text, final_video_asset_id, final_video_path, thumbnail_url,
          custom_prompt_guide, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId,
        wsId,
        `${orig.title} (Copia)`,
        orig.logline,
        orig.ideaPrompt,
        orig.genre,
        orig.tone,
        orig.visualStyle,
        orig.contentType || orig.content_type || 'microdrama',
        orig.aspectRatio || orig.aspect_ratio || '9:16',
        typeof orig.shots_count === 'number' ? orig.shots_count : (typeof orig.shotsCount === 'number' ? orig.shotsCount : 4),
        orig.currentStage || orig.current_stage || 1,
        orig.llmModel,
        orig.imageModel,
        orig.imageResolution,
        orig.videoModel,
        orig.videoResolution,
        orig.videoDuration,
        orig.voiceModel,
        orig.voiceId,
        orig.scriptText,
        orig.finalVideoAssetId,
        orig.finalVideoPath,
        orig.thumbnailUrl,
        orig.customPromptGuide || orig.custom_prompt_guide || '',
        now,
        now
      )

      // Duplicate characters
      const chars = raw.prepare('SELECT * FROM drama_characters WHERE project_id = ?').all(id) as any[]
      for (const c of chars) {
        raw.run(
          `INSERT INTO drama_characters (
            id, project_id, name, role, visual_prompt, voice_id,
            image_asset_id, image_url, task_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(),
          newId,
          c.name,
          c.role,
          c.visualPrompt,
          c.voiceId,
          c.imageAssetId,
          c.imageUrl,
          null,
          now,
          now
        )
      }

      // Duplicate scenarios
      const scns = raw.prepare('SELECT * FROM drama_scenarios WHERE project_id = ?').all(id) as any[]
      for (const s of scns) {
        raw.run(
          `INSERT INTO drama_scenarios (
            id, project_id, name, visual_prompt,
            image_asset_id, image_url, task_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(),
          newId,
          s.name,
          s.visualPrompt,
          s.imageAssetId,
          s.imageUrl,
          null,
          now,
          now
        )
      }

      // Duplicate props
      const props = raw.prepare('SELECT * FROM drama_props WHERE project_id = ?').all(id) as any[]
      for (const pr of props) {
        raw.run(
          `INSERT INTO drama_props (
            id, project_id, name, description, visual_prompt,
            image_asset_id, image_url, task_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(),
          newId,
          pr.name,
          pr.description,
          pr.visualPrompt,
          pr.imageAssetId,
          pr.imageUrl,
          null,
          now,
          now
        )
      }

      // Duplicate shots
      const shots = raw.prepare('SELECT * FROM drama_shots WHERE project_id = ? ORDER BY order_index ASC').all(id) as any[]
      for (const sh of shots) {
        raw.run(
          `INSERT INTO drama_shots (
            id, project_id, order_index, scene_number, shot_number,
            camera_movement, character_names, scenario_name, prop_names, action_prompt,
            dialogue_text, dialogue_speaker, estimated_duration,
            keyframe_prompt, keyframe_asset_id, keyframe_url, keyframe_task_id,
            video_asset_id, video_local_path, video_url, video_task_id,
            video_status, video_progress,
            audio_asset_id, audio_local_path, audio_url, audio_task_id,
            audio_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(),
          newId,
          sh.orderIndex || sh.order_index,
          sh.sceneNumber || sh.scene_number,
          sh.shotNumber || sh.shot_number,
          sh.cameraMovement || sh.camera_movement,
          sh.characterNames || sh.character_names,
          sh.scenarioName || sh.scenario_name,
          sh.propNames || sh.prop_names || '[]',
          sh.actionPrompt || sh.action_prompt,
          sh.dialogueText || sh.dialogue_text,
          sh.dialogueSpeaker || sh.dialogue_speaker,
          sh.estimatedDuration || sh.estimated_duration,
          sh.keyframePrompt || sh.keyframe_prompt,
          sh.keyframeAssetId || sh.keyframe_asset_id,
          sh.keyframeUrl || sh.keyframe_url,
          null,
          sh.videoAssetId || sh.video_asset_id,
          sh.videoLocalPath || sh.video_local_path,
          sh.videoUrl || sh.video_url,
          null,
          sh.videoStatus || sh.video_status,
          sh.videoProgress || sh.video_progress,
          sh.audioAssetId || sh.audio_asset_id,
          sh.audioLocalPath || sh.audio_local_path,
          sh.audioUrl || sh.audio_url,
          null,
          sh.audioStatus || sh.audio_status,
          now,
          now
        )
      }

      return { success: true, id: newId }
    } catch (err: any) {
      console.error('[Drama IPC] Error duplicating project:', id, err)
      return { success: false, error: err?.message }
    }
  })

  // 5b. Move project to another workspace
  handle('drama:project:moveWorkspace', async (_e, payload: { id: string; workspaceId: string }) => {
    try {
      const { id, workspaceId } = payload
      raw.run('UPDATE drama_projects SET workspace_id = ?, updated_at = ? WHERE id = ?', workspaceId, Date.now(), id)
      return { success: true }
    } catch (err: any) {
      console.error('[Drama IPC] Error moving project workspace:', err)
      return { success: false, error: err?.message }
    }
  })

  // 6. Fast atomic updates for single elements upon task completion
  handle('drama:character:update', async (_e, id: string, data: any) => {
    try {
      const now = Date.now()
      const sets: string[] = []
      const params: any[] = []
      for (const key of Object.keys(data)) {
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
        sets.push(`${snakeKey} = ?`)
        params.push(data[key])
      }
      sets.push('updated_at = ?')
      params.push(now)
      params.push(id)

      raw.run(`UPDATE drama_characters SET ${sets.join(', ')} WHERE id = ?`, ...params)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  })

  handle('drama:scenario:update', async (_e, id: string, data: any) => {
    try {
      const now = Date.now()
      const sets: string[] = []
      const params: any[] = []
      for (const key of Object.keys(data)) {
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
        sets.push(`${snakeKey} = ?`)
        params.push(data[key])
      }
      sets.push('updated_at = ?')
      params.push(now)
      params.push(id)

      raw.run(`UPDATE drama_scenarios SET ${sets.join(', ')} WHERE id = ?`, ...params)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  })

  handle('drama:prop:update', async (_e, id: string, data: any) => {
    try {
      const now = Date.now()
      const sets: string[] = []
      const params: any[] = []
      for (const key of Object.keys(data)) {
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
        sets.push(`${snakeKey} = ?`)
        params.push(data[key])
      }
      sets.push('updated_at = ?')
      params.push(now)
      params.push(id)

      raw.run(`UPDATE drama_props SET ${sets.join(', ')} WHERE id = ?`, ...params)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  })

  handle('drama:shot:update', async (_e, id: string, data: any) => {
    try {
      const now = Date.now()
      const sets: string[] = []
      const params: any[] = []
      for (const key of Object.keys(data)) {
        let val = data[key]
        if ((key === 'characterNames' || key === 'propNames') && Array.isArray(val)) {
          val = JSON.stringify(val)
        }
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
        sets.push(`${snakeKey} = ?`)
        params.push(val)
      }
      sets.push('updated_at = ?')
      params.push(now)
      params.push(id)

      raw.run(`UPDATE drama_shots SET ${sets.join(', ')} WHERE id = ?`, ...params)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  })
}
