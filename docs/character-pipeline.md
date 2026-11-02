# Hero characters: AI-generate → Mixamo rig → Deskmate

Deskmate shows rigged character models when `extension/models/manifest.json` lists them,
and falls back to the built-in code-built heroes (`lib/critters.js`) when it doesn't.
This guide produces 8 original, production-quality heroes in about 1–2 hours.

```
 1. Generate model (Meshy / Tripo / Rodin)  →  2. Auto-rig in Mixamo  →  3. Download animations
                                     →  4. Drop files in extension/models/heroes/  →  5. Ask Claude to wire them in
```

## Before you start: licences

- **Generator:** use a paid plan, or check its current terms. Free tiers often publish your
  models under CC BY (attribution required) or forbid commercial use. Deskmate is a product,
  so you want the "you own the output / commercial use" tier.
- **Mixamo** (free with an Adobe ID) allows royalty-free use of its rigs and animations in your
  own projects. You can't redistribute the raw Mixamo animation files on their own.
- Keep the designs **original**. Don't prompt for named characters, franchises or logos.

## 1. Generate the models

Best results come from **image → 3D**. First make one front-view concept image per hero (with the
generator's text-to-image, or any image tool), then feed that image into image-to-3D. Generate
all 8 in the same session so the style matches.

**Settings** (names vary by tool, so use the closest option):

| Setting | Value |
|---|---|
| Pose | **T-pose** (arms straight out) — A-pose also works with Mixamo |
| Symmetry | on |
| Topology / polycount | quad or "remesh", **target 20–40k triangles** |
| Textures | PBR (base colour, normal, roughness), **1024 or 2048 px** |
| Export | **FBX** (preferred for Mixamo) or OBJ/GLB |

**Shared style block.** Paste this at the start of every prompt:

> Stylized 3D superhero character for a premium animated feature film. Sculpted, production-quality
> hard-surface armour and cloth detail with crisp bevels, panel lines and fabric seams. Clean PBR
> materials, subtle wear. Heroic stylized proportions: head about one quarter of total height,
> large expressive eyes, confident friendly face. Full body, standing in a T-pose with arms straight
> out to the sides, legs slightly apart, facing camera, neutral expression, empty hands. Cape (if any)
> short, ending above the waist and not touching the arms. Plain light grey background. Original
> character design, no logos.

**Heroes.** Add one of these after the style block. Each palette sits with Deskmate's
slate, ivory, walnut and sage.

1. **Titan (`titan`)** — armoured android guardian. Sleek matte slate-blue armour plates with
   brushed-steel trim, a smooth helmet with a wide dark-glass visor showing two soft-blue glowing
   eye shapes, layered angular shoulder pauldrons, segmented torso, compact back thruster pack.
2. **Nova (`nova`)** — cosmic alien hero. Lavender skin with teal markings on the cheeks, an
   elongated swept-back head with a small glowing crystal crest on the forehead, glowing teal eyes,
   a high flared collar, a fitted indigo suit with fine luminous piping, a short cape lined with a starfield.
3. **Bolt (`bolt`)** — speedster. Aerodynamic ivory helmet with a swept fin and small side wings,
   amber goggles pushed up on the brow, an open lower face with a grin, a streamlined sage-and-ivory
   suit with a zig-zag chest stripe, padded running boots.
4. **Aegis (`aegis`)** — guardian knight. Open-faced polished steel helm with cheek guards and a
   short crest, navy undersuit with a subtle hexagon weave, rounded walnut-brown leather and steel
   shoulder plates, flared gauntlets, a round ring-and-hexagon chest emblem.
5. **Shade (`shade`)** — stealth vigilante. Deep midnight hooded cowl, a matte domino mask, a
   fitted dark suit with stitched panels, a utility belt with pouches and a brushed-metal buckle,
   a short tattered cape, soft boots.
6. **Blaze (`blaze`)** — fire hero. Short spiky hair that turns into stylised flames at the tips,
   warm amber glowing eyes, a burnt-orange suit with charcoal armour plates and glowing seams,
   chest straps with a glowing buckle.
7. **Frost (`frost`)** — ice hero. Silver swept-back hair, a crown of five translucent ice
   crystals, ice-crystal shoulder shards, a pale-blue and white suit with a diagonal sash, frosted
   gloves.
8. **Gizmo (`gizmo`)** — little robot hero (stays human-sized for the desks). Rounded dome
   head with a dark screen face showing two glowing round eyes, glowing ear discs, a short antenna with
   a glowing tip, an ivory and walnut-orange chassis with panel lines, a chest panel with three buttons,
   a two-pod jetpack.

**Check before rigging:**
- Hands open, fingers apart.
- Arms clear of the body.
- Nothing floating.
- One character per file.

## 2. Auto-rig in Mixamo

1. Sign in at mixamo.com → **Upload Character** → choose the FBX/OBJ.
2. Place the markers: chin, wrists, elbows, knees, groin. Use the **Standard skeleton (65)**,
   or "No fingers" if the hands came out as mitts.
3. Check the preview animation. If the cape or flame hair stretches badly, re-generate with a shorter cape.
4. **Download** with Format **FBX Binary (.fbx)**, Pose **T-pose**, **With Skin**.
   Save as `extension/models/heroes/<id>.fbx`, for example `titan.fbx`.

## 3. Download the animations

Download these once, using any one rigged hero (all heroes share the same Mixamo skeleton,
so one set works for everybody). Search Mixamo for the term below and pick the closest match.
Tick **In Place** when it is offered. Download as **FBX Binary, Without Skin, 30 fps**, into
`extension/models/heroes/anim/` with these exact file names:

| File | Mixamo search | Used for |
|---|---|---|
| `idle.fbx` | Happy Idle / Idle | standing around |
| `walk.fbx` | Walking (In Place) | moving between desk, café and the stand-up |
| `sitIdle.fbx` | Sitting Idle | seated default |
| `typing.fbx` | Typing | working at the desk |
| `sitTalk.fbx` | Sitting Talking | calls, stand-up |
| `drink.fbx` | Drinking | coffee break, ☕ reaction |
| `wave.fbx` | Waving | 👋 |
| `celebrate.fbx` | Victory / Cheering | 🎉 👍 😂 |
| `sitCheer.fbx` | Sitting Clap | 🎉 while seated *(optional)* |
| `raise.fbx` | Raising Hand / Hand Raise | asking for help *(optional — posed in code if missing)* |
| `look.fbx` | Looking Around | idle glances *(optional)* |
| `talk.fbx` | Talking | stand-up speaker *(optional)* |

The optional ones fall back automatically. Sitting, typing and hand-raising are also posed in
code to fit the chair and keyboard exactly.

## 4. Hand over

```
extension/models/heroes/
  titan.fbx  nova.fbx  bolt.fbx  aegis.fbx  shade.fbx  blaze.fbx  frost.fbx  gizmo.fbx
  anim/idle.fbx  anim/walk.fbx  anim/sitIdle.fbx  anim/typing.fbx  …
```

Then ask Claude to "wire in the hero models". That will:
- convert and optimise them (GLB, textures ≤1024 px, aiming for ~1–3 MB per hero),
- fill in `extension/models/manifest.json` (names, colours, which material takes the person's
  tint colour, height),
- tune sitting, typing, the coffee cup and the labels,
- check the result in `test/critters.html` and the desk, then sync to the Mac app.

Until then nothing changes: with an empty manifest the app keeps the built-in heroes.

### Manifest format (for reference)

```json
{
  "base": "heroes/",
  "characters": [
    { "id": "titan", "name": "Titan", "file": "titan.glb", "color": "#7FA3C8",
      "tint": ["Accent"], "height": 1.7, "credit": "Original — generated with <tool>, rigged in Mixamo" }
  ],
  "animations": { "idle": "anim/idle.fbx", "walk": "anim/walk.fbx", "sitIdle": "anim/sitIdle.fbx",
                  "typing": "anim/typing.fbx", "drink": "anim/drink.fbx", "wave": "anim/wave.fbx" }
}
```
