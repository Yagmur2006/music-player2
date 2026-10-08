# Component 3D models (GLB)

Place the 3D models for simulator components in this folder.

## Expected files

| File | Component | Status |
| --- | --- | --- |
| `smd-resistor.glb` | SMD resistor (`smd_resistor_001`) | Waiting for upload by project owner |

## Requirements

- Format: **GLB** (binary glTF 2.0). `.gltf` is accepted by the loader but GLB is preferred.
- Expected structure: 3 meshes (body, two metal terminals) and materials `smd resistor` and `solder`.
- Keep texture size at most 2048 px and triangle count within the prototype budget (150k).
- The file path is referenced from `src/data/assets.json` (`models.smd_resistor_001`). If the file is
  missing, the app shows a placeholder box with a TODO label and logs an error in the console.

## Upload

Copy the file here with the exact name above, e.g.:

```
public/models/components/smd-resistor.glb
```

Then commit it to the repository branch. No code change is required.
