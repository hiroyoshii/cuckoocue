# iOS screenshot coverage

The `iOS widget screenshots` GitHub Actions workflow captures these images from
an iPhone 16 Pro simulator:

- `widget-small.png`, `widget-medium.png`, `widget-large.png`: every Home Screen family.
- `widget-lock-screen.png`: the accessory rectangular Lock Screen family.
- `widget-states/widget-dark-medium.png`: explicit dark widget theme.
- `widget-states/widget-large-text-medium.png`: largest in-app widget text setting.
- `widget-states/widget-empty-medium.png`: no available cues.
- `widget-states/widget-undo-small.png`: Small's inline completion and undo row.
- `widget-states/widget-undo-medium.png`: completion with the temporary undo control.
- `widget-states/widget-scoped-run-medium.png`: a Widget configured to one Android-equivalent run.
- `widget-states/widget-paged-medium.png`: content after advancing by a complete page.
- `widget-states/widget-priority-empty-medium.png`: pending items exist but none meet the default priority threshold.
- `widget-states/widget-include-quiet-medium.png`: the same data with quiet-priority items enabled.
- `widget-states/widget-actual-home-screen.png`: the Small WidgetKit extension installed on SpringBoard.
- `app/*.png`: list, detail, widget settings, new-list, and new-task screens.

Preview images and the real widget use the same production `CueWidgetCard`. Android
and iOS use the same priority, due-date, run, and task ordering. The preview host
disables interactions only so CI can render deterministic states.
