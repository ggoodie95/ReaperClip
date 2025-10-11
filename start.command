#!/bin/bash

# Resolve the directory containing this script and jump there
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1

# Launch the Electron app
npm start
