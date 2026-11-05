---
name: ugc-reel-creator
description: >
  UGC reel and short audiovisual content workflow for brands: a recurring character (person, pet, mascot) in a real-looking place, filmed as if on a phone. Use whenever the user wants a UGC reel, TikTok, Instagram story, social video, product-in-use clip or brand piece with a character, or asks to create references, locations or keyframes for one. Covers the brief, references (character sheet, locations, brand objects), UGC keyframes the user validates, videos generated in reference mode with the first frame + character + location, editing on the timeline and the API cost report.
---

# UGC Reel Creator

Make a short vertical reel that looks shot on a phone by a real person, with a recurring character and a brand that must stay exact in every shot. A 4-shot, 20 s reel made this way costs about USD 2 of API.

## Rules with the user

- Talk in the user's language, briefly. Prompts stay in English.
- Before spending, say model, count and estimated cost. Before any video, offer 2 or 3 models that fit the shot with their estimated cost (price per second × seconds × clips), recommend one and wait for the user's choice; pass their words as user_model_confirmation.
- **The user validates the keyframes before any video is generated.** Never skip it.
- One generation per test (count 1). Variants only when asked.
- Look at every result yourself before showing it (read the image; for video, a contact sheet of one frame per second plus one large frame of the key moment) and report honestly what went wrong: misspelled signs, motion that contradicts the story, the character's outfit or markings changing, over-acting extras.
- Fix obvious defects (garbled text, wrong framing) before presenting when it costs one or two images; otherwise ask.
- Tag everything in the library (brand + escenario / keyframe / ugc / video) and favorite what was approved.

## Step 1. Brief

Ask only what is missing:
1. The story as shots: what the character does in each one (e.g. arrives → looks around → orders → receives the product → leaves).
2. The client: real photos of the place (storefront, interior, counter), the logo (transparent PNG), packaging or products that must appear.
3. Products in shot and format (9:16, 15–20 s).

Real photos beat invented places: if the user has them, import them (import_asset) and generate from them. A photo pasted mid-turn in chat may not reach disk; ask the user to attach it again in a new message.

## Step 2. References (before any shot)

- **Character sheet** for every recurring character: Nano-Banana-2.1 (MachGen), 16:9, 4K, the user's photos as references, the user's fixed sheet layout (Openfield notes). For animals, "hair and outfit" means fur, markings, collar and harness.
- **Location plates**: one empty view per place, 16:9, 2K, no people, no animals. Pass the logo and any approved plate as references so the brand look carries over. Write the brand block into every plate prompt: exact logo wording, brand colors with hex, materials, what NOT to do (e.g. "Not dark green").
- **Brand objects**: logo, bag, product, each as its own reference image. Describe colors the client states in the prompt; a client photo whose color reads differently (a white bag that looks beige) must not be the color reference.
- Show the plates, fix what the user corrects (one edit per change), and only then move on.

## Step 3. UGC keyframes (one per shot)

Nano-Banana-2.1, 9:16, 2K, count 1. References: [character sheet, location plate, logo / objects]. Build the prompt from blocks:

- **Character lock**: "exactly the <character> of the first reference image: same face/markings, coat or outfit, accessories, at real size".
- **Action + phone camera**: who films (the owner/friend), height, angle, movement. A "drone-like" look in UGC is the phone held up high above the head (about 2.3 m) pointing down; ask for it explicitly or the model drops to eye level.
- **Direction check**: the motion must match the story. Arriving: the character walks away from the entrance toward the camera, door behind them. If the door is ahead of them they look like they are leaving.
- **People**: 1–2 per frame, never more. Understated: a slight smile at the character, a neutral glance into the camera (at the person filming, which sells realism), or ignoring it. No surprise, open mouths, pointing or hands on chest; over-acting reads fake.
- **UGC look**: "a single frame from a vertical 9:16 video shot handheld on an iPhone by the <owner>, phone main wide lens, slightly tilted horizon, casual unposed framing, a touch of motion blur on the moving subject, natural mixed lighting with mild highlight clipping, mild phone sharpening and noise. Real texture. Not a commercial photo, not cinematic, no studio lighting."
- **Text lock**: "Store text and logos spelled exactly '<brand>' and '<tagline>'; no other readable text or brand names."

Edits keep the framing and are cheaper than regenerating: references [keyframe, character sheet], prompt "Edit the first image. <one concrete change>. Keep everything else exactly as in the first image: same framing, camera angle, character, store, logos, objects, lighting and handheld phone look." Use it for expressions, removing extras, fixing a sign or a product color.

Present the keyframes as a table (shot · asset · how it came out · defects) and wait for approval.

## Step 4. Videos in reference mode (preferred)

Generate each clip with the validated keyframe passed as a **reference**, together with the character sheet and the location (and logo / objects). Order: [keyframe, character sheet, location plate, logo]. Name them in the prompt in that order:

```
Vertical 9:16 handheld smartphone video filmed by <who>. Image 1 is the exact opening shot: recreate its framing, setting, people and lighting. Image 2 is <character>: keep the exact face, markings/outfit and accessories. Image 3 is the <location>. Image 4 is the <brand> logo; every sign must read exactly "<brand>" and "<tagline>".
Subject: <the character's action, then each person's understated reaction, in order>.
Camera: <phone movement>, natural handheld micro-shake and gentle step bounce.
Environment: <ambience>.
Natural, physically plausible motion, real <animal/person> behavior. People act understated and natural. UGC smartphone look, not cinematic. No on-screen text, no music, no voice; only natural ambient sound recorded by the phone.
```

- generate: pass the four ids in reference_asset_ids and no start_frame_asset_id. With MachGen models that support it (MiniMax-H3, Seedance 2.5) this runs as reference-to-video (R2V). After queueing, get_asset on the placeholder must list the references as references, not as start_frame.
- Pinning the keyframe as the start frame (image-to-video) is allowed: when the user asks, when the model has no reference mode, or when the shot must open on exactly that frame.
- Proven model: MiniMax-H3 (MachGen), 768p, 6 s, USD 0.04/s, comes with ambient audio. 1080p returned 403 "not available for your account" on the first project; check before planning a 1080p master. Seedance 2.5 is the alternative for dialogue or longer takes (write those prompts with seedance-2-5-prompt-writer).
- Test the first shot alone; if identity and composition hold, queue the rest.
- Review each clip with a contact sheet. Typical misses: the character walks past the door instead of entering, accessories change color, a neighbouring shop sign appears. Cut around them in the edit when possible; regenerate only what the edit cannot hide.

## Step 5. Edit and export

timeline_create (aspect 9:16) → timeline_add_clips in story order with in/out trims (cut before a defect, e.g. end the arrival before the character walks past the door) → fade_in 0.3 s on the first clip, fade_out 0.6 s on the last, hard cuts in between (they feel phone-shot) → keep each clip's ambient audio. out cannot exceed the real clip length (a "6 s" clip can be 5.88 s). timeline_export → timeline_export_status, then verify the file (1080×1920, 30 fps, AAC). Offer music, captions or an end card with the logo as next steps.

## Step 6. Cost report

When the piece is done, report API cost from the catalog prices (get_service_models) and the generations of the workspace (list_assets generated_only, plus archived). Failed tasks rejected by the provider (403/402) are not charged. Reference prices (MachGen, Nov 2026): Nano-Banana-2.1 2K USD 0.048, 4K USD 0.089; MiniMax-H3 768p USD 0.04/s. Claude usage is not included.

## What did not work (avoid)

- Polished "commercial photo" keyframes for a UGC brief.
- Amazed, pointing or open-mouthed extras, or crowds.
- Inventing the store's look before seeing real photos (wrong colors, street storefront instead of a mall).
- Using a client photo as a color reference when its color reads wrong.
