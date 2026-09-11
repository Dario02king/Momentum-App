# Third-party notices

Momentum ships one third-party asset. Its licence requires that the credit
below stays with the asset and is reachable by the end user; the app shows it
under Bereiche → Einstellungen, and this file ships with every build.

## 3D body model — `public/models/momentum-body.glb`

This work is based on "Muscular Athletic Body - Male Base Mesh"
(https://sketchfab.com/3d-models/muscular-athletic-body-male-base-mesh-a58450cb3c23429f8f7acb2c7b22b552)
by patmateee (https://sketchfab.com/patmateee) licensed under CC-BY-4.0
(http://creativecommons.org/licenses/by/4.0/)

The mesh is **modified for Momentum**:

- 7 source sub-meshes merged into one continuous surface
- re-posed from the source T-pose to a relaxed A-pose
- grid-cluster decimated 615,940 -> 40,000 triangles
- smooth area-weighted normals recomputed across the whole welded surface
- split into one primitive per Momentum muscle region (10 regions + inert)
- quantized with KHR_mesh_quantization; textures, UVs and animation removed

The original licence file and the full attribution note are kept in
`docs/design/muscle-map/license.txt` and `docs/design/muscle-map/ATTRIBUTION.txt`.
`asset.copyright` inside the GLB carries the same credit and is checked by
`npm run validate:body` on every build.

CC BY 4.0 has no ShareAlike clause; only the attribution travels with the
asset.
