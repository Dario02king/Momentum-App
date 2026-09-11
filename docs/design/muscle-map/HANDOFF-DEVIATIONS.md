# Muscle map — handoff deviation log

The handoff package under `momentum-muscle-map-handoff/` is the source of
truth and is never edited. This file records every place where the production
copy differs from it, why, and which stage made the change. Anything not
listed here is verbatim.

| # | Stage | File | Deviation | Why |
|---|---|---|---|---|
| 1 | 1 | `src/features/body/muscleMeshMap.ts` | The local `MuscleGroup` declaration is deleted and the type is imported from `src/core/model`. | The file's own comment asks for exactly this. The domain type is authoritative. |
| 2 | 1 | `src/features/body/tokens.ts` | The local `MuscleGroup` declaration is deleted and imported from `src/core/model`. `MuscleState` stays declared locally, verbatim; `tokens.test.ts` asserts at compile time that it equals the body renderer's `MuscleState` and at run time that `STATE_COLOR` and `BODY_REGIONS` cover the renderer's states and the domain's groups. | Same reason as 1. The five state names already exist in `src/components/BodyRenderer`, name for name, so no translation layer is needed and none is added. |
| 3 | 1 | `tools/validate-body-glb.mjs` | Copied unchanged. Wired as `npm run validate:body`, which runs first inside `npm run build` and therefore in the Pages workflow. | The handoff asks for the validator in CI. The repo had no `tools/` directory; one is created rather than renaming the script's documented path. |
| 4 | 1 | `vite.config.ts` (integration, not a handoff file) | The service-worker plugin no longer hardcodes `/Momentum-App/`; it reads the resolved Vite `base` in `configResolved` and precaches `${base}models/momentum-body.glb` alongside the icons. | The preview repository is built with `--base=/Momentum-preview/`, and a hardcoded production base would have precached the wrong URLs there (it already did for the shell). Verified: the production build lists `/Momentum-App/models/momentum-body.glb`, the preview build `/Momentum-preview/models/momentum-body.glb`, and neither contains the other's base. |
| 5 | 1 | `package.json` | `@types/three@0.160.0` added as a dev dependency. | `muscleMeshMap.ts` imports `Object3D` and `Mesh` types from `three`; the runtime package arrives in Stage 2, the types are needed for `tsc -b` now. Pinned exact, matching the handoff's three pin. |
| 6 | 1 | `THIRD-PARTY-NOTICES.md`, `docs/design/muscle-map/license.txt`, `docs/design/muscle-map/ATTRIBUTION.txt` | Added / copied verbatim. | ATTRIBUTION.txt's checklist. |
| 7 | 2 (planned) | `react/*` | The React sources cite `docs/body-model-contract.md`, which the handoff does not contain. Those comment references will be repointed to `docs/design/muscle-map/momentum-muscle-map-handoff/HANDOFF.txt`. Comment-only; no behaviour follows from the missing file. | The document is not part of the authoritative package and is not to be reconstructed. |
| 8 | 2 (planned) | `react/BodyViewer.tsx` | The view pills "Vorne / Seite / Hinten" and the group label "Ansicht" move into the i18n catalogue with English strings. | Approved presentation-only change; the app is bilingual. |

## Not deviations

- `public/models/momentum-body.glb` is byte-identical to the handoff's
  (md5 `24fd71a7fc5249137eb6684b45336c35`).
- Every colour, number and function in `tokens.ts` is unchanged.
- The handoff's German `text` labels inside `STATE_COLOR` are kept as data
  but are **not** what the rows display; the rows keep the catalogue strings
  (`muscle.state.*`), which differ in one place ("Noch kein Vergleich").
