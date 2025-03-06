#!/bin/bash

echo "Verifying build structure..."
npm run clean
mkdir -p out

# Check if out directory exists
if [ ! -d "out" ]; then
  echo "Error: out directory doesn't exist"
  exit 1
fi

# Compile if necessary
npm run compile

# Check if compiled file exists
if [ ! -f "out/extension.js" ]; then
  echo "Error: out/extension.js doesn't exist after compilation"
  ls -la out/
  exit 1
fi

echo "Build structure verified! The output file exists at out/extension.js"
echo "Ready to package the extension"
