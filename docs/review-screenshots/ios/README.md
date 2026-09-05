# iOS screenshot coverage

The `iOS widget screenshots` GitHub Actions workflow captures these images from
an iPhone 16 Pro simulator:

- `widget-small.png`, `widget-medium.png`, `widget-large.png`: every supported family.
- `widget-states/widget-dark-medium.png`: explicit dark widget theme.
- `widget-states/widget-large-text-medium.png`: largest in-app widget text setting.
- `widget-states/widget-empty-medium.png`: no available cues.
- `widget-states/widget-undo-medium.png`: completion with the temporary undo control.
- `widget-states/widget-filtered-medium.png`: a selected footer filter.
- `widget-states/widget-paged-medium.png`: content after advancing the cue page.
- `widget-states/widget-actual-home-screen.png`: WidgetKit extension installed on SpringBoard.
- `app/*.png`: list, detail, widget settings, new-list, and new-task screens.

Preview images and the real widget use the same production `CueWidgetCard`. The
preview host disables interactions only so CI can render deterministic states.
