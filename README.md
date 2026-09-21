# 3D Chart Viz

3D Chart Viz is a Tableau visualization extension that allows you to create simple 3D charts directly inside Tableau.

It is designed mainly for visual exploration, demonstrations, presentations, and interactive storytelling.

## Overview

With this extension, you can represent Tableau data using several 3D shapes.

Currently supported shapes include:

- Rectangular Prism
- Cylinder
- Cone
- Sphere / Lollipop

The extension also supports interactive controls such as animation, page playback, history display, trails, colors, labels, and other chart appearance settings.

## Features

- Simple 3D chart rendering
- Multiple 3D shapes
- X / Y / Z field assignment
- Page animation support
- Playback controls
- Historical mark display
- Motion trails
- Adjustable history opacity
- Custom colors
- Custom line styles
- Data labels
- Sorting controls
- Grid and axis customization
- Dark and light visualization styles

## Supported Shapes

### Rectangular Prism
A standard 3D bar-style visualization.

### Cylinder
A softer alternative to rectangular bars.

### Cone
Useful for emphasizing changes or creating more visually dynamic charts.

### Sphere / Lollipop
A combination of a vertical stem and sphere, suitable for motion-oriented or presentation-focused visualizations.

## Requirements

- Tableau Desktop
- Tableau Cloud or Tableau Server environment that supports Tableau visualization extensions

Compatibility may vary depending on the Tableau version and environment.

## How to Use

1. Add the extension to a Tableau worksheet.
2. Assign Tableau fields to the available roles:
   - X
   - Y
   - Z (optional)
   - Page (optional)
   - Detail
   - Tooltip
3. Open the extension settings.
4. Select the desired 3D shape.
5. Adjust chart appearance, labels, colors, history, trails, and animation settings.
6. Use the playback controls when a Page field is assigned.

## Animation and History

When a Page field is assigned, the extension can animate changes over time.

Available options include:

- Previous / Next
- Play
- Loop
- Playback interval
- History count
- History opacity
- Motion trail
- Trail color
- Trail style
- Trail width

These features can be useful for visualizing changes over time.

## Important Note About 3D Visualization

3D charts can be visually engaging, but perspective may make precise value comparisons more difficult than traditional 2D charts.

For analytical use cases where accurate comparison is the primary goal, consider using conventional 2D visualizations alongside this extension.

3D Chart Viz is especially suitable for:

- Demonstrations
- Presentations
- Interactive storytelling
- Visual exploration
- Experimental visualization
- Time-based animation

## Known Limitations

- Perspective can affect visual comparison.
- Large numbers of marks may reduce readability.
- Performance may depend on the number of marks and animation history.
- Some combinations of shape, camera angle, and labels may require manual adjustment.
- Behavior may differ depending on Tableau version or hosting environment.

## Privacy

3D Chart Viz is designed to visualize data provided through Tableau.

The extension does not intentionally collect or store personal information.

For details, please see:

[Privacy Policy](PRIVACY.md)

## Terms of Use

This extension is provided as-is.

Please review the Terms of Use before using the extension.

[Terms of Use](TERMS.md)

## Support

If you find a bug, have a question, or would like to suggest an improvement, please use GitHub Issues.

GitHub Issues:

https://github.com/hideis-g/3d_chart_viz/issues

## Version

Current development version:

**v1.x**

Version information will be updated as the extension evolves.

## Feedback

Feedback and suggestions are welcome.

This extension is an experimental project exploring how 3D visualization and animation can be used within Tableau.

If you are interested, feel free to give it a try.
