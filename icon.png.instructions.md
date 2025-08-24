# Icon Generation Instructions

The extension icon is provided as an SVG file (`icon.svg`). To generate the required PNG icon:

## Option 1: Using ImageMagick (Command Line)
```bash
# Install ImageMagick if not already installed
# On macOS: brew install imagemagick
# On Ubuntu: sudo apt-get install imagemagick
# On Windows: Download from https://imagemagick.org/

# Convert SVG to PNG
convert -background none -resize 128x128 icon.svg icon.png
```

## Option 2: Using an Online Converter
1. Visit https://cloudconvert.com/svg-to-png
2. Upload `icon.svg`
3. Set dimensions to 128x128
4. Download as `icon.png`

## Option 3: Using VS Code Extension
1. Install the "SVG" extension by jock
2. Open `icon.svg` in VS Code
3. Right-click and select "SVG: Export PNG"
4. Save as `icon.png`

## Icon Requirements
- Size: 128x128 pixels
- Format: PNG with transparency
- File name: `icon.png` (as referenced in package.json)

The icon features:
- Docker whale symbol (representing containerization)
- Code brackets (representing development)
- Hammer/forge symbol (representing the "forge" in CodeForge)
- Dark background matching VS Code's dark theme