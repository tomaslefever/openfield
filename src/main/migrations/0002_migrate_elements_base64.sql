-- Migration: 0002_migrate_elements_base64.sql
-- Convert element base64 data to asset files to reduce DB memory pressure

ALTER TABLE elements ADD COLUMN image_asset_id TEXT DEFAULT '';
ALTER TABLE elements ADD COLUMN pose_asset_id TEXT DEFAULT '';
ALTER TABLE elements ADD COLUMN video_asset_id TEXT DEFAULT '';
ALTER TABLE elements ADD COLUMN hdri_asset_id TEXT DEFAULT '';
ALTER TABLE elements ADD COLUMN reference_asset_ids TEXT DEFAULT '[]';
