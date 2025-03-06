#!/bin/bash

echo "Rebuilding extension..."
npm run clean
npm run compile

if [ -f "out/extension.js" ]; then
  echo "✅ Build successful! Extension entry point exists at out/extension.js"
  echo "Try packaging with: vsce package"
else
  echo "❌ Build failed! Extension entry point not found."
  echo "Check for compilation errors above."
fi
