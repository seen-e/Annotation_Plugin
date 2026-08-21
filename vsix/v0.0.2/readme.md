# Image Annotator v0.0.2

Package:

```text
image-annotator-0.0.2.vsix
```

Adds label management and a better bbox creation flow.

Changes from v0.0.1:
- Added label add/delete controls in the right `Labels` panel.
- Label changes are saved back to `annotation.yaml`.
- After drawing a bbox, a label popup appears and the user must choose a label.
- Existing bbox labels can still be changed from the dropdown.

Notes:
- Deleting a label only removes it from the available label list.
- Existing boxes keep their old label until reassigned.
