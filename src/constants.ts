/**
 * Application-wide constants for Cosmo Video Symphony
 * @module constants
 * 
 * All magic numbers should be defined here to ensure consistency
 * and make configuration changes easier.
 */

// Telemetry
export const TELEMETRY_INTERVAL = 2000; // ms - How often to poll system telemetry

// Layout & Grid
export const ROW_THRESHOLD_PX = 25; // px - Vertical distance to consider videos in different rows
export const ROW_MATCH_THRESHOLD = 30; // px - Max distance to match video to a row
export const LAYOUT_CALC_DELAY = 500; // ms - Delay before calculating grid layout
export const MIN_ZOOM = 1; // Minimum grid density (columns)
export const MAX_ZOOM = 16; // Maximum grid density (columns)

// Interaction
export const SWIPE_THRESHOLD = 50; // px - Minimum swipe distance to trigger action
export const DRAG_ACTIVATION_DISTANCE = 5; // px - Distance to move before drag starts

// Persistence
export const PERSISTENCE_DEBOUNCE = 500; // ms - Debounce delay for auto-save

// Video
export const FPS = 30; // Frames per second for frame-accurate seeking
export const STEP_INTERVAL = 100; // ms - Interval between frame steps when holding button
export const STEP_DELAY = 400; // ms - Delay before repeating frame steps

// Snapshot
export const SNAPSHOT_TOAST_DURATION = 8000; // ms - How long to show snapshot notification
export const SNAPSHOT_THUMBNAIL_DURATION = 8000; // ms - Duration for the toast with Open Folder button

// UI
export const IMMERSIVE_HIDE_DELAY = 3000; // ms - Delay before hiding UI in immersive mode