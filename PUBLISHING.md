# Publishing CodeForge Extension

This guide explains how to package and publish the CodeForge VS Code extension.

## Prerequisites

1. **Node.js and npm** installed (v16.x or higher)
2. **Visual Studio Code** installed
3. **Personal Access Token (PAT)** for VS Code Marketplace
4. **Docker** installed (for testing)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install VS Code Extension Manager (vsce):
   ```bash
   npm install -g @vscode/vsce
   ```

3. Generate the PNG icon from SVG (see `icon.png.instructions.md`):
   ```bash
   convert -background none -resize 128x128 icon.svg icon.png
   ```

## Testing

Before packaging, ensure all tests pass:

```bash
# Run tests
npm test

# Test the extension locally
# Press F5 in VS Code to launch a new Extension Development Host window
```

## Packaging

### Local Package

To create a .vsix package for local distribution:

```bash
vsce package
```

This creates a file like `codeforge-0.0.1.vsix` that can be:
- Shared directly with users
- Installed using `code --install-extension codeforge-0.0.1.vsix`
- Uploaded to private extension registries

### Pre-publish Checklist

- [ ] Update version in `package.json`
- [ ] Update `CHANGELOG.md` with release notes
- [ ] Ensure `README.md` is up to date
- [ ] Verify icon.png exists (128x128 PNG)
- [ ] Run all tests: `npm test`
- [ ] Test extension manually in VS Code
- [ ] Commit all changes
- [ ] Create a git tag: `git tag v0.0.1`

## Publishing to VS Code Marketplace

### First-time Setup

1. Create a publisher account at https://marketplace.visualstudio.com/manage

2. Generate a Personal Access Token (PAT):
   - Go to https://dev.azure.com/[your-organization]/_usersSettings/tokens
   - Create new token with "Marketplace (Publish)" scope
   - Copy the token (you won't see it again!)

3. Login to vsce:
   ```bash
   vsce login [publisher-name]
   # Enter your PAT when prompted
   ```

### Publish

```bash
# Publish to VS Code Marketplace
vsce publish

# Or publish with version bump
vsce publish minor  # 0.0.1 -> 0.1.0
vsce publish major  # 0.1.0 -> 1.0.0
vsce publish patch  # 0.1.0 -> 0.1.1
```

### Automated Publishing

The GitHub Actions workflow will automatically:
1. Run tests on push/PR
2. Create releases when pushing to main
3. Publish to marketplace when a release is created (requires VSCE_PAT secret)

To set up automated publishing:
1. Add `VSCE_PAT` secret to GitHub repository settings
2. Push to main branch or create a release

## Publishing to Open VSX Registry

For VS Code compatible editors (VSCodium, Gitpod, etc.):

1. Create account at https://open-vsx.org/
2. Generate access token
3. Install ovsx CLI: `npm install -g ovsx`
4. Publish: `ovsx publish -p [token]`

## Distribution Channels

1. **VS Code Marketplace**: Official Microsoft marketplace
2. **Open VSX**: Open-source alternative marketplace
3. **Direct VSIX**: Share .vsix file directly
4. **GitHub Releases**: Automated via CI/CD
5. **Private Registry**: For enterprise distribution

## Troubleshooting

### Common Issues

1. **Missing icon.png**: Generate from icon.svg (see instructions)
2. **Tests failing**: Run `npm test` locally to debug
3. **PAT expired**: Generate new token and re-login
4. **Version conflict**: Bump version in package.json

### Validation

Before publishing, validate your extension:

```bash
vsce ls  # List files that will be included
vsce package --out test.vsix  # Test packaging
```

## Post-publish

After publishing:
1. Verify extension appears in marketplace (may take a few minutes)
2. Test installation: `code --install-extension codeforge`
3. Monitor user feedback and ratings
4. Update GitHub release notes

## Version Management

Follow semantic versioning:
- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backward compatible
- **Patch** (0.0.1): Bug fixes

Always update CHANGELOG.md with version changes!