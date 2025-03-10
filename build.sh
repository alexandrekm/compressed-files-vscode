#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting build process for compressed-files-visualizer extension"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js and try again."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm and try again."
    exit 1
fi

echo "📦 Installing dependencies..."
# Clean install dependencies
npm ci || npm install

echo "🔍 Checking TypeScript installation..."
# Ensure TypeScript is properly installed
if ! npm list typescript > /dev/null 2>&1; then
    echo "⚙️ Installing TypeScript..."
    npm install typescript --save-dev
fi

echo "🔍 Checking VSCE installation..."
# Ensure VSCE is properly installed
if ! npm list @vscode/vsce > /dev/null 2>&1; then
    echo "⚙️ Installing VSCE..."
    npm install @vscode/vsce --save-dev
fi

echo "🏗️ Building the extension..."
# Compile TypeScript code
npm run build

echo "📋 Running linting (if configured)..."
# Run linting if the script exists
npm run lint || echo "ℹ️ Linting not configured, skipping."

echo "📦 Packaging the extension..."
# Package the extension
npm run package

# Check if packaging was successful
if [ -f compressed-files-visualizer-*.vsix ]; then
    VSIX_FILE=$(ls -t compressed-files-visualizer-*.vsix | head -n1)
    echo "✅ Successfully built VSIX: $VSIX_FILE"
else
    echo "❌ Failed to build VSIX file"
    exit 1
fi

echo "🎉 Build process completed successfully!"