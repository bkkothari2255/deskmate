// One place that decides which character to build for a teammate.
//
// 1. Rigged hero models: if extension/models/manifest.json lists characters (GLB/FBX,
//    Mixamo-rigged, see docs/character-pipeline.md), every teammate is one of those,
//    driven by lib/mixamo.js (shared Mixamo animation clips + procedural sit/type layer).
// 2. Otherwise the built-in procedural heroes (lib/critters.js) are used.
//
// avatar.model picks the character; unknown/legacy ids map deterministically from a hash
// of the person's id, so nobody's look flickers.
import { makeCritter, speciesFor, SPECIES_LIST } from './critters.js';
import { createMixamoAvatar, loadManifest } from './mixamo.js';

const loaded = await loadManifest();
/** The rigged-model manifest, or null when the procedural heroes are used. */
export const manifest = loaded?.characters?.length ? loaded : null;
/** true → rigged models are in use (callers may use model camera framing). */
export const usingModels = !!manifest;

/**
 * Camera for the 140×180 setup preview (fov 30). Models are normalised to the same
 * height as the procedural heroes, so one framing fits both.
 */
export const PREVIEW_CAMERA = { pos: [0, 1.12, 3.75], look: [0, 0.9, 0] };

/** opts: { id (stable per person), color, avatar: { model, ... } } */
export function makeCharacter({ id = '', color, avatar = {} } = {}) {
  if (manifest) {
    const def = manifest.characters.find(c => c.id === avatar?.model);
    return createMixamoAvatar(manifest, { model: def?.id, seed: id || avatar?.model || '', color: color || def?.color });
  }
  const species = speciesFor(avatar?.model, id || avatar?.model || '');
  return makeCritter({ species, color, seed: id });
}

/** Characters people can choose from in setup: [{ id, name, color }]. */
export function characterList() {
  if (manifest) return manifest.characters.map(c => ({ id: c.id, name: c.name, color: c.color || '#8DA8C2' }));
  return SPECIES_LIST.map(c => ({ ...c }));
}
