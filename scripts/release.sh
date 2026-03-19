#!/bin/bash
set -euo pipefail

# Usage: ./scripts/release.sh [patch|minor|major|x.y.z]
# Default: patch

VERSION_TYPE="${1:-patch}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[release]${NC} $1"; }
warn() { echo -e "${YELLOW}[release]${NC} $1"; }
error() { echo -e "${RED}[release]${NC} $1" >&2; exit 1; }

# Check working directory is clean
if [ -n "$(git status --porcelain)" ]; then
  error "Working directory is not clean. Commit or stash changes first."
fi

# Check we're on main
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  error "Must be on main branch (currently on '$BRANCH')"
fi

# Get current version
CURRENT=$(node -e "console.log(require('./package.json').version)")
info "Current version: $CURRENT"

# Calculate new version
if [[ "$VERSION_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$VERSION_TYPE"
else
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  case "$VERSION_TYPE" in
    major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
    minor) NEW_VERSION="$MAJOR.$((MINOR + 1)).0" ;;
    patch) NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))" ;;
    *) error "Invalid version type: $VERSION_TYPE (use patch, minor, major, or x.y.z)" ;;
  esac
fi

info "New version: $NEW_VERSION"
echo ""

# Confirm
read -p "Release v$NEW_VERSION? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  warn "Aborted."
  exit 0
fi

# Update package.json
info "Updating package.json..."
cd "$ROOT_DIR"
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Update src-tauri/tauri.conf.json
info "Updating tauri.conf.json..."
node -e "
const fs = require('fs');
const conf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
conf.version = '$NEW_VERSION';
fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n');
"

# Update src-tauri/Cargo.toml
info "Updating Cargo.toml..."
sed -i'' -e "s/^version = \".*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml

# Update Cargo.lock
info "Updating Cargo.lock..."
cargo generate-lockfile --manifest-path src-tauri/Cargo.toml 2>/dev/null || true

# Verify build
info "Running build check..."
pnpm run lint
pnpm exec tsc -b
pnpm run build

# Commit and tag
info "Committing version bump..."
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: release v$NEW_VERSION"

info "Creating tag v$NEW_VERSION..."
git tag "v$NEW_VERSION" -m "Release v$NEW_VERSION"

# Push
info "Pushing to origin..."
git push origin main
git push origin "v$NEW_VERSION"

echo ""
info "🎉 Released v$NEW_VERSION!"
info ""
info "  Web:   GitHub Pages will deploy automatically"
info "  Tauri: Draft release will be created at:"
info "         https://github.com/sunya9/vrm-camera/releases"
info ""
info "  Review and publish the draft release when Tauri builds complete."
