#!/bin/bash

# Gemini Graph (Flowchart) Split-Viewer Release Script
# 使用方法: bash release.sh

set -e

# 1. 提取版本号 (从 manifest.json)
VERSION=$(grep '"version"' manifest.json | cut -d '"' -f 4)
RELEASE_DIR="release"
ZIP_NAME="gemini-graph-viewer-v$VERSION.zip"
ZIP_PATH="$RELEASE_DIR/$ZIP_NAME"

echo "🚀 Preparing release for v$VERSION..."

# 2. 创建并清理 release 目录
mkdir -p "$RELEASE_DIR"
rm -f "$RELEASE_DIR"/*.zip

# 3. 执行打包
echo "📦 Packaging extension into $RELEASE_DIR/..."
zip -r "$ZIP_PATH" . -x "*.git*" -x "*.DS_Store*" -x "node_modules/*" -x "package.json" -x "package-lock.json" -x "release.sh" -x "README.md" -x "README_CN.md" -x "$RELEASE_DIR/*"

# 4. 检查 GitHub CLI 是否安装
if ! command -v gh &> /dev/null
then
    echo "⚠️  GitHub CLI (gh) could not be found. Please install it to support auto-release."
    echo "🔗 Install from: https://cli.github.com/"
    exit 1
fi

# 5. 检查是否已登录 GitHub
if ! gh auth status &> /dev/null
then
    echo "🔑 Please login to GitHub first using: gh auth login"
    exit 1
fi

# 6. 发布到 GitHub
echo "📤 Uploading to GitHub Release..."
gh release create "v$VERSION" "$ZIP_PATH" --title "Release v$VERSION" --notes "Release version $VERSION"

echo "✅ Success! Release v$VERSION has been created and $ZIP_PATH uploaded."
