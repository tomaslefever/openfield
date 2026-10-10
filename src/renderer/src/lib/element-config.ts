import { User, Box, Mountain, UserCircle } from 'lucide-react'
import type { ElementKind } from '../stores/elements-store'

export const KIND_ICONS: Record<ElementKind, typeof User> = {
  avatar: UserCircle,
  character: User,
  environment: Mountain,
  object: Box,
}

export const KIND_ORDER: ElementKind[] = ['avatar', 'character', 'environment', 'object']

export const KIND_HINTS: Record<ElementKind, string> = {
  avatar: 'Presentador o creador',
  character: 'Personaje de una historia',
  environment: 'Lugar o escenario',
  object: 'Prop o producto',
}

export interface PropertyConfig {
  label: string
  key: string
  options: string[]
}

export const ELEMENT_PROPERTIES: Record<ElementKind, PropertyConfig[]> = {
  character: [
    { label: 'Style', key: 'style', options: ['None', 'Hollywood', 'Anime', '3D (Pixar)', '3D Games', 'Cartoon', 'Comic', 'Fantasy', 'Sci-Fi'] },
    { label: 'Gender', key: 'gender', options: ['Any', 'Male', 'Female', 'Non-binary'] },
    { label: 'Age', key: 'age', options: ['Any', 'Child', 'Teen', 'Young Adult', 'Adult', 'Elder'] },
    { label: 'Body Type', key: 'bodyType', options: ['Any', 'Slim', 'Athletic', 'Average', 'Heavy', 'Muscular'] },
    { label: 'Hair Style', key: 'hairStyle', options: ['Any', 'Short', 'Long', 'Curly', 'Straight', 'Bald', 'Ponytail', 'Braided', 'Afro'] },
    { label: 'Ethnicity', key: 'ethnicity', options: ['Any', 'Caucasian', 'African', 'Asian', 'Hispanic', 'Middle Eastern', 'Indian', 'Mixed'] },
    { label: 'Outfit', key: 'outfit', options: ['Any', 'Casual', 'Formal', 'Streetwear', 'Fantasy', 'Sci-Fi', 'Medieval', 'Military', 'Business'] },
  ],
  avatar: [
    { label: 'Style', key: 'style', options: ['Realistic', 'UGC', 'Streamer', 'Adventurer', 'Anime', '3D Cartoon', 'Voxel', 'Pixel Art', 'Cyberpunk'] },
    { label: 'Format', key: 'format', options: ['Full Body', 'Half Body', 'Headshot', 'Bust'] },
    { label: 'Expression', key: 'expression', options: ['Neutral', 'Happy', 'Serious', 'Playful', 'Mysterious', 'Confident'] },
    { label: 'Background', key: 'background', options: ['None', 'Studio', 'Outdoor', 'Cyberpunk', 'Fantasy', 'Minimal', 'Gradient'] },
    { label: 'Outfit', key: 'outfit', options: ['Casual', 'Formal', 'Streetwear', 'Fantasy', 'Sci-Fi', 'Sportswear', 'Business'] },
    { label: 'Lighting', key: 'lighting', options: ['Studio', 'Natural', 'Neon', 'Dramatic', 'Soft', 'Rim Light'] },
  ],
  environment: [
    { label: 'Style', key: 'style', options: ['Realistic', 'Animation', '3D Games', '3D Pixar', 'Oil Painting', 'Watercolor', 'Sketch', 'Cyberpunk'] },
    { label: 'Type', key: 'type', options: ['Indoor', 'Outdoor', 'Urban', 'Nature', 'Fantasy', 'Sci-Fi', 'Historical', 'Abstract'] },
    { label: 'Time', key: 'time', options: ['Day', 'Night', 'Sunset', 'Dawn', 'Golden Hour', 'Overcast'] },
    { label: 'Season', key: 'season', options: ['Any', 'Spring', 'Summer', 'Autumn', 'Winter'] },
    { label: 'Mood', key: 'mood', options: ['Any', 'Peaceful', 'Mysterious', 'Epic', 'Cozy', 'Dark', 'Vibrant', 'Minimalist'] },
    { label: 'Climate', key: 'climate', options: ['Any', 'Tropical', 'Desert', 'Arctic', 'Temperate', 'Rainy', 'Foggy'] },
  ],
  object: [
    { label: 'Style', key: 'style', options: ['Realistic', 'Animation', '3D Games', '3D Pixar', 'Sketch', 'Minimalist', 'Stylized', 'Low Poly'] },
    { label: 'Type', key: 'type', options: ['Weapon', 'Tool', 'Furniture', 'Vehicle', 'Jewelry', 'Food', 'Electronic', 'Clothing', 'Artifact', 'Prop'] },
    { label: 'Material', key: 'material', options: ['Any', 'Metal', 'Wood', 'Glass', 'Fabric', 'Stone', 'Plastic', 'Organic', 'Ceramic'] },
    { label: 'Era', key: 'era', options: ['Any', 'Ancient', 'Medieval', 'Victorian', 'Modern', 'Futuristic', 'Post-Apocalyptic'] },
    { label: 'Color Palette', key: 'colorPalette', options: ['Any', 'Warm', 'Cool', 'Neutral', 'Vibrant', 'Dark', 'Pastel', 'Metallic'] },
  ],
}

/** Sets or clears one attribute ('' clears) */
export function withProperty(props: Record<string, string>, key: string, value: string): Record<string, string> {
  const next = { ...props }
  if (value === '') delete next[key]
  else next[key] = value
  return next
}
